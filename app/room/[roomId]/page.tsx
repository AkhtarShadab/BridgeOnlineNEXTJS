"use client";

import { useState, useEffect, use, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { useSocket } from "@/lib/hooks/useSocket";
import { useSocketContext } from "@/lib/context/SocketContext";
import InviteFriendsModal from "./InviteFriendsModal";

interface Player {
    id: string;
    userId: string;
    username: string;
    avatarUrl?: string;
    seat: "NORTH" | "SOUTH" | "EAST" | "WEST";
    isReady: boolean;
    joinedAt: string;
}

interface Room {
    id: string;
    name: string;
    inviteCode: string;
    status: string;
    settings: any;
    creatorId: string;
    players: Player[];
}

export default function RoomPage() {
    const router = useRouter();
    const params = useParams();
    const { data: session, status: sessionStatus } = useSession();
    const roomId = params?.roomId as string;

    const [room, setRoom] = useState<Room | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [copied, setCopied] = useState(false);
    const [showInviteModal, setShowInviteModal] = useState(false);

    // Use the global socket so join/leave persists across page navigations
    const { socket, connected, joinRoom } = useSocketContext();

    // Minimal shims so the rest of the file keeps working unchanged
    const on = (event: string, cb: (...args: any[]) => void) => socket?.on(event, cb);
    const off = (event: string, cb?: (...args: any[]) => void) => cb ? socket?.off(event, cb) : socket?.off(event);
    const emit = (event: string, ...args: any[]) => { if (socket && connected) socket.emit(event, ...args); };

    // Join the room channel whenever we have the roomId and socket is ready
    useEffect(() => {
        if (connected && roomId) {
            joinRoom(roomId);
        }
    }, [connected, roomId, joinRoom]);

    // Load room data function (defined before useEffects that use it)
    const loadRoomData = useCallback(async () => {
        try {
            const response = await fetch(`/api/rooms/${roomId}`);
            const data = await response.json();

            if (response.ok) {
                setRoom(data);
            } else {
                setError(data.error || "Failed to load room");
            }
        } catch (err) {
            setError("An error occurred while loading the room");
        } finally {
            setLoading(false);
        }
    }, [roomId]);

    useEffect(() => {
        if (sessionStatus === "unauthenticated") {
            router.push("/login");
        } else if (sessionStatus === "authenticated") {
            loadRoomData();
        }
    }, [sessionStatus, roomId, loadRoomData]);

    // Set up WebSocket listeners
    useEffect(() => {
        if (!connected) return;

        const handlePlayerJoined = () => {
            console.log('Player joined - reloading room data');
            loadRoomData();
        };

        const handlePlayerLeft = () => {
            console.log('Player left - reloading room data');
            loadRoomData();
        };

        const handleSeatChanged = () => {
            console.log('Seat changed - reloading room data');
            loadRoomData();
        };

        const handlePlayerReady = () => {
            console.log('Player ready - reloading room data');
            loadRoomData();
        };

        console.log('[Room Page] Setting up WebSocket listeners for room:', roomId);
        console.log('[Room Page] Socket connected:', connected);

        on('room:player_joined', handlePlayerJoined);
        on('room:player_left', handlePlayerLeft);
        on('room:seat_changed', handleSeatChanged);
        on('room:player_ready', handlePlayerReady);

        // Listen for game start event
        on('game:started', (data: any) => {
            console.log('[Room Page] ✅ GAME STARTED EVENT RECEIVED!', data);
            console.log('[Room Page] Redirecting to game board:', `/game/${data.gameId}`);
            router.push(`/game/${data.gameId}`);
        });

        console.log('[Room Page] All listeners set up');

        return () => {
            console.log('[Room Page] Cleaning up WebSocket listeners');
            off('room:player_joined');
            off('room:player_left');
            off('room:seat_changed');
            off('room:player_ready');
            off('game:started');
        };
    }, [connected, on, off, loadRoomData, router, roomId]);

    // Polling fallback - refresh room data and check if game started
    useEffect(() => {
        if (!room) return;

        const interval = setInterval(async () => {
            console.log('Polling: Refreshing room data...');

            try {
                const response = await fetch(`/api/rooms/${roomId}`);
                if (response.ok) {
                    const data = await response.json();

                    // If room status changed to IN_PROGRESS and we have an active game, redirect
                    if (data.status === 'IN_PROGRESS' && data.activeGameId) {
                        console.log('📢 Polling detected game started! Redirecting to:', data.activeGameId);
                        router.push(`/game/${data.activeGameId}`);
                        return;
                    }

                    setRoom(data);
                }
            } catch (error) {
                console.error('Error polling room data:', error);
            }
        }, 2000); // Poll every 2 seconds

        return () => clearInterval(interval);
    }, [room, roomId, router]);

    const handleSelectSeat = async (seat: string) => {
        try {
            const response = await fetch(`/api/rooms/${roomId}/seat`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ seat }),
            });

            if (response.ok) {
                loadRoomData();
                // Emit event to notify other players
                const eventData = {
                    roomId,
                    userId: session?.user?.id,
                    seat,
                    username: session?.user?.name || session?.user?.email,
                };
                console.log('Emitting room:seat_changed:', eventData);
                emit('room:seat_changed', eventData);
            } else {
                const data = await response.json();
                alert(data.error || "Failed to select seat");
            }
        } catch (err) {
            alert("An error occurred");
        }
    };

    const handleToggleReady = async () => {
        const currentPlayer = room?.players.find(p => p.userId === session?.user?.id);
        if (!currentPlayer) return;

        try {
            const response = await fetch(`/api/rooms/${roomId}/ready`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isReady: !currentPlayer.isReady }),
            });

            if (response.ok) {
                loadRoomData();
                // Emit event to notify other players
                emit('room:ready_toggle', {
                    roomId,
                    userId: session?.user?.id,
                    isReady: !currentPlayer.isReady,
                    username: session?.user?.name || session?.user?.email,
                });
            } else {
                const data = await response.json();
                alert(data.error || "Failed to update ready status");
            }
        } catch (err) {
            alert("An error occurred");
        }
    };

    const handleStartGame = async () => {
        try {
            const response = await fetch(`/api/rooms/${roomId}/start`, {
                method: "POST",
            });

            if (response.ok) {
                const data = await response.json();
                // Navigate to game board
                router.push(`/game/${data.gameId}`);
            } else {
                const data = await response.json();
                alert(data.error || "Failed to start game");
            }
        } catch (err) {
            alert("An error occurred");
        }
    };

    const handleLeaveRoom = async () => {
        if (!confirm("Are you sure you want to leave this room?")) return;

        try {
            const response = await fetch(`/api/rooms/${roomId}`, {
                method: "DELETE",
            });

            if (response.ok) {
                // Emit event to notify other players BEFORE navigating away
                emit('room:player_left', {
                    roomId,
                    userId: session?.user?.id,
                    username: session?.user?.name || session?.user?.email,
                });
                router.push("/dashboard");
            } else {
                const data = await response.json();
                alert(data.error || "Failed to leave room");
            }
        } catch (err) {
            alert("An error occurred");
        }
    };

    const copyInviteCode = () => {
        if (room?.inviteCode) {
            navigator.clipboard.writeText(room.inviteCode);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        }
    };

    const getSeatPlayer = (seat: string) => {
        return room?.players.find(p => p.seat === seat);
    };

    const currentPlayer = room?.players.find(p => p.userId === session?.user?.id);
    const allReady = room?.players.length === 4 && room.players.every(p => p.isReady);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950">
                <div className="text-center">
                    <div className="text-4xl mb-4">♠ ♥ ♦ ♣</div>
                    <p className="text-emerald-600 dark:text-emerald-400">Loading room...</p>
                </div>
            </div>
        );
    }

    if (error || !room) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950">
                <div className="text-center bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-xl">
                    <div className="text-4xl mb-4 text-red-600">⚠️</div>
                    <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200 mb-4">
                        {error || "Room not found"}
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

    const SeatCard = ({ position, seat }: { position: string; seat: "NORTH" | "SOUTH" | "EAST" | "WEST" }) => {
        const player = getSeatPlayer(seat);
        const isCurrentPlayer = player?.userId === session?.user?.id;
        const canSelect = !player && currentPlayer;

        return (
            <div
                className={`relative p-6 rounded-xl border-2 transition-all ${player
                    ? isCurrentPlayer
                        ? "bg-emerald-100 dark:bg-emerald-900/30 border-emerald-600"
                        : "bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600"
                    : canSelect
                        ? "bg-gray-50 dark:bg-gray-700/50 border-dashed border-gray-400 dark:border-gray-500 cursor-pointer hover:border-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                        : "bg-gray-50 dark:bg-gray-700/50 border-dashed border-gray-400 dark:border-gray-500"
                    }`}
                onClick={() => canSelect && handleSelectSeat(seat)}
            >
                <div className="text-xs font-bold text-gray-500 dark:text-gray-400 mb-2 uppercase">
                    {position}
                </div>
                {player ? (
                    <div>
                        <div className="flex items-center gap-3 mb-2">
                            <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold">
                                {player.username[0].toUpperCase()}
                            </div>
                            <div>
                                <div className="font-semibold text-gray-800 dark:text-gray-200">
                                    {player.username}
                                </div>
                                <div className="text-xs text-gray-500 dark:text-gray-400">
                                    {player.isReady ? "✓ Ready" : "Not Ready"}
                                </div>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="text-gray-400 dark:text-gray-500 text-sm">
                        {canSelect ? "Click to sit here" : "Waiting for player..."}
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950 p-6">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-6 bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
                    <div className="flex justify-between items-start">
                        <div>
                            <h1 className="text-3xl font-bold text-emerald-800 dark:text-emerald-400 mb-2">
                                {room.name}
                            </h1>
                            <p className="text-gray-600 dark:text-gray-400">
                                Status: <span className="font-semibold">{room.status}</span>
                            </p>
                        </div>
                        <div className="text-right">
                            <div className="text-sm text-gray-600 dark:text-gray-400 mb-2">Invite Code</div>
                            <button
                                onClick={copyInviteCode}
                                className="px-4 py-2 bg-emerald-600 text-white font-mono text-xl rounded-lg hover:bg-emerald-700 transition-colors"
                            >
                                {copied ? "Copied!" : room.inviteCode}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Game Table - 4 Seats Layout */}
                <div className="mb-6">
                    <div className="grid grid-cols-3 gap-4 max-w-4xl mx-auto">
                        {/* North */}
                        <div className="col-start-2">
                            <SeatCard position="North" seat="NORTH" />
                        </div>

                        {/* West and East */}
                        <div className="col-start-1 row-start-2">
                            <SeatCard position="West" seat="WEST" />
                        </div>
                        <div className="col-start-2 row-start-2 flex items-center justify-center">
                            <div className="w-48 h-48 bg-emerald-800 dark:bg-emerald-900 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-2xl">
                                ♠ ♥<br />♦ ♣
                            </div>
                        </div>
                        <div className="col-start-3 row-start-2">
                            <SeatCard position="East" seat="EAST" />
                        </div>

                        {/* South */}
                        <div className="col-start-2 row-start-3">
                            <SeatCard position="South" seat="SOUTH" />
                        </div>
                    </div>
                </div>

                {/* Player Controls */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
                    <div className="flex justify-between items-center">
                        <div>
                            <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
                                Players: {room.players.length}/4
                            </h2>
                            <p className="text-sm text-gray-600 dark:text-gray-400">
                                {allReady
                                    ? "All players ready! Game can start."
                                    : `Waiting for ${4 - room.players.length} more player(s)`}
                            </p>
                        </div>

                        <div className="flex gap-3">
                            {room.creatorId === session?.user?.id && allReady && (
                                <button
                                    onClick={handleStartGame}
                                    className="px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-all duration-200 shadow-md hover:shadow-lg"
                                >
                                    🎮 Start Game
                                </button>
                            )}
                            <button
                                onClick={() => setShowInviteModal(true)}
                                className="px-6 py-3 bg-purple-600 text-white font-semibold rounded-lg hover:bg-purple-700 transition-colors"
                            >
                                Invite Friends
                            </button>
                            {currentPlayer && (
                                <button
                                    onClick={handleToggleReady}
                                    className={`px-6 py-3 rounded-lg font-semibold transition-colors ${currentPlayer.isReady
                                        ? "bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-400 dark:hover:bg-gray-600"
                                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                                        }`}
                                >
                                    {currentPlayer.isReady ? "Not Ready" : "Ready"}
                                </button>
                            )}
                            <button
                                onClick={handleLeaveRoom}
                                className="px-6 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                            >
                                Leave Room
                            </button>
                        </div>
                    </div>
                </div>

                {/* Invite Friends Modal */}
                <InviteFriendsModal
                    roomId={roomId}
                    isOpen={showInviteModal}
                    onClose={() => setShowInviteModal(false)}
                />
            </div>
        </div>
    );
}
