import { describe, it, expect } from "vitest";
import {
    TEAM_OF_SEAT,
    winningSideOf,
    applyBoardToStats,
    normalizeStats,
    winRatePct,
    type UserStats,
} from "@/lib/game/stats";

const base: UserStats = { gamesPlayed: 0, gamesWon: 0, totalScore: 0 };

describe("winningSideOf", () => {
    it("made contract → declaring side", () => {
        expect(winningSideOf({ declarer: "NORTH" }, true)).toBe("NS");
        expect(winningSideOf({ declarer: "EAST" }, true)).toBe("EW");
    });

    it("down contract → defending side", () => {
        expect(winningSideOf({ declarer: "NORTH" }, false)).toBe("EW");
        expect(winningSideOf({ declarer: "WEST" }, false)).toBe("NS");
    });

    it("no contract (passed out) → null", () => {
        expect(winningSideOf(null, false)).toBeNull();
        expect(winningSideOf(null, true)).toBeNull();
    });
});

describe("applyBoardToStats", () => {
    it("declarer N makes contract → N & S win, gamesPlayed +1 for the seat", () => {
        const winner = winningSideOf({ declarer: "NORTH" }, true); // NS
        const n = applyBoardToStats(base, "NORTH", winner, 420);
        const e = applyBoardToStats(base, "EAST", winner, 420);
        expect(n).toEqual({ gamesPlayed: 1, gamesWon: 1, totalScore: 420 });
        // loser side banks 0 under winner-positive
        expect(e).toEqual({ gamesPlayed: 1, gamesWon: 0, totalScore: 0 });
    });

    it("declarer E goes down → defenders NS win and bank the penalty magnitude", () => {
        const winner = winningSideOf({ declarer: "EAST" }, false); // NS
        // Winner-positive: magnitude is passed regardless of which bucket held it.
        const n = applyBoardToStats(base, "NORTH", winner, 100); // NS won → +100
        const e = applyBoardToStats(base, "EAST", winner, 100);  // EW lost → +0
        expect(n.gamesWon).toBe(1);
        expect(e.gamesWon).toBe(0);
        expect(n.gamesPlayed).toBe(1);
        expect(e.gamesPlayed).toBe(1);
        expect(n.totalScore).toBe(100);  // defenders bank the positive penalty
        expect(e.totalScore).toBe(0);    // declarer banks 0, not the negative penalty
    });

    it("scoreMagnitude is always taken as absolute value", () => {
        const winner = winningSideOf({ declarer: "NORTH" }, true); // NS
        // Even if a negative magnitude is passed (defensive), the winner banks abs.
        const n = applyBoardToStats(base, "NORTH", winner, -50);
        expect(n.totalScore).toBe(50);
    });

    it("passed-out board (null winner) → played +1, won unchanged for all", () => {
        for (const seat of ["NORTH", "SOUTH", "EAST", "WEST"] as const) {
            const s = applyBoardToStats(base, seat, null, 0);
            expect(s.gamesPlayed).toBe(1);
            expect(s.gamesWon).toBe(0);
        }
    });

    it("accumulates totalScore across boards without mutating input", () => {
        const frozen: UserStats = { gamesPlayed: 2, gamesWon: 1, totalScore: 500 };
        // Winner (NS) banks the magnitude; the input object must not be mutated.
        const next = applyBoardToStats(frozen, "SOUTH", "NS", 130);
        expect(next).toEqual({ gamesPlayed: 3, gamesWon: 2, totalScore: 630 });
        // input untouched
        expect(frozen).toEqual({ gamesPlayed: 2, gamesWon: 1, totalScore: 500 });
    });

    it("losing side accumulates 0 totalScore across multiple boards", () => {
        let ew: UserStats = { gamesPlayed: 0, gamesWon: 0, totalScore: 0 };
        // NS wins two boards; EW (loser) banks 0 each time but gamesPlayed climbs.
        ew = applyBoardToStats(ew, "EAST", "NS", 400);
        ew = applyBoardToStats(ew, "EAST", "NS", 100);
        expect(ew).toEqual({ gamesPlayed: 2, gamesWon: 0, totalScore: 0 });
    });

    it("TEAM_OF_SEAT maps seats to sides", () => {
        expect(TEAM_OF_SEAT.NORTH).toBe("NS");
        expect(TEAM_OF_SEAT.SOUTH).toBe("NS");
        expect(TEAM_OF_SEAT.EAST).toBe("EW");
        expect(TEAM_OF_SEAT.WEST).toBe("EW");
    });
});

describe("normalizeStats", () => {
    it("fills defaults for missing / null input", () => {
        expect(normalizeStats(null)).toEqual({ gamesPlayed: 0, gamesWon: 0, totalScore: 0 });
        expect(normalizeStats({ gamesPlayed: 3 })).toEqual({ gamesPlayed: 3, gamesWon: 0, totalScore: 0 });
    });
});

describe("winRatePct", () => {
    it("null when no games played", () => {
        expect(winRatePct({ gamesPlayed: 0, gamesWon: 0, totalScore: 0 })).toBeNull();
    });
    it("rounds to nearest integer percent", () => {
        expect(winRatePct({ gamesPlayed: 3, gamesWon: 2, totalScore: 0 })).toBe(67);
        expect(winRatePct({ gamesPlayed: 4, gamesWon: 1, totalScore: 0 })).toBe(25);
    });
});
