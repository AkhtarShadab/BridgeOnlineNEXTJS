import { execSync } from 'child_process';
import { config } from 'dotenv';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { FEATURE_15_INDEXES } from '../../lib/db/indexes';

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

  // Feature 15: `prisma db push` does not apply raw-SQL-only indexes (partial /
  // covering / GIN), so re-create the three design-doc §8.7 indexes here. Uses
  // IF NOT EXISTS so this is idempotent across re-runs. SQL lives in
  // lib/db/indexes.ts so production (npm run db:indexes) applies the same DDL.
  const prisma = new PrismaClient({
    datasources: { db: { url: process.env.DATABASE_URL } },
  });
  try {
    for (const ddl of FEATURE_15_INDEXES) {
      await prisma.$executeRawUnsafe(ddl);
    }
    console.log(`[db-setup] Feature 15 indexes ensured (${FEATURE_15_INDEXES.length})`);
  } catch (err: any) {
    console.error('[db-setup] index creation failed:', err.message);
    throw err;
  } finally {
    await prisma.$disconnect();
  }
}

export async function teardown() {
  // DB container is managed externally; nothing to clean up here
}
