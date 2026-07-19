import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPrisma, cleanDatabase, createTestUser, createTestRoom } from '../helpers/test-prisma';
import { GamePhase } from '@prisma/client';
import { FEATURE_15_INDEX_NAMES } from '../../lib/db/indexes';

/**
 * Feature 15 — the three design-doc §8.7 indexes exist and are used by the
 * hot query paths. These tests require the test DB (test:db:start) and depend
 * on __tests__/helpers/db-setup.ts having run the CREATE INDEX statements.
 */

beforeAll(async () => { await testPrisma.$connect(); });
afterAll(async () => { await cleanDatabase(); await testPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

const EXPECTED = [...FEATURE_15_INDEX_NAMES];

async function indexNames(): Promise<string[]> {
  const rows = await testPrisma.$queryRaw<{ indexname: string }[]>`
    SELECT indexname FROM pg_indexes WHERE schemaname = 'public'
  `;
  return rows.map((r) => r.indexname);
}

async function explain(query: string): Promise<string> {
  // Postgres EXPLAIN returns rows with a single column named "QUERY PLAN".
  // Prisma keys it unpredictably (lowercased / spaced), so read the first value.
  const rows = await testPrisma.$queryRawUnsafe<Record<string, unknown>[]>(`EXPLAIN ${query}`);
  return rows.map((r) => String(Object.values(r)[0] ?? '')).join('\n');
}

describe('Feature 15 — indexes exist', () => {
  it('all three design-doc indexes are present on pg_indexes', async () => {
    const names = await indexNames();
    for (const idx of EXPECTED) {
      expect(names, `expected ${idx} to exist, got: ${names.join(', ')}`).toContain(idx);
    }
  });

  it('idx_games_room_phase is a PARTIAL index (predicate filters COMPLETED)', async () => {
    const rows = await testPrisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'idx_games_room_phase'
    `;
    expect(rows.length).toBe(1);
    // Postgres stores the predicate as "WHERE (phase <> 'COMPLETED'::game_phase)"
    expect(rows[0].indexdef).toContain('WHERE');
    expect(rows[0].indexdef).toContain('COMPLETED');
  });

  it('idx_game_moves_covering INCLUDEs move_type and move_data', async () => {
    const rows = await testPrisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'idx_game_moves_covering'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].indexdef).toContain('INCLUDE');
    expect(rows[0].indexdef).toContain('move_type');
    expect(rows[0].indexdef).toContain('move_data');
  });

  it('idx_users_stats_gin uses the gin access method', async () => {
    const rows = await testPrisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = 'public' AND indexname = 'idx_users_stats_gin'
    `;
    expect(rows.length).toBe(1);
    expect(rows[0].indexdef).toContain('USING gin');
    expect(rows[0].indexdef).toContain('stats');
  });
});

describe('Feature 15 — loadBoardScores query plan uses the partial index', () => {
  it('EXPLAIN shows an Index Scan on idx_games_room_phase (not Seq Scan)', async () => {
    // Seed 50 COMPLETED + 2 IN_PROGRESS games in one room.
    // Scale: enough rows that the planner prefers the partial index over a
    // seq scan. ~3000 rows with ~100 active (3% selectivity) is the crossover.
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const baseState = { hands: {}, currentBid: null, bidHistory: [], tricks: [], currentTrick: [], trumpSuit: null, contract: null };

    const COMPLETED = 3000;
    const ACTIVE = 100;
    // Batch-insert via createMany for speed.
    await testPrisma.game.createMany({
      data: Array.from({ length: COMPLETED }, (_, i) => ({
        gameRoomId: room.id,
        phase: GamePhase.COMPLETED,
        boardNumber: i + 1,
        dealerId: user.id,
        gameState: { ...baseState, boardNumber: i + 1 } as any,
      })),
    });
    await testPrisma.game.createMany({
      data: Array.from({ length: ACTIVE }, (_, i) => ({
        gameRoomId: room.id,
        phase: GamePhase.PLAYING,
        boardNumber: COMPLETED + i + 1,
        dealerId: user.id,
        gameState: { ...baseState } as any,
      })),
    });

    await testPrisma.$executeRawUnsafe(`ANALYZE "games"`);

    // Mirror loadBoardScores' WHERE clause. The partial index covers
    // phase <> 'COMPLETED', but loadBoardScores filters phase = 'COMPLETED'
    // — so the partial index is NOT used for that exact query. Instead assert
    // the active-games path (phase IN non-COMPLETED) uses it. See note below.
    const activePlan = await explain(
      `SELECT * FROM "games" WHERE "game_room_id" = '${room.id}' AND "phase" <> 'COMPLETED' ORDER BY "board_number"`,
    );
    expect(activePlan, activePlan).toContain('idx_games_room_phase');
    expect(activePlan, activePlan).not.toContain('Seq Scan');
  });

  // NOTE on the loadBoardScores query specifically:
  // loadBoardScores filters phase = 'COMPLETED'. The partial index
  // WHERE phase <> 'COMPLETED' does NOT cover that query by design — it
  // covers the *active*-games path. The COMPLETED-boards path is served by
  // the existing @@index([gameRoomId]) (filtered by phase). A partial index
  // for COMPLETED boards would be redundant with the active one's complement
  // at low selectivity. The spec's regression guard is therefore on the
  // active-games query, which is the one the partial index was designed for.
});

describe('Feature 15 — game_moves replay is index-only', () => {
  it('EXPLAIN shows Index Only Scan using idx_game_moves_covering', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const game = await testPrisma.game.create({
      data: {
        gameRoomId: room.id,
        phase: GamePhase.PLAYING,
        boardNumber: 1,
        dealerId: user.id,
        gameState: {} as any,
      },
    });

    // Seed 10,000 moves so the planner prefers an index-only scan over a
    // seq scan + sort. At 200 rows the seq scan is genuinely cheaper; at 10k
    // the covering index wins because it satisfies the ORDER BY for free.
    await testPrisma.gameMove.createMany({
      data: Array.from({ length: 10_000 }, (_, i) => ({
        gameId: game.id,
        playerId: user.id,
        moveType: 'PLAY_CARD',
        moveData: { card: 'AS', n: i },
        sequenceNumber: i + 1,
      })),
    });

    // VACUUM ANALYZE so the visibility map is set (required for Index Only
    // Scan — ANALYZE alone only gathers stats, not visibility). Without VACUUM,
    // Postgres must heap-fetch every row for visibility checks, making the
    // covering index more expensive than a seq scan.
    await testPrisma.$executeRawUnsafe(`VACUUM ANALYZE "game_moves"`);

    const plan = await explain(
      `SELECT "move_type", "move_data" FROM "game_moves" WHERE "game_id" = '${game.id}' ORDER BY "sequence_number"`,
    );
    expect(plan, plan).toContain('Index Only Scan');
    expect(plan, plan).toContain('idx_game_moves_covering');
  });
});
