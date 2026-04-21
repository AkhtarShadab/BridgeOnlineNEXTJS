"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSocketContext } from "@/lib/context/SocketContext";
import { useSession } from "next-auth/react";
import { VoiceManager } from "../voice/webrtc-manager";

export interface VoiceParticipant {
    userId: string;
    stream: MediaStream | null;
    isMuted: boolean;
    isSpeaking: boolean;
}

export function useVoiceChat(roomId: string | null, peersInRoom: string[]) {
    const { socket, connected } = useSocketContext();
    const { data: session } = useSession();

    const [participants, setParticipants] = useState<Record<string, VoiceParticipant>>({});
    const [isMuted, setIsMuted] = useState(false);
    const [isJoined, setIsJoined] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const managerRef = useRef<VoiceManager | null>(null);

    // Initialize the manager once socket and session are ready
    useEffect(() => {
        if (!socket || !connected || !session?.user || !roomId) return;

        const userId = session.user.id;
        const manager = new VoiceManager(socket as any, userId);

        manager.onStreamAdded = (peerId, stream) => {
            setParticipants(prev => ({
                ...prev,
                [peerId]: {
                    userId: peerId,
                    stream: stream,
                    isMuted: prev[peerId]?.isMuted || false,
                    isSpeaking: prev[peerId]?.isSpeaking || false
                }
            }));
        };

        manager.onStreamRemoved = (peerId) => {
            setParticipants(prev => {
                const updated = { ...prev };
                delete updated[peerId];
                return updated;
            });
        };

        manager.onUserMuted = (peerId, muted) => {
            setParticipants(prev => {
                if (!prev[peerId]) return prev;
                return {
                    ...prev,
                    [peerId]: {
                        ...prev[peerId],
                        isMuted: muted
                    }
                };
            });
        };

        manager.onUserSpeaking = (peerId, isSpeaking) => {
            setParticipants(prev => {
                if (!prev[peerId]) return prev;
                return {
                    ...prev,
                    [peerId]: {
                        ...prev[peerId],
                        isSpeaking
                    }
                };
            });
        };

        manager.onError = (err) => {
            setError(err);
            setIsJoined(false);
        };

        managerRef.current = manager;

        return () => {
            manager.disconnect();
            managerRef.current = null;
        };
    }, [socket, connected, session?.user, roomId]);

    const joinVoice = useCallback(async () => {
        if (!managerRef.current || !roomId || isJoined) return;

        setError(null);
        await managerRef.current.initializeAndJoin(roomId, peersInRoom);
        setIsJoined(true);
    }, [roomId, peersInRoom, isJoined]);

    const leaveVoice = useCallback(() => {
        if (managerRef.current) {
            managerRef.current.disconnect();
        }
        setIsJoined(false);
        setParticipants({});
        setIsMuted(false);
    }, []);

    const toggleMute = useCallback(() => {
        if (managerRef.current) {
            const newMutedState = !isMuted;
            managerRef.current.toggleMute(newMutedState);
            setIsMuted(newMutedState);

            // Optimistically update our own state in the participants list
            if (session?.user?.id) {
                const myId = session.user.id;
                setParticipants(prev => {
                    if (!prev[myId]) return prev;
                    return {
                        ...prev,
                        [myId]: {
                            ...prev[myId],
                            isMuted: newMutedState
                        }
                    };
                });
            }
        }
    }, [isMuted, session?.user]);

    return {
        isJoined,
        isMuted,
        participants: Object.values(participants),
        error,
        joinVoice,
        leaveVoice,
        toggleMute
    };
}
