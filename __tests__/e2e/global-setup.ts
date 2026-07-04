import { execSync } from 'node:child_process';

/**
 * Global setup for the Playwright e2e suite.
 *
 * The e2e specs drive real game state through the HTTP API, which requires the
 * app's Postgres database to be running and migrated. Previously this was a set
 * of manual steps (`docker start …`, `prisma db push`) that, when skipped, made
 * every API-driven spec fail — which read as "Playwright not working".
 *
 * This makes `npm run test:e2e` self-contained: bring the test DB up, wait for
 * it to accept connections, then push the schema. Idempotent and safe to re-run.
 */

function run(cmd: string) {
  execSync(cmd, { stdio: 'inherit' });
}

function waitForPostgres(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      execSync('docker compose -f docker-compose.test.yml exec -T test-db pg_isready -U test', {
        stdio: 'ignore',
      });
      return;
    } catch {
      execSync(process.platform === 'win32' ? 'ping -n 2 127.0.0.1 > NUL' : 'sleep 1', {
        stdio: 'ignore',
      });
    }
  }
  throw new Error(`Postgres did not become ready in ${timeoutMs}ms`);
}

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — check .env.test');
  }

  console.log('[e2e setup] starting test database (docker compose)…');
  run('docker compose -f docker-compose.test.yml up -d');

  console.log('[e2e setup] waiting for Postgres to accept connections…');
  waitForPostgres();

  // Plain (non-destructive) push: creates/updates the schema idempotently.
  // Specs register unique users per run, so a clean wipe isn't required — and
  // avoiding --force-reset keeps this safe to run in any environment.
  console.log('[e2e setup] pushing Prisma schema…');
  run('npx prisma db push --skip-generate');

  console.log('[e2e setup] database ready.');
}
