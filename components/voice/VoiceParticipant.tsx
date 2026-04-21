"use client";

import { useEffect, useRef } from "react";
import { VoiceParticipant as VParticipant } from "@/lib/hooks/useVoiceChat";

interface VoiceParticipantProps {
    participant: VParticipant;
    username: string;
    isLocal?: boolean;
}

export default function VoiceParticipant({ participant, username, isLocal }: VoiceParticipantProps) {
    const audioRef = useRef<HTMLAudioElement>(null);

    useEffect(() => {
        if (audioRef.current && participant.stream && !isLocal) {
            audioRef.current.srcObject = participant.stream;
        }
    }, [participant.stream, isLocal]);

    return (
        <div className="flex flex-col items-center justify-center p-2 rounded-lg bg-gray-50 dark:bg-gray-800 shadow-sm border border-gray-200 dark:border-gray-700 w-24">
            <div className="relative">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white shadow-inner mb-2 ${participant.isMuted ? 'bg-gray-400' : 'bg-emerald-500'}`}>
                    {username ? username.charAt(0).toUpperCase() : '?'}
                </div>

                {/* Muted Icon Overlay */}
                {participant.isMuted && (
                    <div className="absolute -bottom-1 -right-1 bg-red-500 rounded-full p-1 shadow">
                        <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4l16 16" />
                        </svg>
                    </div>
                )}
            </div>

            <div className="text-xs font-semibold text-gray-700 dark:text-gray-300 truncate w-full text-center" title={username}>
                {username} {isLocal ? "(You)" : ""}
            </div>

            {/* Hidden audio element for remote streams */}
            {!isLocal && (
                <audio ref={audioRef} autoPlay playsInline muted={participant.isMuted} />
            )}
        </div>
    );
}
