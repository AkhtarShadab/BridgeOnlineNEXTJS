import { execSync } from 'node:child_process';
import net from 'node:net';

/**
 * Global setup for the Playwright e2e suite.
 *
 * The e2e specs drive real game state through the HTTP API, which requires the
 * app's Postgres database to be running and migrated.
 *
 * This is **probe-first** so it works in every environment:
 *  - CI provides Postgres as a GitHub `services:` container already bound to the
 *    DATABASE_URL port — we detect it and DO NOT touch docker (running
 *    `docker compose up` there fails with "port already allocated").
 *  - Locally, if nothing is listening we bring up docker-compose.test.yml and
 *    wait for it; if a container is already up we reuse it.
 *
 * In all cases we finish by pushing the Prisma schema (idempotent).
 */

const COMPOSE = 'docker compose -f docker-compose.test.yml';

function run(cmd: string) {
  execSync(cmd, { stdio: 'inherit' });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Host + port that DATABASE_URL points at (Postgres default 5432 if unset). */
function dbTarget(): { host: string; port: number } {
  const url = new URL(process.env.DATABASE_URL as string);
  return { host: url.hostname, port: Number(url.port) || 5432 };
}

/** True if something is accepting TCP connections at host:port. */
function tcpReachable(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const finish = (ok: boolean) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForReachable(host: string, port: number, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await tcpReachable(host, port)) return;
    await sleep(1000);
  }
  throw new Error(`Postgres at ${host}:${port} did not become ready in ${timeoutMs}ms`);
}

/** Run a command, retrying — used for the schema push so a DB that is listening
 *  but not yet ready to answer queries (brief startup window) isn't fatal. */
async function runWithRetry(cmd: string, attempts = 6, delayMs = 2000) {
  for (let i = 1; i <= attempts; i++) {
    try {
      run(cmd);
      return;
    } catch (err) {
      if (i === attempts) throw err;
      console.log(`[e2e setup] "${cmd}" failed (attempt ${i}/${attempts}); retrying in ${delayMs}ms…`);
      await sleep(delayMs);
    }
  }
}

export default async function globalSetup() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set — check .env.test (or the CI env)');
  }
  const { host, port } = dbTarget();

  if (await tcpReachable(host, port)) {
    // A database is already listening (CI service container, or a locally
    // running container). Use it as-is — never invoke docker here.
    console.log(`[e2e setup] database already reachable at ${host}:${port} — skipping docker compose.`);
  } else {
    console.log(`[e2e setup] nothing on ${host}:${port} — starting test database (docker compose)…`);
    run(`${COMPOSE} up -d`);
    console.log('[e2e setup] waiting for Postgres to accept connections…');
    await waitForReachable(host, port);
  }

  console.log('[e2e setup] pushing Prisma schema…');
  await runWithRetry('npx prisma db push --skip-generate');

  console.log('[e2e setup] database ready.');
}
