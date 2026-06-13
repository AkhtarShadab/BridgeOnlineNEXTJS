"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useParams } from "next/navigation";
import BiddingBox from "@/components/game/BiddingBox";
import PlayingTable, { FULL_TO_SEAT, type Seat } from "@/components/game/PlayingTable";
import { useSocketContext } from "@/lib/context/SocketContext";
import PlayerVoiceBadge from "@/components/voice/PlayerVoiceBadge";
import { useVoiceChat } from "@/lib/hooks/useVoiceChat";
import { isEnabled } from "@/lib/features";
import { isValidPlay } from "@/lib/game/playing";

// Inline SVG suit icons (viewBox 0 0 24 24)
const SuitIcons = {
    S: ({ className }: { className?: string }) => (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Spade">
            <path d="M12 2L5 10.5C3.5 12.5 5 15.5 8 15.5c.5 0 1-.1 1.5-.2-.3.9-.7 1.7-1.5 2.2h8c-.8-.5-1.2-1.3-1.5-2.2.5.1 1 .2 1.5.2 3 0 4.5-3 3-5L12 2z" />
        </svg>
    ),
    H: ({ className }: { className?: string }) => (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Heart">
            <path d="M12 21.5C12 21.5 2 14 2 8a5.5 5.5 0 0110-3.1A5.5 5.5 0 0122 8c0 6-10 13.5-10 13.5z" />
        </svg>
    ),
    D: ({ className }: { className?: string }) => (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Diamond">
            <path d="M12 2L4 12l8 10 8-10L12 2z" />
        </svg>
    ),
    C: ({ className }: { className?: string }) => (
        <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-label="Club">
            <path d="M12 3a3.5 3.5 0 00-3 5.2A3.5 3.5 0 005 11.5C5 13.4 6.6 15 8.5 15c.6 0 1.1-.2 1.6-.4-.4 1.2-1.1 2-2.1 2.4h8c-1-.4-1.7-1.2-2.1-2.4.5.2 1 .4 1.6.4C17.4 15 19 13.4 19 11.5a3.5 3.5 0 00-4-3.3A3.5 3.5 0 0012 3z" />
        </svg>
    ),
} as const;

export default function GamePage() {
    const router = useRouter();
    const params = useParams();
    const { data: session, status } = useSession();
    const gameId = params?.gameId as string;

    const [game, setGame] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    // Table appearance settings (persisted in localStorage)
    const [tableSettings, setTableSettings] = useState<{
        visible: boolean;
        fanStyle: 'fan' | 'tilt' | 'flat';
        rake: number;
        speed: number;
    }>(() => {
        try {
            const saved = localStorage.getItem('table:settings');
            return saved ? JSON.parse(saved) : { visible: false, fanStyle: 'fan', rake: 52, speed: 1 };
        } catch { return { visible: false, fanStyle: 'fan', rake: 52, speed: 1 }; }
    });
    const updateTableSetting = (key: string, value: any) => {
        setTableSettings(prev => {
            const next = { ...prev, [key]: value };
            try { localStorage.setItem('table:settings', JSON.stringify(next)); } catch {}
            return next;
        });
    };

    // Feature 06: held visual state for a completed trick (trick lifecycle UX).
    const [completedTrick, setCompletedTrick] = useState<{
        cards: { seat: Seat; card: string }[];
        winner: Seat;
    } | null>(null);
    const [trickCollecting, setTrickCollecting] = useState(false);
    const trickHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const collectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Feature 07: optimistic play + toast system
    const [optimisticTrick, setOptimisticTrick] = useState<{ seat: Seat; card: string }[] | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [toasts, setToasts] = useState<{ id: string; message: string; type: 'error' | 'info' }[]>([]);
    const addToast = (message: string, type: 'error' | 'info' = 'info') => {
        const id = Math.random().toString(36).slice(2);
        setToasts(t => [...t, { id, message, type }]);
        setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 4000);
    };

    // handlePlayCard — async flow with optimistic state + error toast + rollback.
    const handlePlayCard = async (seat: Seat, card: string) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        setOptimisticTrick(prev => [...(prev || []), { seat, card }]);
        try {
            const res = await fetch(`/api/games/${gameId}/play`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ card }),
            });
            if (res.ok) {
                await fetchGameState();
                setOptimisticTrick(null);
            } else {
                const data = await res.json().catch(() => ({}));
                setOptimisticTrick(null);
                addToast(data.error || 'Illegal play', 'error');
            }
        } catch {
            setOptimisticTrick(null);
            addToast('Network error — try again', 'error');
        } finally {
            setIsSubmitting(false);
        }
    };

    // Use the persistent global socket — the same connection used in the lobby
    // so room membership is never lost between page navigations.
    const { socket, connected, joinGame } = useSocketContext();

    const peersInRoom = game?.players ? game.players.map((p: any) => p.userId) : [];
    const { isJoined, isMuted, participants, joinVoice, toggleMute } = useVoiceChat(game?.roomId || null, peersInRoom);

    // Auto-join voice as soon as game is ready
    useEffect(() => {
        if (!isEnabled("voiceChat")) return;
        if (game?.roomId && connected && !isJoined) {
            joinVoice();
        }
    }, [game?.roomId, connected, isJoined, joinVoice]);

    const handleMicClick = () => {
        if (!isEnabled("voiceChat")) return;
        if (!isJoined) {
            joinVoice();
        } else {
            toggleMute();
        }
    };

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

    // Listen for real-time bid updates.
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

    // Listen for real-time card play updates.
    useEffect(() => {
        if (!socket) return;
        const handleCardPlayed = () => { fetchGameState(); };
        socket.on('game:card_played', handleCardPlayed);
        return () => { socket.off('game:card_played', handleCardPlayed); };
    }, [socket, fetchGameState]);

    // Listen for game completed — show score, then auto-redirect to next board if available
    useEffect(() => {
        if (!socket) return;
        const handleCompleted = (data: { score: any; nextGameId?: string; boardNumber?: number }) => {
            console.log('[Game] 🏁 game:completed received:', data);
            fetchGameState();
            // If next game exists, redirect after a brief delay to show results
            if (data.nextGameId) {
                setTimeout(() => {
                    window.location.href = `/game/${data.nextGameId}`;
                }, 3000);
            }
        };
        socket.on('game:completed', handleCompleted);
        return () => { socket.off('game:completed', handleCompleted); };
    }, [socket, fetchGameState]);

    // Listen for next board — redirect to the new game immediately
    useEffect(() => {
        if (!socket) return;
        const handleNextBoard = (data: { nextGameId: string; boardNumber: number }) => {
            console.log('[Game] 🎯 game:next_board received:', data);
            if (data.nextGameId) {
                router.push(`/game/${data.nextGameId}`);
            }
        };
        socket.on('game:next_board', handleNextBoard);
        return () => { socket.off('game:next_board', handleNextBoard); };
    }, [socket, router]);

    // Feature 06: trick completed — hold the 4 cards visually, animate collection
    // toward the winner, then re-fetch so the server's cleared trick state takes over.
    useEffect(() => {
        if (!socket) return;
        const handleTrickCompleted = (data: { gameId: string; winningSeat: string; trickCards: { seat: string; card: string }[] }) => {
            console.log('[Game] 🎴 game:trick_completed received:', data);
            // Map full seat names to compact ones
            const winner = FULL_TO_SEAT[data.winningSeat] as Seat;
            const cards = (data.trickCards || []).map(t => ({
                seat: FULL_TO_SEAT[t.seat] as Seat,
                card: t.card,
            }));
            if (cards.length !== 4 || !winner) {
                // malformed payload — just refetch
                fetchGameState();
                return;
            }
            setCompletedTrick({ cards, winner });
            setTrickCollecting(true);

            // Clear any existing hold timer
            if (trickHoldTimerRef.current) clearTimeout(trickHoldTimerRef.current);
            if (collectTimerRef.current) clearTimeout(collectTimerRef.current);

            // After 600ms of collect animation, swap the view to the still-held cards
            collectTimerRef.current = setTimeout(() => {
                setTrickCollecting(false);
            }, 600);
            // After 1500ms total, clear the hold and refetch authoritative state
            trickHoldTimerRef.current = setTimeout(() => {
                setCompletedTrick(null);
                fetchGameState();
            }, 1500);
        };
        socket.on('game:trick_completed', handleTrickCompleted);
        return () => {
            socket.off('game:trick_completed', handleTrickCompleted);
            if (trickHoldTimerRef.current) clearTimeout(trickHoldTimerRef.current);
            if (collectTimerRef.current) clearTimeout(collectTimerRef.current);
        };
    }, [socket, fetchGameState]);

    // Flag set synchronously the moment the player clicks Exit.
    // Using a ref (not state) so changes are immediately visible inside the socket handler
    // without waiting for a re-render — avoids the race between socket event and navigation.
    const isExitingRef = useRef(false);

    // Listen for another player exiting — redirect remaining players to room lobby.
    // The exiting player also receives this event but ignores it via isExitingRef.
    useEffect(() => {
        if (!socket) return;

        const handlePlayerExited = (data: { exitedUserId: string; exitedUsername: string; roomId: string }) => {
            console.log('[Game] game:player_exited received:', data, 'isExiting:', isExitingRef.current);
            // If WE triggered the exit, ignore — we're already being sent to /dashboard
            if (isExitingRef.current) return;
            router.push(`/room/${data.roomId}`);
        };

        socket.on('game:player_exited', handlePlayerExited);

        return () => {
            socket.off('game:player_exited', handlePlayerExited);
        };
    }, [socket, router]);

    // Handle the Exit button
    const handleExit = async () => {
        const confirmed = confirm('Are you sure you want to exit? Other players will be sent back to the room lobby.');
        if (!confirmed) return;

        // Set the flag SYNCHRONOUSLY before any async work so the socket handler
        // ignores the incoming game:player_exited event immediately.
        isExitingRef.current = true;

        try {
            const response = await fetch(`/api/games/${gameId}/exit`, { method: 'POST' });
            if (response.ok) {
                router.push('/dashboard');
            } else {
                const data = await response.json();
                isExitingRef.current = false; // reset on failure
                alert(data.error || 'Failed to exit game');
            }
        } catch (err) {
            console.error('[Game] Error exiting:', err);
            router.push('/dashboard'); // navigate anyway so player isn't stuck
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
                // Always refresh after a bid — socket event may arrive late or be missed
                // if room membership wasn't established yet.
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

    if (loading || status === "loading") {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center">
                    {isEnabled("newUI") ? (
                        <div className="flex gap-4 mb-4 justify-center">
                            <SuitIcons.S className="w-10 h-10 text-suit-black" />
                            <SuitIcons.H className="w-10 h-10 text-suit-red" />
                            <SuitIcons.D className="w-10 h-10 text-suit-red" />
                            <SuitIcons.C className="w-10 h-10 text-suit-black" />
                        </div>
                    ) : (
                        <div className="text-4xl mb-4">♠ ♥ ♦ ♣</div>
                    )}
                    <p className="text-accent">Loading game...</p>
                </div>
            </div>
        );
    }

    if (error || !game) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center bg-surface border border-border p-8 rounded-2xl shadow-xl">
                    <div className="text-4xl mb-4 text-red-500">⚠️</div>
                    <h2 className="text-2xl font-bold text-foreground mb-4">
                        {error || "Game not found"}
                    </h2>
                    <button
                        onClick={() => router.push("/dashboard")}
                        className="px-6 py-3 bg-accent text-background rounded-lg hover:bg-accent-muted font-semibold"
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
        suit === 'H' || suit === 'D' ? 'text-suit-red' : 'text-suit-black';

    // Format a bid action for display in the history table
    const formatBid = (action: any) => {
        if (action.type === 'pass') return <span className="text-text-muted font-medium">Pass</span>;
        if (action.type === 'double') return <span className="text-red-400 font-bold">Dbl</span>;
        if (action.type === 'redouble') return <span className="text-accent font-bold">Rdbl</span>;
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

    /**
     * Parse a card from either string ("AS") or object ({suit, rank}) format.
     * The game engine stores hands as string arrays via cardToString().
     */
    const parseCard = (c: any): { rank: string; suit: string } => {
        if (typeof c === 'string') {
            return { rank: c[0], suit: c[1] };
        }
        return { rank: c.rank, suit: c.suit };
    };

    // Render a single card
    const renderCard = (c: any, index: number) => {
        const card = parseCard(c);
        return (
            <div
                key={index}
                className="bg-surface-elevated border-2 border-border rounded-lg shadow-md p-3 min-w-[60px] text-center hover:scale-105 transition-transform cursor-pointer hover:border-accent"
            >
                <div className={`text-2xl font-bold ${getSuitColor(card.suit)}`}>
                    {card.rank === 'T' ? '10' : card.rank}
                </div>
                <div className={`text-3xl ${getSuitColor(card.suit)}`}>
                    {isEnabled("newUI")
                        ? (() => {
                            const Icon = SuitIcons[card.suit as keyof typeof SuitIcons];
                            return Icon ? <Icon className="w-8 h-8 mx-auto" /> : getSuitSymbol(card.suit);
                        })()
                        : getSuitSymbol(card.suit)
                    }
                </div>
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="container mx-auto max-w-7xl">

                {/* Game Info Header */}
                <div className="bg-surface border border-border rounded-2xl shadow-xl p-6 mb-6">
                    <div className="flex justify-between items-center flex-wrap gap-4">
                        <div>
                            <h1 className="text-3xl font-bold text-accent mb-2">
                                Bridge Game — Board {game.boardNumber}
                            </h1>
                            <div className="flex gap-4 text-sm text-text-muted flex-wrap">
                                <span>Phase: <strong className="text-accent">{game.phase}</strong></span>
                                <span>Dealer: <strong className="text-foreground">{game.dealer?.username || '—'}</strong></span>
                                <span>Your seat: <strong className="text-accent">{game.playerSeat}</strong></span>
                                {game.contract && (
                                    <span>
                                        Contract: <strong className="text-foreground">
                                            {game.contract.level}{getSuitSymbol(game.contract.suit)}
                                            {' by '}{game.declarer?.username}
                                        </strong>
                                    </span>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-2">
                            {isEnabled("voiceChat") && (
                            <button
                                onClick={handleMicClick}
                                className={`px-4 py-2 rounded-lg font-semibold transition-colors flex items-center justify-center gap-2 ${!isJoined ? "bg-surface-elevated text-text-muted hover:bg-border" :
                                    isMuted ? "bg-red-900/30 text-red-400 hover:bg-red-900/50" :
                                        "bg-accent/10 text-accent hover:bg-accent/20"
                                    }`}
                                title={!isJoined ? "Enable Voice Chat" : isMuted ? "Unmute Microphone" : "Mute Microphone"}
                            >
                                {isMuted || !isJoined ? (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4l16 16" />
                                    </svg>
                                ) : (
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                                    </svg>
                                )}
                            </button>
                            )}
                            <button
                                onClick={handleExit}
                                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium transition-colors"
                            >
                                Exit Game
                            </button>
                        </div>
                    </div>
                </div>

                {/* Turn indicator */}
                <div
                    data-testid="turn-ring"
                    className={`mb-4 p-4 rounded-xl text-center text-lg font-semibold shadow ${isMyTurn
                        ? 'turn-ring bg-accent text-background animate-pulse'
                        : 'bg-surface border border-border text-foreground'
                        }`}
                >
                    {game.phase === 'PLAYING'
                        ? (isMyTurn
                            ? '🎯 Your turn to play!'
                            : `⏳ Waiting for ${currentPlayerName} to play...`)
                        : (isMyTurn
                            ? '🎯 Your turn to bid!'
                            : `⏳ Waiting for ${currentPlayerName} to bid...`)
                    }
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                    {/* Bidding History — 4-column ACBL-style table */}
                    <div className="bg-surface border border-border rounded-2xl shadow-xl p-6">
                        <h2 className="text-xl font-semibold text-foreground mb-4">
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
                                                            ? 'text-accent'
                                                            : 'text-text-muted'
                                                            }`}>
                                                            {SEAT_LABEL[seat]} {isDealer && <span className="text-xs text-yellow-400">D</span>}
                                                        </div>
                                                        <div className={`text-sm font-semibold truncate max-w-[80px] mx-auto ${isCurrent
                                                            ? 'text-accent'
                                                            : 'text-foreground'
                                                            }`}>
                                                            {player?.username || '—'}
                                                        </div>
                                                        {isCurrent && (
                                                            <div className="w-2 h-2 bg-accent rounded-full mx-auto mt-1 animate-pulse" />
                                                        )}
                                                    </th>
                                                );
                                            })}
                                        </tr>
                                        <tr>
                                            {orderedSeats.map(seat => (
                                                <td key={seat}>
                                                    <div className="border-t border-border mb-2" />
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
                            <p className="text-text-muted text-sm text-center py-4">
                                Auction not yet started
                            </p>
                        )}
                    </div>

                    {/* Players at the table */}
                    <div className="bg-surface border border-border rounded-2xl shadow-xl p-6">
                        <h2 className="text-xl font-semibold text-foreground mb-4">
                            Players
                        </h2>
                        <div className="space-y-3">
                            {SEAT_ORDER.map(seat => {
                                const player = seatToPlayer[seat];
                                const isCurrentTurn = player?.userId === game.currentPlayer?.id;
                                const isMe = player?.userId === session?.user?.id;
                                const voiceParticipant = player ? participants.find(p => p.userId === player.userId) : undefined;
                                const isConnected = !!player;

                                return (
                                    <div
                                        key={seat}
                                        className={`flex flex-col gap-2 p-3 rounded-lg border-2 transition-all ${isCurrentTurn
                                            ? 'turn-ring border-accent bg-accent/10'
                                            : 'border-border bg-surface-elevated/50'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className="relative">
                                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isCurrentTurn ? 'bg-accent text-background' : 'bg-surface-elevated text-foreground border border-border'
                                                        }`}>
                                                        {seat[0]}
                                                    </div>
                                                    {/* Connection dot */}
                                                    {isEnabled("newUI") && (
                                                        <span className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-surface ${isConnected ? 'bg-green-400' : 'bg-gray-600'}`} />
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-semibold text-foreground">
                                                        {player?.username || <span className="text-text-muted italic">Empty</span>}
                                                        {isMe && <span className="ml-2 text-xs text-accent font-normal">(you)</span>}
                                                    </div>
                                                    <div className="text-xs text-text-muted">
                                                        {seat}
                                                        {seat === dealerSeat && ' · Dealer'}
                                                        {game.declarer?.id === player?.userId && ' · Declarer'}
                                                    </div>
                                                </div>
                                            </div>
                                            {isCurrentTurn && (
                                                <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-1 rounded-full animate-pulse">
                                                    Bidding...
                                                </span>
                                            )}
                                        </div>
                                        {player && isEnabled("voiceChat") && <PlayerVoiceBadge participant={voiceParticipant} isLocal={isMe} />}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* Bidding phase: show hand + bidding box */}
                {game.phase === 'BIDDING' && (
                    <>
                        <div className="bg-surface border border-border rounded-2xl shadow-xl p-6 mb-6">
                            <h2 className="text-xl font-semibold text-foreground mb-4">
                                Your Hand ({game.hand?.length || 0} cards)
                            </h2>
                            <div className="flex gap-2 flex-wrap justify-center">
                                {game.hand && game.hand.length > 0 ? (
                                    game.hand.map((card: any, index: number) => renderCard(card, index))
                                ) : (
                                    <p className="text-text-muted">No cards in hand</p>
                                )}
                            </div>
                        </div>
                        <div className="mt-6">
                            <BiddingBox
                                onBid={handleBid}
                                currentBid={game.currentBid || null}
                                bidHistory={game.bidHistory || []}
                                vulnerability={game.vulnerability || { NS: false, EW: false }}
                                playerSeat={game.playerSeat}
                                disabled={!isMyTurn}
                            />
                        </div>
                    </>
                )}

                {/* Playing phase: 3D POV table */}
                {game.phase === 'PLAYING' && (() => {
                    // Map API data to PlayingTable props ------------------------------
                    const viewer = FULL_TO_SEAT[game.playerSeat] as Seat;
                    const declarer = FULL_TO_SEAT[game.declarerSeat] as Seat;
                    const dummy = FULL_TO_SEAT[game.dummySeat] as Seat;
                    const turnSeat = game.currentPlayer
                        ? (FULL_TO_SEAT[(game.players as any[]).find((p: any) => p.userId === game.currentPlayer.id)?.seat] as Seat)
                        : null;
                    const dummyRevealed = !!game.dummyHand;

                    // Viewer plays their own hand; if declarer, also plays dummy
                    const controlled = turnSeat === viewer ? viewer
                        : (viewer === declarer && dummyRevealed && turnSeat === dummy ? dummy : null);

                    // Compute legal cards for the seat the viewer can play
                    const legal = controlled && game.hand
                        ? (game.hand as string[]).filter((c: string) => {
                            const currentTrickArr = (game.currentTrick || []) as any[];
                            const trumpSuit = game.contract?.suit as any ?? null;
                            return isValidPlay(c, game.hand as any, currentTrickArr, trumpSuit).valid;
                        })
                        : null;

                    // Map handCounts to compact seat format
                    const hCounts: Partial<Record<Seat, number>> = {};
                    if (game.handCounts) {
                        for (const [seat, count] of Object.entries(game.handCounts as Record<string, number>)) {
                            hCounts[FULL_TO_SEAT[seat] as Seat] = count;
                        }
                    }

                    // Build name map from players array
                    const seatNames: Partial<Record<Seat, string>> = {};
                    (game.players || []).forEach((p: any) => {
                        seatNames[FULL_TO_SEAT[p.seat] as Seat] = p.username;
                    });

                    // Map currentTrick to compact seat format
                    const trickCards = (game.currentTrick || []).map((t: any) => ({
                        seat: FULL_TO_SEAT[t.seat] as Seat,
                        card: t.card,
                    }));

                    return (
                        <div className="mt-6 space-y-2">
                            {/* Table settings toggle */}
                            <div className="flex justify-end">
                                <button
                                    onClick={() => updateTableSetting('visible', !tableSettings.visible)}
                                    className="px-3 py-1.5 text-xs font-medium bg-surface border border-border text-text-muted rounded-lg hover:text-foreground hover:border-accent transition-colors"
                                >
                                    {tableSettings.visible ? 'Hide Table Settings' : 'Table Settings ⚙'}
                                </button>
                            </div>

                            {/* Collapsible settings panel */}
                            {tableSettings.visible && (
                                <div className="bg-surface border border-border rounded-xl p-4 flex flex-wrap gap-6 items-center">
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs text-text-muted font-medium">Fan:</label>
                                        {(['fan', 'tilt', 'flat'] as const).map(s => (
                                            <button key={s}
                                                onClick={() => updateTableSetting('fanStyle', s)}
                                                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${tableSettings.fanStyle === s
                                                    ? 'bg-accent text-background'
                                                    : 'bg-surface-elevated text-text-muted border border-border hover:text-foreground'
                                                    }`}
                                            >{s}</button>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs text-text-muted font-medium">Rake:</label>
                                        <input type="range" min="30" max="62"
                                            value={tableSettings.rake}
                                            onChange={e => updateTableSetting('rake', Number(e.target.value))}
                                            className="w-20 accent-accent"
                                        />
                                        <span className="text-xs text-foreground w-6">{tableSettings.rake}°</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <label className="text-xs text-text-muted font-medium">Speed:</label>
                                        <input type="range" min="0.5" max="2" step="0.1"
                                            value={tableSettings.speed}
                                            onChange={e => updateTableSetting('speed', Number(e.target.value))}
                                            className="w-20 accent-accent"
                                        />
                                        <span className="text-xs text-foreground w-6">{tableSettings.speed.toFixed(1)}x</span>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const reset = { fanStyle: 'fan' as const, rake: 52, speed: 1 };
                                            setTableSettings(prev => ({ ...prev, ...reset }));
                                            try { localStorage.setItem('table:settings', JSON.stringify({ ...tableSettings, ...reset })); } catch {}
                                        }}
                                        className="px-2.5 py-1 text-xs text-text-muted hover:text-foreground border border-border rounded-md"
                                    >Reset</button>
                                </div>
                            )}

                            <PlayingTable
                                viewerSeat={viewer}
                                declarer={declarer}
                                dummySeat={dummy}
                                trump={(game.contract?.suit as any) ?? 'NT'}
                                dummyRevealed={dummyRevealed}
                                hands={{
                                    [viewer]: (game.hand || []) as string[],
                                    ...(dummyRevealed && game.dummyHand ? { [dummy]: game.dummyHand as string[] } : {}),
                                }}
                                handCounts={hCounts}
                                trick={(optimisticTrick ?? (completedTrick?.cards as any) ?? trickCards) as any}
                                trickWinner={completedTrick?.winner ?? null}
                                trickCollecting={trickCollecting}
                                turn={turnSeat}
                                legalCards={legal}
                                isSubmitting={isSubmitting}
                                tricksWon={game.tricksWon ?? { NS: 0, EW: 0 }}
                                names={seatNames}
                                fanStyle={tableSettings.fanStyle}
                                rake={tableSettings.rake}
                                speed={tableSettings.speed}
                                onPlayCard={handlePlayCard}
                            />
                        </div>
                    );
                })()}

                {/* Completed phase — show score summary */}
                {game.phase === 'COMPLETED' && (() => {
                    const hasNextBoard = !!(game as any).nextGameId;
                    return (
                        <div className="bg-surface border border-border rounded-2xl shadow-xl p-8 text-center">
                            <h2 className="text-3xl font-bold text-accent mb-4">🏁 Game Over</h2>
                            <p className="text-lg text-foreground mb-2">
                                Board {game.boardNumber} Complete
                            </p>
                            {(game as any).totalBoards && (
                                <p className="text-sm text-text-muted mb-6">
                                    Game {game.boardNumber} of {(game as any).totalBoards}
                                </p>
                            )}
                            <div className="flex justify-center gap-12 mb-6">
                                <div className="text-center">
                                    <div className="text-sm font-semibold text-accent uppercase mb-1">NS</div>
                                    <div className="text-3xl font-bold text-foreground">{(game as any).scoreNS ?? 0}</div>
                                </div>
                                <div className="text-center">
                                    <div className="text-sm font-semibold text-suit-red uppercase mb-1">EW</div>
                                    <div className="text-3xl font-bold text-foreground">{(game as any).scoreEW ?? 0}</div>
                                </div>
                            </div>
                            {hasNextBoard ? (
                                <p className="text-sm text-accent animate-pulse">
                                    ⏳ Next game starting shortly...
                                </p>
                            ) : (
                                <button
                                    onClick={() => router.push('/dashboard')}
                                    className="px-6 py-3 bg-accent text-background font-semibold rounded-lg hover:bg-accent-muted transition-colors"
                                >
                                    Back to Dashboard
                                </button>
                            )}
                        </div>
                    );
                })()}

                {/* Feature 07: toast stack (bottom-right overlay) */}
                <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none" data-testid="toast-stack">
                    {toasts.map(t => (
                        <div
                            key={t.id}
                            data-testid={`toast-${t.type}`}
                            className={`pointer-events-auto px-4 py-3 rounded-lg border shadow-lg text-sm min-w-[200px] max-w-sm ${t.type === 'error'
                                ? 'bg-red-900/40 border-red-700 text-red-200'
                                : 'bg-surface-elevated border-border text-foreground'
                            }`}
                        >
                            <div className="flex items-start justify-between gap-3">
                                <span>{t.message}</span>
                                <button
                                    onClick={() => setToasts(arr => arr.filter(x => x.id !== t.id))}
                                    className="text-text-muted hover:text-foreground shrink-0"
                                    aria-label="Dismiss"
                                >×</button>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
