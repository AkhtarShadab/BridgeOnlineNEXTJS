/**
 * Feature 15 — apply the three design-doc §8.7 indexes to the production DB.
 *
 * This repo uses `prisma db push` (not the migrations workflow), and
 * `prisma/migrations/` is gitignored, so the canonical index DDL lives in
 * `lib/db/indexes.ts` and is applied here via the Prisma client.
 *
 * Run after `npm run db:push` (or against an existing DB). Idempotent — uses
 * `CREATE INDEX IF NOT EXISTS`, so re-running is safe.
 *
 *   npm run db:indexes
 *
 * Exits non-zero on failure so CI/CD can detect a failed apply.
 */
import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { FEATURE_15_INDEXES, FEATURE_15_INDEX_NAMES } from '../lib/db/indexes';

async function main() {
  config();
  const prisma = new PrismaClient();
  try {
    for (const ddl of FEATURE_15_INDEXES) {
      await prisma.$executeRawUnsafe(ddl);
    }
    console.log(`[db:indexes] Applied ${FEATURE_15_INDEXES.length} indexes: ${FEATURE_15_INDEX_NAMES.join(', ')}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[db:indexes] FAILED:', err);
  process.exit(1);
});
