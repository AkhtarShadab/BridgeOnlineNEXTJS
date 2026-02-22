import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseSocketOptions {
    roomId?: string;
    enabled?: boolean;
}

export function useSocket(options: UseSocketOptions = {}) {
    const { roomId, enabled = true } = options;
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connected, setConnected] = useState(false);

    // Hold the latest roomId in a ref so the socket's 'connect' handler can
    // always read it without needing to recreate the socket.
    const roomIdRef = useRef<string | undefined>(roomId);
    roomIdRef.current = roomId;

    // Create the socket ONCE (only recreated if `enabled` changes).
    // Joining/leaving rooms is handled separately so the socket stays stable.
    useEffect(() => {
        if (!enabled) return;

        const newSocket = io(
            process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000',
            {
                autoConnect: true,
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionAttempts: 5,
            }
        );

        newSocket.on('connect', () => {
            console.log('Socket connected:', newSocket.id);
            setConnected(true);
            // Re-join the room on every (re)connect so reconnects work too
            if (roomIdRef.current) {
                newSocket.emit('room:join', { roomId: roomIdRef.current });
                console.log('Auto-joined room on connect:', roomIdRef.current);
            }
        });

        newSocket.on('disconnect', () => {
            console.log('Socket disconnected');
            setConnected(false);
        });

        setSocket(newSocket);

        return () => {
            if (roomIdRef.current) {
                newSocket.emit('room:leave', { roomId: roomIdRef.current });
            }
            newSocket.close();
        };
    }, [enabled]); // ← stable: socket is NOT recreated when roomId changes

    // When roomId becomes available (or changes) while already connected,
    // join the new room imperatively on the existing socket.
    useEffect(() => {
        if (socket && connected && roomId) {
            socket.emit('room:join', { roomId });
            console.log('Joined room (roomId effect):', roomId);
        }
    }, [roomId, socket, connected]);

    // Stable callbacks — only recreated when the socket instance changes
    const on = useCallback(
        (event: string, callback: (...args: any[]) => void) => {
            if (socket) {
                socket.on(event, callback);
            }
        },
        [socket]
    );

    const off = useCallback(
        (event: string, callback?: (...args: any[]) => void) => {
            if (socket) {
                if (callback) {
                    socket.off(event, callback);
                } else {
                    socket.off(event);
                }
            }
        },
        [socket]
    );

    const emit = useCallback(
        (event: string, ...args: any[]) => {
            if (socket && connected) {
                socket.emit(event, ...args);
            }
        },
        [socket, connected]
    );

    return { socket, connected, on, off, emit };
}
