"use client";

import { useState } from "react";

interface BidLevel {
    level: number;
    suit: string;
}

interface BiddingBoxProps {
    onBid: (bid: { type: string; level?: number; suit?: string }) => void;
    currentBid: BidLevel | null; // highest bid so far — bids ≤ this are blocked
    disabled?: boolean;          // true when it's not this player's turn
}

const SUITS = [
    { abbr: 'C', symbol: '♣', label: 'Clubs', color: 'text-gray-800 dark:text-gray-200' },
    { abbr: 'D', symbol: '♦', label: 'Diamonds', color: 'text-red-600' },
    { abbr: 'H', symbol: '♥', label: 'Hearts', color: 'text-red-600' },
    { abbr: 'S', symbol: '♠', label: 'Spades', color: 'text-gray-800 dark:text-gray-200' },
    { abbr: 'NT', symbol: 'NT', label: 'No Trump', color: 'text-blue-600' },
] as const;

const SUIT_ORDER = ['C', 'D', 'H', 'S', 'NT'];
const LEVELS = [1, 2, 3, 4, 5, 6, 7];

/** Returns true when (level, suit) is strictly higher than currentBid */
function isBidValid(level: number, suit: string, currentBid: BidLevel | null): boolean {
    if (!currentBid) return true;
    if (level > currentBid.level) return true;
    if (level === currentBid.level) {
        return SUIT_ORDER.indexOf(suit) > SUIT_ORDER.indexOf(currentBid.suit);
    }
    return false;
}

/** Convert a suit abbreviation to its display symbol */
function suitSymbol(abbr: string): string {
    return SUITS.find(s => s.abbr === abbr)?.symbol ?? abbr;
}

export default function BiddingBox({ onBid, currentBid, disabled }: BiddingBoxProps) {
    const handleBid = (level: number, suit: string) => {
        if (!isBidValid(level, suit, currentBid)) return;
        onBid({ type: 'bid', level, suit });
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4 text-center">
                Bidding Box
            </h2>

            {/* Current highest bid indicator */}
            {currentBid ? (
                <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/30 border border-amber-300 dark:border-amber-600 rounded-lg text-center">
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wide mb-1">
                        Highest Bid — must bid higher than:
                    </p>
                    <p className="text-3xl font-bold text-amber-700 dark:text-amber-300">
                        {currentBid.level}{suitSymbol(currentBid.suit)}
                    </p>
                </div>
            ) : (
                <div className="mb-4 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-700 rounded-lg text-center">
                    <p className="text-sm text-emerald-600 dark:text-emerald-400">
                        No bids yet — any bid is valid
                    </p>
                </div>
            )}

            {/* Suit header row */}
            <div className="grid grid-cols-6 gap-1 mb-1">
                <div /> {/* level label column */}
                {SUITS.map(suit => (
                    <div key={suit.abbr} className={`text-center text-sm font-bold ${suit.color}`}>
                        {suit.symbol}
                    </div>
                ))}
            </div>

            {/* Bid grid — 7 levels × 5 suits */}
            <div className="space-y-1 mb-6">
                {LEVELS.map(level => (
                    <div key={level} className="grid grid-cols-6 gap-1 items-center">
                        {/* Level number */}
                        <div className="text-center font-bold text-gray-600 dark:text-gray-400 text-sm">
                            {level}
                        </div>

                        {/* Suit buttons */}
                        {SUITS.map(suit => {
                            const valid = isBidValid(level, suit.abbr, currentBid);
                            const blocked = !valid;
                            const isExactCurrentBid =
                                currentBid?.level === level && currentBid?.suit === suit.abbr;

                            return (
                                <button
                                    key={`${level}-${suit.abbr}`}
                                    onClick={() => handleBid(level, suit.abbr)}
                                    disabled={disabled || blocked}
                                    title={
                                        blocked
                                            ? `${level}${suit.symbol} is lower than or equal to the current bid`
                                            : `Bid ${level}${suit.symbol}`
                                    }
                                    className={`
                                        h-10 rounded-md font-bold text-base transition-all duration-150 border-2
                                        ${isExactCurrentBid
                                            // highlight the exact current bid
                                            ? 'bg-amber-100 dark:bg-amber-800 border-amber-400 dark:border-amber-500 opacity-60 cursor-not-allowed'
                                            : blocked
                                                // clearly blocked bids
                                                ? 'bg-gray-100 dark:bg-gray-700/40 border-gray-200 dark:border-gray-700 opacity-30 cursor-not-allowed'
                                                : disabled
                                                    // valid but not player's turn
                                                    ? 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-600 opacity-50 cursor-not-allowed'
                                                    // valid & clickable
                                                    : 'bg-white dark:bg-gray-700 border-gray-300 dark:border-gray-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/40 hover:border-emerald-500 hover:scale-105 cursor-pointer shadow-sm'
                                        }
                                    `}
                                >
                                    <span className={blocked ? 'text-gray-400 dark:text-gray-600' : suit.color}>
                                        {suit.symbol}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                ))}
            </div>

            {/* Action buttons: Pass / Double / Redouble */}
            <div className="grid grid-cols-3 gap-3">
                <button
                    onClick={() => onBid({ type: 'pass' })}
                    disabled={disabled}
                    className="py-3 bg-yellow-400 hover:bg-yellow-500 text-gray-900 font-bold rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                    Pass
                </button>
                <button
                    onClick={() => onBid({ type: 'double' })}
                    disabled={disabled || !currentBid}
                    title={!currentBid ? 'No bid to double' : 'Double the current contract'}
                    className="py-3 bg-red-500 hover:bg-red-600 text-white font-bold rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                    Dbl
                </button>
                <button
                    onClick={() => onBid({ type: 'redouble' })}
                    disabled={disabled || !currentBid}
                    title={!currentBid ? 'No bid to redouble' : 'Redouble'}
                    className="py-3 bg-red-800 hover:bg-red-900 text-white font-bold rounded-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
                >
                    Rdbl
                </button>
            </div>
        </div>
    );
}
