"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import BiddingBox from "@/components/game/BiddingBox";
import { useSocketContext } from "@/lib/context/SocketContext";

export default function GamePage() {
    const router = useRouter();
    const params = useParams();
    const { data: session, status } = useSession();
    const gameId = params?.gameId as string;

    const [game, setGame] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Use the persistent global socket — the same connection used in the lobby
    // so room membership is never lost between page navigations.
    const { socket, connected, joinGame } = useSocketContext();

    const fetchGameState = useCallback(async () => {
        try {
            const response = await fetch(`/api/games/${gameId}`);
            if (response.ok) {
                const data = await response.json();
                setGame(data);
            } else {
                const data = await response.json();
                setError(data.error || "Failed to load game");
            }
        } catch (err) {
            setError("An error occurred");
        } finally {
            setLoading(false);
        }
    }, [gameId]);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
            return;
        }
        if (status === "authenticated" && gameId) {
            fetchGameState();
        }
    }, [status, gameId, fetchGameState]);

    // Once we have both the gameId (always) and roomId (after first fetch),
    // explicitly join both socket rooms on the persistent global socket.
    useEffect(() => {
        if (connected && gameId && game?.roomId) {
            joinGame(gameId, game.roomId);
        }
    }, [connected, gameId, game?.roomId, joinGame]);

    // Listen for real-time bid updates. Attach directly to the socket instance
    // (not via the on/off wrappers) so the cleanup removes exactly this handler
    // and we never accumulate duplicate listeners.
    useEffect(() => {
        if (!socket) return;
        console.log('[Game] Attaching game:bid_made listener. Socket id:', socket.id);

        const handleBidMade = (data: any) => {
            console.log('[Game] 🎯 game:bid_made received:', data);
            fetchGameState();
        };

        socket.on('game:bid_made', handleBidMade);

        return () => {
            socket.off('game:bid_made', handleBidMade);
        };
    }, [socket, fetchGameState]);

    // Polling fallback — guarantees all players see the latest state even if
    // WebSocket delivery fails (network hiccups, reconnects, etc.).
    // Use a ref so the interval is created once and still calls the latest fetchGameState.
    const fetchGameStateRef = useRef(fetchGameState);
    fetchGameStateRef.current = fetchGameState;

    useEffect(() => {
        if (!gameId) return;

        const interval = setInterval(() => {
            fetchGameStateRef.current();
        }, 3000); // poll every 3 seconds

        return () => clearInterval(interval);
    }, [gameId]); // only restart if gameId changes

    const handleBid = async (bid: { type: string; level?: number; suit?: string }) => {
        try {
            const response = await fetch(`/api/games/${gameId}/bid`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: bid.type,
                    bid: bid.level && bid.suit ? { level: bid.level, suit: bid.suit } : undefined,
                }),
            });

            if (response.ok) {
                // The server broadcasts game:bid_made to all players (including this one).
                // fetchGameState() will be triggered by the socket event for everyone,
                // so no manual call needed here. Do a direct refresh only if socket is absent.
                if (!socket || !connected) {
                    fetchGameState();
                }
            } else {
                const data = await response.json();
                alert(data.error || "Failed to make bid");
            }
        } catch (err) {
            console.error("Error making bid:", err);
            alert("An error occurred");
        }
    };

    if (loading || status === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950">
                <div className="text-center">
                    <div className="text-4xl mb-4">♠ ♥ ♦ ♣</div>
                    <p className="text-emerald-600 dark:text-emerald-400">Loading game...</p>
                </div>
            </div>
        );
    }

    if (error || !game) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950">
                <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl">
                    <div className="text-4xl mb-4 text-red-600">⚠️</div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">
                        {error || "Game not found"}
                    </h2>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                    >
                        Back to Dashboard
                    </button>
                </div>
            </div>
        );
    }

    // Helper: suit symbol & color
    const getSuitSymbol = (suit: string) => ({ S: '♠', H: '♥', D: '♦', C: '♣' }[suit] || suit);
    const getSuitColor = (suit: string) =>
        suit === 'H' || suit === 'D' ? 'text-red-600' : 'text-gray-900';

    // Format a bid action for display in the history table
    const formatBid = (action: any) => {
        if (action.type === 'pass') return <span className="text-gray-400 font-medium">Pass</span>;
        if (action.type === 'double') return <span className="text-red-500 font-bold">Dbl</span>;
        if (action.type === 'redouble') return <span className="text-blue-500 font-bold">Rdbl</span>;
        if (action.type === 'bid' && action.bid) {
            const { level, suit } = action.bid;
            return (
                <span className={`font-bold ${getSuitColor(suit)}`}>
                    {level}{getSuitSymbol(suit)}
                </span>
            );
        }
        return null;
    };

    // Build 4-column bid history table ordered by seat (North, East, South, West)
    const SEAT_ORDER = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    const SEAT_LABEL: Record<string, string> = { NORTH: 'N', EAST: 'E', SOUTH: 'S', WEST: 'W' };

    // Map seat → player info for column headers
    const seatToPlayer: Record<string, any> = {};
    (game.players || []).forEach((p: any) => {
        seatToPlayer[p.seat] = p;
    });

    // Find dealer seat to determine which column starts
    const dealerSeat = game.dealer?.id
        ? (game.players || []).find((p: any) => p.userId === game.dealer.id)?.seat
        : null;
    const dealerColIndex = dealerSeat ? SEAT_ORDER.indexOf(dealerSeat) : 0;

    // Arrange bid history into rows, starting from dealer's column
    const buildBidRows = () => {
        if (!game.bidHistory || game.bidHistory.length === 0) return [];
        const rows: any[][] = [];
        let currentRow: (any | null)[] = new Array(4).fill(null);
        let col = dealerColIndex;

        game.bidHistory.forEach((action: any, i: number) => {
            currentRow[col] = action;
            col = (col + 1) % 4;
            if (col === dealerColIndex || i === game.bidHistory.length - 1) {
                rows.push([...currentRow]);
                currentRow = new Array(4).fill(null);
            }
        });
        return rows;
    };

    const bidRows = buildBidRows();

    // Reorder columns starting from dealer
    const orderedSeats = SEAT_ORDER.slice(dealerColIndex).concat(SEAT_ORDER.slice(0, dealerColIndex));

    // Current turn indicator
    const isMyTurn = game.currentPlayer?.id === session?.user?.id;
    const currentPlayerName = game.currentPlayer?.username || '—';

    // Render a single card
    const renderCard = (card: any, index: number) => (
        <div
            key={index}
            className="bg-white dark:bg-gray-100 border-2 border-gray-300 rounded-lg shadow-md p-3 min-w-[60px] text-center hover:scale-105 transition-transform cursor-pointer"
        >
            <div className={`text-2xl font-bold ${getSuitColor(card.suit)}`}>
                {card.rank === 'T' ? '10' : card.rank}
            </div>
            <div className={`text-3xl ${getSuitColor(card.suit)}`}>
                {getSuitSymbol(card.suit)}
            </div>
        </div>
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950 p-4">
            <div className="container mx-auto max-w-7xl">

                {/* Game Info Header */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-6">
                    <div className="flex justify-between items-center flex-wrap gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-emerald-800 dark:text-emerald-400 mb-2">
                                Bridge Game — Board {game.boardNumber}
                            </h1>
                            <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400 flex-wrap">
                                <span>Phase: <strong className="text-emerald-600">{game.phase}</strong></span>
                                <span>Dealer: <strong>{game.dealer?.username || '—'}</strong></span>
                                <span>Your seat: <strong className="text-emerald-600">{game.playerSeat}</strong></span>
                                {game.contract && (
                                    <span>
                                        Contract: <strong>
                                            {game.contract.level}{getSuitSymbol(game.contract.suit)}
                                            {' by '}{game.declarer?.username}
                                        </strong>
                                    </span>
                                )}
                            </div>
                        </div>
                        <button
                            onClick={() => router.push("/dashboard")}
                            className="px-4 py-2 bg-gray-600 hover:bg-gray-700 text-white rounded-lg"
                        >
                            Exit
                        </button>
                    </div>
                </div>

                {/* Turn indicator */}
                <div className={`mb-4 p-4 rounded-xl text-center text-lg font-semibold shadow ${isMyTurn
                    ? 'bg-emerald-500 text-white animate-pulse'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200'
                    }`}>
                    {isMyTurn
                        ? '🎯 Your turn to bid!'
                        : `⏳ Waiting for ${currentPlayerName} to bid...`}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Bidding History — 4-column ACBL-style table */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                            Auction
                        </h2>

                        {game.bidHistory && game.bidHistory.length > 0 ? (
                            <div className="overflow-x-auto">
                                <table className="w-full text-center">
                                    <thead>
                                        <tr>
                                            {orderedSeats.map((seat) => {
                                                const player = seatToPlayer[seat];
                                                const isDealer = seat === dealerSeat;
                                                const isCurrent = player?.userId === game.currentPlayer?.id;
                                                return (
                                                    <th key={seat} className="pb-3">
                                                        <div className={`text-xs font-bold uppercase tracking-wide mb-1 ${isCurrent
                                                            ? 'text-emerald-600'
                                                            : 'text-gray-500 dark:text-gray-400'
                                                            }`}>
                                                            {SEAT_LABEL[seat]} {isDealer && <span className="text-xs text-amber-500">D</span>}
                                                        </div>
                                                        <div className={`text-sm font-semibold truncate max-w-[80px] mx-auto ${isCurrent
                                                            ? 'text-emerald-600'
                                                            : 'text-gray-700 dark:text-gray-300'
                                                            }`}>
                                                            {player?.username || '—'}
                                                        </div>
                                                        {isCurrent && (
                                                            <div className="w-2 h-2 bg-emerald-500 rounded-full mx-auto mt-1 animate-pulse" />
                                                        )}
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                        <tr>
                                            {orderedSeats.map(seat => (
                                                <td key={seat}>
                                                    <div className="border-t border-gray-200 dark:border-gray-600 mb-2" />
                                                </td>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {bidRows.map((row, rowIdx) => (
                                            <tr key={rowIdx}>
                                                {orderedSeats.map((seat, colIdx) => {
                                                    const seatColInOriginal = SEAT_ORDER.indexOf(seat);
                                                    const action = row[seatColInOriginal];
                                                    return (
                                                        <td key={seat} className="py-2 px-1 text-base">
                                                            {action ? formatBid(action) : ''}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-gray-400 text-sm text-center py-4">
                                Auction not yet started
                            </p>
                        )}
                    </div>

                    {/* Players at the table */}
                    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                            Players
                        </h2>
                        <div className="space-y-3">
                            {SEAT_ORDER.map(seat => {
                                const player = seatToPlayer[seat];
                                const isCurrentTurn = player?.userId === game.currentPlayer?.id;
                                const isMe = player?.userId === session?.user?.id;
                                return (
                                    <div
                                        key={seat}
                                        className={`flex items-center justify-between p-3 rounded-lg border-2 transition-all ${isCurrentTurn
                                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                                            : 'border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/30'
                                            }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-bold ${isCurrentTurn ? 'bg-emerald-500' : 'bg-gray-400'
                                                }`}>
                                                {seat[0]}
                                            </div>
                                            <div>
                                                <div className="font-semibold text-gray-800 dark:text-gray-200">
                                                    {player?.username || <span className="text-gray-400 italic">Empty</span>}
                                                    {isMe && <span className="ml-2 text-xs text-emerald-600 font-normal">(you)</span>}
                                                </div>
                                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                                    {seat}
                                                    {seat === dealerSeat && ' · Dealer'}
                                                    {game.declarer?.id === player?.userId && ' · Declarer'}
                                                </div>
                                            </div>
                                        </div>
                                        {isCurrentTurn && (
                                            <span className="text-xs font-semibold text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-2 py-1 rounded-full animate-pulse">
                                                Bidding...
                                            </span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Player's Hand */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6 mb-6">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                        Your Hand ({game.hand?.length || 0} cards)
                    </h2>
                    <div className="flex gap-2 flex-wrap justify-center">
                        {game.hand && game.hand.length > 0 ? (
                            game.hand.map((card: any, index: number) => renderCard(card, index))
                        ) : (
                            <p className="text-gray-500">No cards in hand</p>
                        )}
                    </div>
                </div>

                {/* Bidding Box — only during BIDDING phase */}
                {game.phase === 'BIDDING' && (
                    <div className="mt-6">
                        <BiddingBox
                            onBid={handleBid}
                            currentBid={game.contract || null}
                            disabled={!isMyTurn}
                        />
                    </div>
                )}
            </div>
        </div>
    );
}
