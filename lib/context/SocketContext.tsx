"use client";

import { createContext, useContext, useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";

interface SocketContextValue {
    socket: Socket | null;
    connected: boolean;
    joinRoom: (roomId: string) => void;
    joinGame: (gameId: string, roomId: string) => void;
}

const SocketContext = createContext<SocketContextValue>({
    socket: null,
    connected: false,
    joinRoom: () => { },
    joinGame: () => { },
});

/**
 * SocketProvider — lives at the root layout level so one socket connection
 * is shared across the entire app. This prevents the socket from being
 * destroyed and recreated on every page navigation.
 */
export function SocketProvider({ children }: { children: React.ReactNode }) {
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connected, setConnected] = useState(false);

    useEffect(() => {
        const newSocket = io(
            process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3000",
            {
                autoConnect: true,
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 10,
            }
        );

        newSocket.on("connect", () => {
            console.log("[Socket] ✅ Connected:", newSocket.id);
            setConnected(true);
        });

        newSocket.on("disconnect", (reason) => {
            console.log("[Socket] ❌ Disconnected:", reason);
            setConnected(false);
        });

        newSocket.on("connect_error", (err) => {
            console.error("[Socket] Connection error:", err.message);
        });

        setSocket(newSocket);

        return () => {
            newSocket.close();
        };
    }, []); // ← created ONCE for the lifetime of the app

    const joinRoom = useCallback(
        (roomId: string) => {
            if (socket && socket.connected && roomId) {
                socket.emit("room:join", { roomId });
                console.log("[Socket] Joined room:", roomId);
            }
        },
        [socket]
    );

    const joinGame = useCallback(
        (gameId: string, roomId: string) => {
            if (socket && socket.connected) {
                socket.emit("game:join", { gameId, roomId });
                console.log("[Socket] Joined game room:", gameId, "/ room:", roomId);
            }
        },
        [socket]
    );

    return (
        <SocketContext.Provider value={{ socket, connected, joinRoom, joinGame }}>
            {children}
        </SocketContext.Provider>
    );
}

export function useSocketContext() {
    return useContext(SocketContext);
}
