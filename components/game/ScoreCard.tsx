"use client";

import type { ScoreBreakdown } from "@/lib/game/scoring";
import type { Seat } from "@/components/game/PlayingTable";

interface BoardScore {
    boardNumber: number;
    scoreNS: number;
    scoreEW: number;
    contract?: { level: number; suit: string; doubled?: boolean; redoubled?: boolean } | null;
    result?: { contractMade: boolean; overtricks: number; undertricks: number } | null;
}

interface ScoreCardProps {
    boardNumber: number;
    totalBoards?: number;
    scoreNS: number;
    scoreEW: number;
    result: ScoreBreakdown | null;
    contract?: { level: number; suit: string; doubled?: boolean; redoubled?: boolean } | null;
    declarerName?: string;
    vulnerability?: { NS: boolean; EW: boolean };
    boardScores?: BoardScore[];
    hasNextBoard?: boolean;
    onNextBoard?: () => void;
    onBackToDashboard?: () => void;
}

const GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };

const suitColor = (s: string) =>
    s === "H" || s === "D" ? "text-suit-red" : "text-suit-black";

const formatContract = (c: ScoreCardProps["contract"]) => {
    if (!c) return "—";
    const symbol = GLYPH[c.suit] ?? c.suit;
    let suffix = "";
    if (c.redoubled) suffix = "xx";
    else if (c.doubled) suffix = "x";
    return `${c.level}${symbol}${suffix}`;
};

const formatResult = (r: ScoreBreakdown | null) => {
    if (!r) return "—";
    if (r.contractMade) {
        if (r.overtricks > 0) return `made +${r.overtricks}`;
        if (r.overtricks === 0) return "made";
        return "made"; // shouldn't happen
    }
    return `down ${r.undertricks}`;
};

const formatPoints = (r: ScoreBreakdown) => {
    return r.points > 0 ? `+${r.points}` : `${r.points}`;
};

const formatVuln = (v: ScoreCardProps["vulnerability"]) => {
    if (!v) return "neither vul";
    if (v.NS && v.EW) return "both vul";
    if (v.NS) return "NS vul";
    if (v.EW) return "EW vul";
    return "neither vul";
};

/**
 * Rich score card for a completed board.
 * Shows: contract result line, score breakdown (collapsed), cumulative
 * per-board table, next-board countdown.
 */
export default function ScoreCard({
    boardNumber,
    totalBoards,
    scoreNS,
    scoreEW,
    result,
    contract,
    declarerName,
    vulnerability,
    boardScores = [],
    hasNextBoard = false,
    onNextBoard,
    onBackToDashboard,
}: ScoreCardProps) {
    return (
        <div data-testid="score-card" className="bg-surface border border-border rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-accent mb-2">🏁 Board {boardNumber} Complete</h2>
            {totalBoards && (
                <p className="text-sm text-text-muted mb-4">Board {boardNumber} of {totalBoards}</p>
            )}

            {/* Contract result line */}
            <div className="flex flex-wrap items-baseline gap-3 p-4 bg-surface-elevated border border-border rounded-xl mb-4" data-testid="score-contract-line">
                <span className="text-xl font-bold text-foreground">
                    {formatContract(contract)}
                </span>
                {declarerName && (
                    <span className="text-sm text-text-muted">by {declarerName}</span>
                )}
                <span className="text-sm text-text-muted">·</span>
                <span className={`text-sm font-semibold ${result?.contractMade ? 'text-green-400' : 'text-red-400'}`}>
                    {formatResult(result)}
                </span>
                {result && (
                    <>
                        <span className="text-sm text-text-muted">·</span>
                        <span className="text-lg font-bold text-foreground">{formatPoints(result)}</span>
                    </>
                )}
                <span className="text-xs text-text-muted ml-auto">
                    ({formatVuln(vulnerability)})
                </span>
            </div>

            {/* Score tally */}
            <div className="flex justify-center gap-12 mb-6">
                <div className="text-center">
                    <div className="text-sm font-semibold text-accent uppercase mb-1">NS</div>
                    <div className="text-3xl font-bold text-foreground">{scoreNS}</div>
                </div>
                <div className="text-center">
                    <div className="text-sm font-semibold text-suit-red uppercase mb-1">EW</div>
                    <div className="text-3xl font-bold text-foreground">{scoreEW}</div>
                </div>
            </div>

            {/* Cumulative board scores */}
            {boardScores.length > 0 && (
                <div className="mt-6">
                    <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wide mb-2">Session Results</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm" data-testid="board-scores-table">
                            <thead>
                                <tr className="text-text-muted">
                                    <th className="text-left py-1">Board</th>
                                    <th className="text-left py-1">Contract</th>
                                    <th className="text-left py-1">Result</th>
                                    <th className="text-right py-1">NS</th>
                                    <th className="text-right py-1">EW</th>
                                    <th className="text-right py-1">NS Total</th>
                                    <th className="text-right py-1">EW Total</th>
                                </tr>
                            </thead>
                            <tbody>
                                {(() => {
                                    let nsTotal = 0, ewTotal = 0;
                                    return boardScores.map((b) => {
                                        nsTotal += b.scoreNS;
                                        ewTotal += b.scoreEW;
                                        return (
                                            <tr key={b.boardNumber} className={`border-t border-border ${b.boardNumber === boardNumber ? 'bg-accent/10' : ''}`}>
                                                <td className="py-1.5 font-semibold">{b.boardNumber}</td>
                                                <td className={`py-1.5 ${suitColor(b.contract?.suit ?? '')}`}>
                                                    {formatContract(b.contract)}
                                                </td>
                                                <td className={`py-1.5 text-xs ${b.result?.contractMade ? 'text-green-400' : 'text-red-400'}`}>
                                                    {b.result ? (b.result.contractMade ? (b.result.overtricks > 0 ? `+${b.result.overtricks}` : '✓') : `-${b.result.undertricks}`) : '—'}
                                                </td>
                                                <td className="py-1.5 text-right">{b.scoreNS}</td>
                                                <td className="py-1.5 text-right">{b.scoreEW}</td>
                                                <td className="py-1.5 text-right font-semibold text-accent">{nsTotal}</td>
                                                <td className="py-1.5 text-right font-semibold text-suit-red">{ewTotal}</td>
                                            </tr>
                                        );
                                    });
                                })()}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Action buttons */}
            <div className="mt-6 flex justify-center gap-4">
                {hasNextBoard ? (
                    <p className="text-sm text-accent animate-pulse" data-testid="next-board-countdown">
                        ⏳ Next board starting shortly…
                    </p>
                ) : (
                    <button
                        onClick={onBackToDashboard}
                        data-testid="back-to-dashboard"
                        className="px-6 py-3 bg-accent text-background font-semibold rounded-lg hover:bg-accent-muted transition-colors"
                    >
                        Back to Dashboard
                    </button>
                )}
            </div>
        </div>
    );
}
