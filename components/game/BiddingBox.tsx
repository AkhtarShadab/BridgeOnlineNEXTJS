"use client";

// ── Types ─────────────────────────────────────────────────────────────────────

type Seat = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
type Team = 'NS' | 'EW';

interface BidLevel { level: number; suit: string; }
interface BidEntry {
    seat: Seat;
    type: 'bid' | 'pass' | 'double' | 'redouble';
    bid?: { level: number; suit: string };
}
interface Vulnerability { NS: boolean; EW: boolean; }

interface BiddingBoxProps {
    onBid: (bid: { type: string; level?: number; suit?: string }) => void;
    currentBid: BidLevel | null;
    bidHistory?: BidEntry[];
    vulnerability?: Vulnerability;
    playerSeat?: string;   // current player's seat (NORTH/SOUTH/EAST/WEST)
    disabled?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const SUITS = [
    { abbr: 'C', symbol: '♣', color: 'text-suit-black' },
    { abbr: 'D', symbol: '♦', color: 'text-suit-red' },
    { abbr: 'H', symbol: '♥', color: 'text-suit-red' },
    { abbr: 'S', symbol: '♠', color: 'text-suit-black' },
    { abbr: 'NT', symbol: 'NT', color: 'text-accent' },
] as const;

const SUIT_ORDER = ['C', 'D', 'H', 'S', 'NT'];
const LEVELS = [1, 2, 3, 4, 5, 6, 7];

// ── Bridge helpers ────────────────────────────────────────────────────────────

const seatTeam = (seat: string): Team =>
    seat === 'NORTH' || seat === 'SOUTH' ? 'NS' : 'EW';

function suitSymbol(abbr: string) {
    return SUITS.find(s => s.abbr === abbr)?.symbol ?? abbr;
}
function suitColor(abbr: string) {
    return SUITS.find(s => s.abbr === abbr)?.color ?? '';
}

function isBidValid(level: number, suit: string, currentBid: BidLevel | null): boolean {
    if (!currentBid) return true;
    if (level > currentBid.level) return true;
    if (level === currentBid.level)
        return SUIT_ORDER.indexOf(suit) > SUIT_ORDER.indexOf(currentBid.suit);
    return false;
}

/**
 * Determine whether Double / Redouble are legally available for the current player.
 *
 * Rules (ACBL):
 *  - DOUBLE   is valid when the last non-pass call was a bid by an opponent team AND
 *              it has not yet been doubled/redoubled.
 *  - REDOUBLE is valid when the last non-pass call was a double by an opponent team.
 *  - Both are unavailable when the last non-pass call was made by own team.
 */
function getDoubleState(
    bidHistory: BidEntry[],
    playerSeat: string,
): { canDouble: boolean; canRedouble: boolean; doubledBy: Team | null; redoubled: boolean } {
    const myTeam = seatTeam(playerSeat);

    // Walk backward to find the last non-pass action
    const last = [...bidHistory].reverse().find(b => b.type !== 'pass');

    if (!last) return { canDouble: false, canRedouble: false, doubledBy: null, redoubled: false };

    const callerTeam = seatTeam(last.seat);
    const isOpponent = callerTeam !== myTeam;

    if (last.type === 'bid' && isOpponent)
        return { canDouble: true, canRedouble: false, doubledBy: null, redoubled: false };

    if (last.type === 'double' && isOpponent)
        return { canDouble: false, canRedouble: true, doubledBy: callerTeam, redoubled: false };

    // Redoubled by us means we hold the redouble, but opponents can't double again
    if (last.type === 'redouble')
        return { canDouble: false, canRedouble: false, doubledBy: callerTeam, redoubled: true };

    return { canDouble: false, canRedouble: false, doubledBy: null, redoubled: false };
}

/**
 * Determine the current doubling status of the contract (for score display).
 *
 * Returns: 'none' | 'doubled' | 'redoubled'
 * Resets to 'none' whenever a new bid is placed.
 */
function contractDoubleStatus(bidHistory: BidEntry[]): 'none' | 'doubled' | 'redoubled' {
    // Walk backward, stopping at the last actual 'bid'
    let status: 'none' | 'doubled' | 'redoubled' = 'none';
    for (let i = bidHistory.length - 1; i >= 0; i--) {
        const entry = bidHistory[i];
        if (entry.type === 'bid') break;           // new bid clears doubles
        if (entry.type === 'redouble') { status = 'redoubled'; break; }
        if (entry.type === 'double') { status = 'doubled'; break; }
    }
    return status;
}

// ── Score engine ──────────────────────────────────────────────────────────────

function trickValue(suit: string): number {
    if (suit === 'NT') return 0; // handled separately
    return suit === 'H' || suit === 'S' ? 30 : 20;
}

function contractPoints(level: number, suit: string, modifier: 'none' | 'doubled' | 'redoubled'): number {
    const base = suit === 'NT' ? 40 + (level - 1) * 30 : level * trickValue(suit);
    if (modifier === 'doubled') return base * 2;
    if (modifier === 'redoubled') return base * 4;
    return base;
}

function bridgeScore(
    level: number,
    suit: string,
    vulnerable: boolean,
    overtricks: number,
    modifier: 'none' | 'doubled' | 'redoubled' = 'none',
): number {
    const cp = contractPoints(level, suit, modifier);
    const isGame = cp >= 100;

    const bonus = isGame ? (vulnerable ? 500 : 300) : 50;

    let slamBonus = 0;
    if (level === 6) slamBonus = vulnerable ? 750 : 500;
    if (level === 7) slamBonus = vulnerable ? 1500 : 1000;

    // Insult bonus for making a doubled/redoubled contract
    const insult = modifier === 'doubled' ? 50 : modifier === 'redoubled' ? 100 : 0;

    // Overtrick value
    let otPoints = 0;
    if (modifier === 'none') {
        const otVal = suit === 'NT' ? 30 : trickValue(suit);
        otPoints = overtricks * otVal;
    } else if (modifier === 'doubled') {
        otPoints = overtricks * (vulnerable ? 200 : 100);
    } else {
        otPoints = overtricks * (vulnerable ? 400 : 200);
    }

    return cp + bonus + slamBonus + insult + otPoints;
}

const maxOvertricks = (level: number) => 7 - level;

// ── Score Panel ───────────────────────────────────────────────────────────────

function ScorePanel({
    bidHistory,
    vulnerability,
}: {
    bidHistory: BidEntry[];
    vulnerability: Vulnerability;
}) {
    const bids = bidHistory.filter(b => b.type === 'bid' && b.bid);
    const nsLastBid = [...bids].reverse().find(b => b.seat === 'NORTH' || b.seat === 'SOUTH')?.bid ?? null;
    const ewLastBid = [...bids].reverse().find(b => b.seat === 'EAST' || b.seat === 'WEST')?.bid ?? null;
    const modifier = contractDoubleStatus(bidHistory);

    if (!nsLastBid && !ewLastBid) {
        return (
            <div className="mb-4 p-3 bg-surface border border-border rounded-lg text-center">
                <p className="text-xs text-text-muted font-semibold uppercase tracking-wide">
                    Score Calculator
                </p>
                <p className="text-sm text-text-muted mt-1">
                    No bids yet — scores will appear here
                </p>
            </div>
        );
    }

    const teams: { label: string; bid: BidLevel | null; vul: boolean }[] = [
        { label: 'NS', bid: nsLastBid, vul: vulnerability.NS },
        { label: 'EW', bid: ewLastBid, vul: vulnerability.EW },
    ];

    // The modifier applies to the current highest bid (the one that won the auction so far)
    // We show modified scores for the team whose bid equals currentBid
    const getModifier = (team: 'NS' | 'EW', bid: BidLevel | null): 'none' | 'doubled' | 'redoubled' => {
        if (!bid) return 'none';
        // Check if this team's bid is the latest actual bid (i.e., it's the current contract)
        const lastBidEntry = [...bids].reverse()[0];
        if (!lastBidEntry) return 'none';
        const lastBidTeam = seatTeam(lastBidEntry.seat);
        return lastBidTeam === team ? modifier : 'none';
    };

    return (
        <div className="mb-4">
            <p className="text-xs font-semibold text-text-muted uppercase tracking-wide text-center mb-2">
                Score Calculator
                {modifier !== 'none' && (
                    <span className={`ml-2 px-1.5 py-0.5 rounded text-white text-xs ${modifier === 'doubled' ? 'bg-red-500' : 'bg-red-800'}`}>
                        {modifier === 'doubled' ? 'DBL' : 'RDBL'}
                    </span>
                )}
            </p>
            <div className="grid grid-cols-2 gap-2">
                {teams.map(({ label, bid, vul }) => {
                    const teamKey = label as Team;
                    const mod = getModifier(teamKey, bid);
                    return (
                        <div
                            key={label}
                            className={`rounded-lg p-2 border ${bid
                                    ? vul
                                        ? 'bg-red-900/20 border-red-700'
                                        : 'bg-surface-elevated border-border'
                                    : 'bg-surface border-border'
                                }`}
                        >
                            <div className="flex items-center justify-between mb-1">
                                <span className="font-bold text-sm text-foreground">{label}</span>
                                <div className="flex items-center gap-1">
                                    {mod === 'doubled' && <span className="text-xs bg-red-500 text-white px-1 rounded">X</span>}
                                    {mod === 'redoubled' && <span className="text-xs bg-red-800 text-white px-1 rounded">XX</span>}
                                    {vul && <span className="text-xs text-red-400 font-semibold">VUL</span>}
                                </div>
                            </div>

                            {!bid ? (
                                <p className="text-xs text-text-muted text-center py-1">—</p>
                            ) : (
                                <>
                                    <div className="flex items-center gap-1 mb-2">
                                        <span className="text-xs text-text-muted">Last bid:</span>
                                        <span className={`text-sm font-bold ${suitColor(bid.suit)}`}>
                                            {bid.level}{suitSymbol(bid.suit)}
                                        </span>
                                    </div>
                                    <div className="space-y-0.5">
                                        <div className="flex justify-between text-xs">
                                            <span className="text-text-muted font-medium">Made</span>
                                            <span className="font-bold text-foreground">
                                                {bridgeScore(bid.level, bid.suit, vul, 0, mod)}
                                            </span>
                                        </div>
                                        {Array.from({ length: maxOvertricks(bid.level) }, (_, i) => i + 1).map(ot => (
                                            <div key={ot} className="flex justify-between text-xs">
                                                <span className="text-text-muted">+{ot}</span>
                                                <span className="text-foreground">
                                                    {bridgeScore(bid.level, bid.suit, vul, ot, mod)}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BiddingBox({
    onBid,
    currentBid,
    bidHistory = [],
    vulnerability = { NS: false, EW: false },
    playerSeat = '',
    disabled,
}: BiddingBoxProps) {

    const { canDouble, canRedouble } = playerSeat
        ? getDoubleState(bidHistory, playerSeat)
        : { canDouble: false, canRedouble: false };

    return (
        <div className="bg-surface border border-border rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-foreground mb-4 text-center">
                Bidding Box
            </h2>

            <ScorePanel bidHistory={bidHistory} vulnerability={vulnerability} />

            {/* Suit column headers */}
            <div className="grid grid-cols-6 gap-1 mb-1">
                <div />
                {SUITS.map(suit => (
                    <div key={suit.abbr} className={`text-center text-sm font-bold ${suit.color}`}>
                        {suit.symbol}
                    </div>
                ))}
            </div>

            {/* Bid grid */}
            <div className="space-y-1 mb-6">
                {LEVELS.map(level => (
                    <div key={level} className="grid grid-cols-6 gap-1 items-center">
                        <div className="text-center font-bold text-text-muted text-sm">
                            {level}
                        </div>
                        {SUITS.map(suit => {
                            const valid = isBidValid(level, suit.abbr, currentBid);
                            const isCurrentBid = currentBid?.level === level && currentBid?.suit === suit.abbr;
                            return (
                                <button
                                    key={`${level}-${suit.abbr}`}
                                    onClick={() => { if (valid) onBid({ type: 'bid', level, suit: suit.abbr }); }}
                                    disabled={disabled || !valid}
                                    title={!valid ? `${level}${suit.symbol} ≤ current bid` : `Bid ${level}${suit.symbol}`}
                                    className={`
                                        h-10 rounded-md font-bold text-base transition-all duration-150 border-2
                                        ${isCurrentBid
                                            ? 'bg-accent/10 border-accent opacity-60 cursor-not-allowed'
                                            : !valid
                                                ? 'bg-surface border-border opacity-25 cursor-not-allowed'
                                                : disabled
                                                    ? 'bg-surface border-border opacity-50 cursor-not-allowed'
                                                    : 'bg-surface border-border hover:bg-surface-elevated hover:border-accent hover:scale-105 cursor-pointer shadow-sm'
                                        }
                                    `}
                                >
                                    <span className={!valid ? 'text-text-muted opacity-50' : suit.color}>
                                        {suit.symbol}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Action buttons */}
            <div className="grid grid-cols-3 gap-3">
                {/* Pass — always available when it's your turn */}
                <button
                    onClick={() => onBid({ type: 'pass' })}
                    disabled={disabled}
                    className="py-3 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                    Pass
                </button>

                {/* Double — only against opponent's last bid */}
                <button
                    onClick={() => onBid({ type: 'double' })}
                    disabled={disabled || !canDouble}
                    title={
                        !canDouble
                            ? 'Double is only allowed against the opponent\'s last bid'
                            : 'Double the opponent\'s bid (×2 trick value)'
                    }
                    className="py-3 bg-red-500 hover:bg-red-600 disabled:bg-red-500 text-white font-bold rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                    Dbl ×
                </button>

                {/* Redouble — only after opponent doubled your team's bid */}
                <button
                    onClick={() => onBid({ type: 'redouble' })}
                    disabled={disabled || !canRedouble}
                    title={
                        !canRedouble
                            ? 'Redouble is only allowed after the opponent has doubled'
                            : 'Redouble (×4 trick value)'
                    }
                    className="py-3 bg-red-800 hover:bg-red-900 disabled:bg-red-800 text-white font-bold rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                    Rdbl ××
                </button>
            </div>

            {/* Contextual hint for double/redouble state */}
            {(canDouble || canRedouble) && !disabled && (
                <p className="mt-2 text-xs text-center text-text-muted">
                    {canDouble && '💡 You may Double the opponent\'s bid'}
                    {canRedouble && '💡 You may Redouble (opponent doubled your team\'s bid)'}
                </p>
            )}
        </div>
    );
}
