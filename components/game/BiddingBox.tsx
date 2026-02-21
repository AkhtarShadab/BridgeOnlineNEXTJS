"use client";

import { useState } from "react";

interface BiddingBoxProps {
    onBid: (bid: { type: string; level?: number; suit?: string }) => void;
    currentBid: { level: number; suit: string } | null;
    disabled?: boolean;
}

export default function BiddingBox({ onBid, currentBid, disabled }: BiddingBoxProps) {
    const [selectedLevel, setSelectedLevel] = useState<number | null>(null);

    const suits = [
        { name: 'Clubs', abbr: 'C', symbol: '♣', color: 'text-gray-900' },
        { name: 'Diamonds', abbr: 'D', symbol: '♦', color: 'text-red-600' },
        { name: 'Hearts', abbr: 'H', symbol: '♥', color: 'text-red-600' },
        { name: 'Spades', abbr: 'S', symbol: '♠', color: 'text-gray-900' },
        { name: 'No Trump', abbr: 'NT', symbol: 'NT', color: 'text-blue-600' },
    ];

    const levels = [1, 2, 3, 4, 5, 6, 7];

    const isBidValid = (level: number, suit: string) => {
        if (!currentBid) return true;
        if (level > currentBid.level) return true;
        if (level === currentBid.level) {
            const suitOrder = ['C', 'D', 'H', 'S', 'NT'];
            return suitOrder.indexOf(suit) > suitOrder.indexOf(currentBid.suit);
        }
        return false;
    };

    const handleBid = (level: number, suit: string) => {
        if (!isBidValid(level, suit)) {
            alert("Bid must be higher than current bid");
            return;
        }
        onBid({ type: 'bid', level, suit });
    };

    return (
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4 text-center">
                Bidding Box
            </h2>

            {currentBid && (
                <div className="mb-4 p-3 bg-emerald-100 dark:bg-emerald-900 rounded-lg text-center">
                    <p className="text-sm text-gray-600 dark:text-gray-400">Current Bid:</p>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                        {currentBid.level}{currentBid.suit}
                    </p>
                </div>
            )}

            {/* Bidding Grid */}
            <div className="mb-6">
                <div className="grid grid-cols-5 gap-2">
                    {levels.map(level => (
                        <div key={level} className="col-span-5">
                            <div className="grid grid-cols-6 gap-2">
                                <div className="flex items-center justify-center font-bold text-gray-700 dark:text-gray-300">
                                    {level}
                                </div>
                                {suits.map(suit => {
                                    const valid = isBidValid(level, suit.abbr);
                                    return (
                                        <button
                                            key={`${level}-${suit.abbr}`}
                                            onClick={() => handleBid(level, suit.abbr)}
                                            disabled={disabled || !valid}
                                            className={`
                                                p-3 rounded-lg font-bold text-xl transition-all duration-200
                                                ${valid && !disabled
                                                    ? 'bg-white dark:bg-gray-700 border-2 border-gray-300 dark:border-gray-600 hover:bg-emerald-50 dark:hover:bg-emerald-900 hover:border-emerald-500 hover:scale-105 cursor-pointer'
                                                    : 'bg-gray-200 dark:bg-gray-800 border-2 border-gray-300 dark:border-gray-700 opacity-50 cursor-not-allowed'
                                                }
                                            `}
                                        >
                                            <span className={suit.color}>{suit.symbol}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-3 gap-3">
                <button
                    onClick={() => onBid({ type: 'pass' })}
                    disabled={disabled}
                    className="px-4 py-3 bg-yellow-500 hover:bg-yellow-600 text-white font-bold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Pass
                </button>
                <button
                    onClick={() => onBid({ type: 'double' })}
                    disabled={disabled || !currentBid}
                    className="px-4 py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Double
                </button>
                <button
                    onClick={() => onBid({ type: 'redouble' })}
                    disabled={disabled}
                    className="px-4 py-3 bg-red-800 hover:bg-red-900 text-white font-bold rounded-lg transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    Redouble
                </button>
            </div>
        </div>
    );
}
