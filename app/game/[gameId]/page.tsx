"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import BiddingBox from "@/components/game/BiddingBox";
import { useSocket } from "@/lib/hooks/useSocket";

export default function GamePage() {
    const router = useRouter();
    const params = useParams();
    const { data: session, status } = useSession();
    const { connected, on, off } = useSocket();
    const gameId = params?.gameId as string;

    const [game, setGame] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
            return;
        }

        if (status === "authenticated" && gameId) {
            fetchGameState();
        }
    }, [status, gameId]);

    const fetchGameState = async () => {
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
    };

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
                const data = await response.json();
                console.log("Bid successful:", data);
                // Refresh game state
                fetchGameState();
            } else {
                const data = await response.json();
                alert(data.error || "Failed to make bid");
            }
        } catch (err) {
            console.error("Error making bid:", err);
            alert("An error occurred");
        }
    };

    // Listen for real-time game updates via WebSocket
    useEffect(() => {
        if (!connected || !gameId || !game?.gameRoom?.id) return;

        console.log('Setting up game WebSocket listeners for room:', game.gameRoom.id);

        // Join the Socket.io room for this game
        if (global.socket) {
            global.socket.emit('room:join', { roomId: game.gameRoom.id });
            console.log('Joined Socket.io room:', game.gameRoom.id);
        }

        // Listen for bid updates
        on('game:bid_made', (data: any) => {
            console.log('Bid made by another player, refreshing game state:', data);
            fetchGameState();
        });

        return () => {
            off('game:bid_made');
        };
    }, [connected, on, off, gameId, game?.gameRoom?.id, fetchGameState]);

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

    // Helper function to get suit symbol
    const getSuitSymbol = (suit: string) => {
        const symbols: Record<string, string> = {
            S: '♠',
            H: '♥',
            D: '♦',
            C: '♣',
        };
        return symbols[suit] || suit;
    };

    // Helper function to get suit color
    const getSuitColor = (suit: string) => {
        return suit === 'H' || suit === 'D' ? 'text-red-600' : 'text-gray-900 dark:text-white';
    };

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
                    <div className="flex justify-between items-center">
                        <div>
                            <h1 className="text-3xl font-bold text-emerald-800 dark:text-emerald-400 mb-2">
                                Bridge Game - Board {game.boardNumber}
                            </h1>
                            <div className="flex gap-4 text-sm text-gray-600 dark:text-gray-400">
                                <span>Phase: <strong className="text-emerald-600">{game.phase}</strong></span>
                                <span>Dealer: <strong>{game.dealer?.username || 'Unknown'}</strong></span>
                                {game.gameState?.vulnerability && (
                                    <span>Vulnerability: <strong>
                                        {game.gameState.vulnerability.NS ? 'NS' : ''}
                                        {game.gameState.vulnerability.EW ? ' EW' : ''}
                                        {!game.gameState.vulnerability.NS && !game.gameState.vulnerability.EW ? 'None' : ''}
                                    </strong></span>
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

                {/* Game Board */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-6">
                    <div className="text-center mb-4">
                        <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200">
                            Your Seat: <span className="text-emerald-600">{game.mySeat}</span>
                        </h2>
                        {game.currentPlayer && (
                            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                                Current Turn: <strong>{game.currentPlayer.username}</strong>
                            </p>
                        )}
                    </div>

                    {/* Center Area - Bidding/Trick Display */}
                    <div className="flex justify-center items-center min-h-[200px] mb-8">
                        <div className="bg-emerald-700 dark:bg-emerald-900 rounded-2xl p-8 text-white">
                            {game.phase === 'BIDDING' && (
                                <div>
                                    <h3 className="text-xl font-bold mb-4">Bidding Phase</h3>
                                    {game.gameState?.bidHistory && game.gameState.bidHistory.length > 0 ? (
                                        <div className="space-y-2">
                                            {game.gameState.bidHistory.map((bid: any, i: number) => (
                                                <div key={i} className="text-sm">
                                                    {bid.player}: {bid.bid}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <p className="text-center">Waiting for first bid...</p>
                                    )}
                                </div>
                            )}
                            {game.phase === 'PLAYING' && (
                                <div>
                                    <h3 className="text-xl font-bold mb-4">Playing Phase</h3>
                                    {game.gameState?.contract && (
                                        <p className="mb-2">
                                            Contract: {game.gameState.contract.level}{game.gameState.contract.suit}
                                        </p>
                                    )}
                                    <p>Current Trick Display (Coming Soon)</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Player's Hand */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                        Your Hand ({game.myHand?.length || 0} cards)
                    </h2>
                    <div className="flex gap-2 flex-wrap justify-center">
                        {game.myHand && game.myHand.length > 0 ? (
                            game.myHand.map((card: any, index: number) => renderCard(card, index))
                        ) : (
                            <p className="text-gray-500">No cards in hand</p>
                        )}
                    </div>
                </div>

                {/* Bidding Box - Only show during BIDDING phase */}
                {game.phase === 'BIDDING' && (
                    <div className="mt-6">
                        <BiddingBox
                            onBid={handleBid}
                            currentBid={game.gameState?.currentBid || null}
                            disabled={game.currentPlayer?.id !== session?.user?.id}
                        />
                    </div>
                )}

                {/* Players Info */}
                <div className="mt-6 grid grid-cols-4 gap-4">
                    {game.players?.map((player: any) => (
                        <div
                            key={player.userId}
                            className="bg-white dark:bg-gray-800 rounded-lg shadow p-4 text-center"
                        >
                            <h3 className="font-semibold text-gray-800 dark:text-gray-200">{player.username}</h3>
                            <p className="text-sm text-emerald-600">{player.seat}</p>
                            <p className="text-xs text-gray-500 mt-1">{player.cardCount} cards</p>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
