"use client";

import { useState } from "react";
import type { Seat } from "@/components/game/PlayingTable";

const GLYPH: Record<string, string> = { S: "♠", H: "♥", D: "♦", C: "♣" };
const suitColor = (s: string) => (s === "H" || s === "D" ? "text-suit-red" : "text-suit-black");

export interface AuctionBidRow {
    actions: Array<{ seat: string; type: 'bid' | 'pass' | 'double' | 'redouble'; level?: number; suit?: string }>;
}

interface AuctionDrawerProps {
    contract?: { level: number; suit: string; doubled?: boolean; redoubled?: boolean } | null;
    declarerSeat?: Seat | null;
    vulnerability?: { NS: boolean; EW: boolean } | null;
    bidHistory: any[];
    playerSeat: string;
}

/**
 * Collapsed single-line contract chip that expands to the full bid table.
 * Used during PLAYING / COMPLETED to save vertical space.
 */
export default function AuctionDrawer({
    contract,
    declarerSeat,
    vulnerability,
    bidHistory,
    playerSeat,
}: AuctionDrawerProps) {
    const [expanded, setExpanded] = useState(false);

    const formatContract = (c: typeof contract) => {
        if (!c) return "—";
        const symbol = GLYPH[c.suit] ?? c.suit;
        let suffix = "";
        if (c.redoubled) suffix = "xx";
        else if (c.doubled) suffix = "x";
        return `${c.level}${symbol}${suffix}`;
    };

    const formatVuln = (v: typeof vulnerability) => {
        if (!v) return "neither vul";
        if (v.NS && v.EW) return "both vul";
        if (v.NS) return "NS vul";
        if (v.EW) return "EW vul";
        return "neither vul";
    };

    // Build ordered bid history rows (4 seats per row)
    const SEAT_ORDER = ["NORTH", "EAST", "SOUTH", "WEST"];
    const SEAT_LABEL: Record<string, string> = { NORTH: "N", EAST: "E", SOUTH: "S", WEST: "W" };

    // Find dealer column index
    const dealerSeat = bidHistory[0]
        ? (() => {
            // The first bid in history was made by left of dealer — work backward
            // For simplicity, look at playerSeat as anchor; we don't have dealer
            // field here, so just use NORTH as the start (Feature 11 simplification)
            return "NORTH";
        })()
        : "NORTH";
    const dealerColIndex = SEAT_ORDER.indexOf(dealerSeat);
    const orderedSeats = SEAT_ORDER.slice(dealerColIndex).concat(SEAT_ORDER.slice(0, dealerColIndex));

    const buildBidRows = () => {
        if (!bidHistory || bidHistory.length === 0) return [];
        const rows: any[][] = [];
        let currentRow: (any | null)[] = new Array(4).fill(null);
        let col = dealerColIndex;
        bidHistory.forEach((action: any, i: number) => {
            currentRow[col] = action;
            col = (col + 1) % 4;
            if (col === dealerColIndex || i === bidHistory.length - 1) {
                rows.push([...currentRow]);
                currentRow = new Array(4).fill(null);
            }
        });
        return rows;
    };

    const formatBid = (a: any) => {
        if (!a) return "";
        if (a.type === "pass") return <span className="text-text-muted">Pass</span>;
        if (a.type === "double") return <span className="text-red-400 font-bold">Dbl</span>;
        if (a.type === "redouble") return <span className="text-accent font-bold">Rdbl</span>;
        if (a.type === "bid" && a.bid) {
            return (
                <span className={`font-bold ${suitColor(a.bid.suit)}`}>
                    {a.bid.level}
                    {GLYPH[a.bid.suit] ?? a.bid.suit}
                </span>
            );
        }
        return null;
    };

    const bidRows = buildBidRows();

    return (
        <div className="bg-surface border border-border rounded-2xl shadow-xl p-4" data-testid="auction-drawer">
            {/* Collapsed chip */}
            <button
                onClick={() => setExpanded(e => !e)}
                data-testid="auction-drawer-toggle"
                className="w-full flex items-center justify-between gap-2 text-left"
            >
                <span className="flex items-center gap-2">
                    <span className={`font-bold text-lg ${contract ? suitColor(contract.suit) : 'text-text-muted'}`}>
                        {formatContract(contract)}
                    </span>
                    {declarerSeat && (
                        <span className="text-sm text-text-muted">by {SEAT_LABEL[declarerSeat]}</span>
                    )}
                    <span className="text-xs text-text-muted">· {formatVuln(vulnerability)}</span>
                </span>
                <span className={`text-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`}>
                    ▼
                </span>
            </button>

            {/* Expanded bid table */}
            {expanded && (
                <div className="mt-3 pt-3 border-t border-border overflow-x-auto" data-testid="bid-table">
                    {bidRows.length > 0 ? (
                        <table className="w-full text-center">
                            <thead>
                                <tr>
                                    {orderedSeats.map((seat) => (
                                        <th key={seat} className="text-xs font-bold text-text-muted uppercase pb-1">
                                            {SEAT_LABEL[seat]}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {bidRows.map((row, rowIdx) => (
                                    <tr key={rowIdx} className="border-t border-border">
                                        {orderedSeats.map((seat) => {
                                            const seatColInOriginal = SEAT_ORDER.indexOf(seat);
                                            const action = row[seatColInOriginal];
                                            return (
                                                <td key={seat} className="py-1 text-sm">
                                                    {action ? formatBid(action) : ''}
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    ) : (
                        <p className="text-sm text-text-muted text-center py-2">No bids yet</p>
                    )}
                </div>
            )}
        </div>
    );
}
