/**
 * Feature 15 — the three design-doc §8.7 indexes that Prisma `@@index` cannot
 * express (partial / covering / GIN).
 *
 * This repo uses `prisma db push` (not the migrations workflow), and
 * `prisma/migrations/` is gitignored. So this module is the single tracked
 * source of truth for these indexes. It's applied:
 *   - to the test DB by __tests__/helpers/db-setup.ts after `db push`, and
 *   - to production by `npm run db:indexes` (see package.json).
 *
 * A raw-SQL migration mirror lives at
 * prisma/migrations/<timestamp>_add_missing_indexes/migration.sql for
 * environments that prefer the migrate workflow; it is not tracked by git.
 */

export const FEATURE_15_INDEXES = [
  // 1. Partial composite for active-games-in-a-room lookups.
  //    `phase` is a Postgres enum; the predicate filters COMPLETED boards.
  `CREATE INDEX IF NOT EXISTS "idx_games_room_phase"
     ON "games" ("game_room_id", "phase")
     WHERE "phase" <> 'COMPLETED'`,
  // 2. GIN on users.stats for future leaderboard / JSONB-containment queries.
  `CREATE INDEX IF NOT EXISTS "idx_users_stats_gin"
     ON "users" USING gin ("stats")`,
  // 3. Covering index for game_moves replay (index-only scan).
  `CREATE INDEX IF NOT EXISTS "idx_game_moves_covering"
     ON "game_moves" ("game_id", "sequence_number")
     INCLUDE ("move_type", "move_data")`,
] as const;

export const FEATURE_15_INDEX_NAMES = [
  'idx_games_room_phase',
  'idx_users_stats_gin',
  'idx_game_moves_covering',
] as const;
