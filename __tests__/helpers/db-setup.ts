import { execSync } from 'child_process';
import { config } from 'dotenv';
import path from 'path';

export async function setup() {
  config({ path: path.resolve(process.cwd(), '.env.test') });

  try {
    execSync('npx prisma db push --skip-generate', {
      env: { ...process.env },
      stdio: 'pipe',
      timeout: 60_000,
    });
    console.log('[db-setup] Schema pushed to test DB');
  } catch (err: any) {
    console.error('[db-setup] prisma db push failed:', err.stderr?.toString() ?? err.message);
    throw err;
  }
}

export async function teardown() {
  // DB container is managed externally; nothing to clean up here
}
