/**
 * Feature 14 — Player stats math (pure, no Prisma, no side effects).
 *
 * Kept dependency-free so it is unit-testable without a database. The
 * transactional persistence lives in the play route (updatePlayerStatsForBoard).
 */

export type Seat = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
export type Side = 'NS' | 'EW';
export type UserStats = { gamesPlayed: number; gamesWon: number; totalScore: number };

export const TEAM_OF_SEAT: Record<Seat, Side> = {
    NORTH: 'NS',
    SOUTH: 'NS',
    EAST: 'EW',
    WEST: 'EW',
};

export const DEFAULT_STATS: UserStats = { gamesPlayed: 0, gamesWon: 0, totalScore: 0 };

/**
 * Which side won the board. A passed-out board has no contract → null (no winner).
 * Contract made → declaring side wins; contract down → defenders win.
 */
export function winningSideOf(
    contract: { declarer: Seat } | null,
    contractMade: boolean,
): Side | null {
    if (!contract) return null;
    const declarerSide = TEAM_OF_SEAT[contract.declarer];
    return contractMade ? declarerSide : declarerSide === 'NS' ? 'EW' : 'NS';
}

/**
 * Pure: returns a NEW stats object for one seat after one board. Does not mutate
 * the input. Uses **winner-positive** semantics: the board's `scoreMagnitude`
 * (|score|, always ≥ 0) is added to `totalScore` ONLY for the winning side;
 * the losing side adds 0. This is intentionally decoupled from the raw
 * `scoreNS` / `scoreEW` bucket convention in `lib/game/scoring.ts`, where a
 * failed declarer's bucket holds the negative penalty and the defenders'
 * bucket is 0 — under winner-positive the defenders instead bank the
 * positive penalty magnitude and the declarer banks 0.
 *
 * A passed-out board (winningSide === null) adds no score and no win, but the
 * caller decides whether to invoke this at all (Decision a: passed-out boards
 * do not count toward gamesPlayed, so the play route never calls this for them).
 */
export function applyBoardToStats(
    prev: UserStats,
    seat: Seat,
    winningSide: Side | null,
    scoreMagnitude: number,
): UserStats {
    const wonThisBoard = winningSide !== null && TEAM_OF_SEAT[seat] === winningSide;
    return {
        gamesPlayed: prev.gamesPlayed + 1,
        gamesWon: prev.gamesWon + (wonThisBoard ? 1 : 0),
        totalScore: prev.totalScore + (wonThisBoard ? Math.abs(scoreMagnitude) : 0),
    };
}

/** Coerce a possibly-partial/legacy stats blob into a complete UserStats. */
export function normalizeStats(raw: unknown): UserStats {
    const s = (raw ?? {}) as Partial<UserStats>;
    return {
        gamesPlayed: Number(s.gamesPlayed ?? 0),
        gamesWon: Number(s.gamesWon ?? 0),
        totalScore: Number(s.totalScore ?? 0),
    };
}

/** Win rate as an integer percentage, or null when no games have been played. */
export function winRatePct(stats: UserStats): number | null {
    if (stats.gamesPlayed <= 0) return null;
    return Math.round((stats.gamesWon / stats.gamesPlayed) * 100);
}
