import { BidSuit } from './bidding';

export interface ContractScoring {
    level: number;
    suit: BidSuit;
    doubled: boolean;
    redoubled: boolean;
}

/**
 * Feature 10: full breakdown returned by calculateScore() so the ScoreCard
 * can show the result line and per-line breakdown.
 */
export interface ScoreBreakdown {
    tricksNeeded: number;
    tricksTaken: number;
    overtricks: number;
    undertricks: number;
    contractMade: boolean;
    doubled: boolean;
    redoubled: boolean;
    trickScore: number;
    overtrickBonus: number;
    gameBonus: number;
    slamBonus: number;
    doubleBonus: number;
    penalty: number;
    points: number;            // signed: + for declarer, − for defenders
}

export interface ScoringResult {
    scoreNS: number;
    scoreEW: number;
    breakdown: {
        trickScore: number;
        overtricks: number;
        gameBonus: number;
        slamBonus: number;
        doubleBonus: number;
        penalty: number;
    };
    /** Feature 10: full breakdown (when generated from a finished contract). */
    result?: ScoreBreakdown;
}

/**
 * Calculate score for a Bridge contract following ACBL duplicate bridge scoring
 */
export function calculateScore(
    contract: ContractScoring,
    tricksWon: number,
    declarer: 'NS' | 'EW',
    vulnerability: { NS: boolean; EW: boolean }
): ScoringResult {
    const requiredTricks = 6 + contract.level;
    const isVulnerable = vulnerability[declarer];
    const overtricks = tricksWon - requiredTricks;
    const undertricks = requiredTricks - tricksWon;

    const breakdown = {
        trickScore: 0,
        overtricks: 0,
        gameBonus: 0,
        slamBonus: 0,
        doubleBonus: 0,
        penalty: 0,
    };

    let score = 0;

    if (overtricks >= 0) {
        // Contract made

        // 1. Trick score
        const basePoints = calculateBasePoints(contract.level, contract.suit);
        breakdown.trickScore = contract.doubled
            ? basePoints * 2
            : contract.redoubled
                ? basePoints * 4
                : basePoints;
        score += breakdown.trickScore;

        // 2. Overtrick bonus
        if (overtricks > 0) {
            if (contract.doubled) {
                breakdown.overtricks = overtricks * (isVulnerable ? 200 : 100);
            } else if (contract.redoubled) {
                breakdown.overtricks = overtricks * (isVulnerable ? 400 : 200);
            } else {
                const overtrickValue =
                    contract.suit === 'C' || contract.suit === 'D' ? 20 : 30;
                breakdown.overtricks = overtricks * overtrickValue;
            }
            score += breakdown.overtricks;
        }

        // 3. Game bonus
        if (breakdown.trickScore >= 100) {
            breakdown.gameBonus = isVulnerable ? 500 : 300;
        } else {
            breakdown.gameBonus = 50; // Partscore bonus
        }
        score += breakdown.gameBonus;

        // 4. Slam bonus
        if (contract.level === 6) {
            breakdown.slamBonus = isVulnerable ? 750 : 500; // Small slam
        } else if (contract.level === 7) {
            breakdown.slamBonus = isVulnerable ? 1500 : 1000; // Grand slam
        }
        score += breakdown.slamBonus;

        // 5. Double/Redouble bonus
        if (contract.doubled) {
            breakdown.doubleBonus = 50;
            score += 50;
        }
        if (contract.redoubled) {
            breakdown.doubleBonus = 100;
            score += 100;
        }
    } else {
        // Contract failed (undertricks)
        if (contract.doubled) {
            let penalty = 0;
            for (let i = 0; i < Math.abs(undertricks); i++) {
                if (i === 0) {
                    penalty += isVulnerable ? 200 : 100;
                } else if (i <= 2) {
                    penalty += isVulnerable ? 300 : 200;
                } else {
                    penalty += 300;
                }
            }
            if (contract.redoubled) penalty *= 2;
            breakdown.penalty = penalty;
            score = -penalty;
        } else {
            breakdown.penalty = Math.abs(undertricks) * (isVulnerable ? 100 : 50);
            score = -breakdown.penalty;
        }
    }

    // Feature 10: build the full breakdown so ScoreCard can render details.
    const fullBreakdown: ScoreBreakdown = {
        tricksNeeded: requiredTricks,
        tricksTaken: tricksWon,
        overtricks: overtricks > 0 ? overtricks : 0,
        undertricks: undertricks > 0 ? undertricks : 0,
        contractMade: overtricks >= 0,
        doubled: contract.doubled,
        redoubled: contract.redoubled,
        trickScore: breakdown.trickScore,
        overtrickBonus: breakdown.overtricks,
        gameBonus: breakdown.gameBonus,
        slamBonus: breakdown.slamBonus,
        doubleBonus: breakdown.doubleBonus,
        penalty: breakdown.penalty,
        points: score,
    };

    return declarer === 'NS'
        ? { scoreNS: score, scoreEW: 0, breakdown, result: fullBreakdown }
        : { scoreNS: 0, scoreEW: score, breakdown, result: fullBreakdown };
}

/**
 * Calculate base points for a contract
 */
function calculateBasePoints(level: number, suit: BidSuit): number {
    if (suit === 'NT') {
        return 40 + (level - 1) * 30;
    }
    return suit === 'C' || suit === 'D' ? level * 20 : level * 30;
}
