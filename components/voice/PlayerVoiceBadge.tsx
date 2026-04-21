"use client";

import { useEffect, useRef, useState } from "react";
import { VoiceParticipant } from "@/lib/hooks/useVoiceChat";

interface PlayerVoiceBadgeProps {
    participant?: VoiceParticipant;
    isLocal?: boolean;
}

export default function PlayerVoiceBadge({ participant, isLocal }: PlayerVoiceBadgeProps) {
    const audioRef = useRef<HTMLAudioElement>(null);
    const [volume, setVolume] = useState(1);
    const [showSlider, setShowSlider] = useState(false);
    const [playError, setPlayError] = useState(false);

    useEffect(() => {
        if (!participant?.stream) return;

        // Play remote audio ONLY if not local
        if (!isLocal && audioRef.current) {
            audioRef.current.srcObject = participant.stream;
            audioRef.current.play().catch(e => {
                console.warn("Autoplay blocked for remote stream", e);
                setPlayError(true);
            });
        }
    }, [participant?.stream, isLocal]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.volume = volume;
        }
    }, [volume]);

    if (!participant) return null;

    return (
        <div className="flex items-center gap-2 mt-1 relative">
            {/* Visual Speaking Indicator */}
            <div className={`w-3 h-3 rounded-full transition-all duration-100 ${participant.isMuted ? 'bg-red-500' : participant.isSpeaking ? 'bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.7)] animate-pulse' : 'bg-gray-400'}`} title={participant.isMuted ? "Muted" : participant.isSpeaking ? "Speaking" : "Quiet"} />

            {!isLocal && (
                <div className="relative flex items-center gap-2">
                    {playError && (
                        <button
                            onClick={() => {
                                audioRef.current?.play();
                                setPlayError(false);
                            }}
                            className="text-xs bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full animate-bounce"
                        >
                            Play Audio
                        </button>
                    )}
                    <button
                        onClick={(e) => { e.stopPropagation(); setShowSlider(!showSlider); }}
                        className="text-gray-500 hover:text-emerald-600 focus:outline-none"
                        title="Adjust Volume"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            {volume === 0 || participant.isMuted ? (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z m7.414-2.414l4 4m0-4l-4 4" />
                            ) : (
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M17.95 6.05a8 8 0 010 11.9m-8.657-2.657L5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L9.293 15.293h.001z" />
                            )}
                        </svg>
                    </button>

                    {showSlider && (
                        <div className="absolute top-full left-0 mt-2 bg-white dark:bg-gray-800 p-3 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 z-50 w-32 flex flex-col gap-2"
                            onClick={e => e.stopPropagation()}>
                            <span className="text-xs text-gray-500 font-semibold mb-1">Volume: {Math.round(volume * 100)}%</span>
                            <input
                                type="range"
                                min="0" max="1" step="0.05"
                                value={volume}
                                onChange={(e) => setVolume(parseFloat(e.target.value))}
                                className="w-full accent-emerald-500"
                            />
                        </div>
                    )}
                </div>
            )}

            {!isLocal && <audio ref={audioRef} autoPlay playsInline className="hidden" />}
        </div>
    );
}
