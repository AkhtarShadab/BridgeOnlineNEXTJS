"use client";

import { useEffect, useState } from "react";

export interface DisconnectedPlayer {
    userId: string;
    seat: string;     // "NORTH" | "SOUTH" | "EAST" | "WEST"
    username: string;
    graceEndsAt: number; // ms epoch
}

interface DisconnectBannerProps {
    players: DisconnectedPlayer[];
    timedOutUserIds: string[]; // users whose grace period expired
    onCountdownComplete?: (userId: string) => void;
}

/**
 * Amber banner listing disconnected seats with live countdown.
 * Auto-updates every second. Renders nothing when no disconnects.
 */
export default function DisconnectBanner({ players, timedOutUserIds, onCountdownComplete }: DisconnectBannerProps) {
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const id = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(id);
    }, []);

    if (players.length === 0) return null;

    return (
        <div data-testid="disconnect-banner-container" className="mb-4 space-y-2">
            {players.map(p => {
                const remaining = Math.max(0, p.graceEndsAt - now);
                const isTimedOut = timedOutUserIds.includes(p.userId);
                const seconds = Math.ceil(remaining / 1000);
                const mm = String(Math.floor(seconds / 60)).padStart(2, "0");
                const ss = String(seconds % 60).padStart(2, "0");

                if (isTimedOut || remaining === 0) {
                    return (
                        <div
                            key={p.userId}
                            data-testid={`disconnect-timedout-${p.seat}`}
                            className="px-4 py-3 rounded-lg border bg-red-900/40 border-red-700 text-red-200 text-sm"
                        >
                            ⚠ <strong>{p.seat[0]}{p.seat.slice(1).toLowerCase()}</strong> ({p.username}) left the game. Returning to lobby…
                        </div>
                    );
                }

                if (onCountdownComplete && remaining < 100 && !isTimedOut) {
                    // Fire callback once when countdown hits 0
                    setTimeout(() => onCountdownComplete(p.userId), 0);
                }

                return (
                    <div
                        key={p.userId}
                        data-testid={`disconnect-banner-${p.seat}`}
                        className="px-4 py-3 rounded-lg border bg-yellow-900/30 border-yellow-600 text-yellow-100 text-sm flex justify-between items-center"
                    >
                        <span>
                            ⚠ <strong>{p.seat[0]}{p.seat.slice(1).toLowerCase()}</strong> ({p.username}) disconnected — reconnecting…
                        </span>
                        <span className="font-mono text-yellow-200" data-testid="disconnect-countdown">{mm}:{ss}</span>
                    </div>
                );
            })}
        </div>
    );
}
