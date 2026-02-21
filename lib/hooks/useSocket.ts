import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseSocketOptions {
    roomId?: string;
    enabled?: boolean;
}

interface SocketEvents {
    [key: string]: (...args: any[]) => void;
}

export function useSocket(options: UseSocketOptions = {}) {
    const { roomId, enabled = true } = options;
    const [socket, setSocket] = useState<Socket | null>(null);
    const [connected, setConnected] = useState(false);
    const listenersRef = useRef<SocketEvents>({});

    useEffect(() => {
        if (!enabled) return;

        // Initialize socket connection
        const newSocket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000', {
            autoConnect: true,
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 5,
        });

        newSocket.on('connect', () => {
            console.log('Socket connected:', newSocket.id);
            setConnected(true);

            // Join room if roomId is provided
            if (roomId) {
                newSocket.emit('room:join', { roomId });
            }
        });

        newSocket.on('disconnect', () => {
            console.log('Socket disconnected');
            setConnected(false);
        });

        setSocket(newSocket);

        // Cleanup
        return () => {
            if (roomId) {
                newSocket.emit('room:leave', { roomId });
            }
            newSocket.close();
        };
    }, [enabled, roomId]);

    const on = (event: string, callback: (...args: any[]) => void) => {
        if (socket) {
            socket.on(event, callback);
            listenersRef.current[event] = callback;
        }
    };

    const off = (event: string) => {
        if (socket && listenersRef.current[event]) {
            socket.off(event, listenersRef.current[event]);
            delete listenersRef.current[event];
        }
    };

    const emit = (event: string, ...args: any[]) => {
        if (socket && connected) {
            socket.emit(event, ...args);
        }
    };

    return { socket, connected, on, off, emit };
}
