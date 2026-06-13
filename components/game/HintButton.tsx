"use client";

import { useState } from "react";

interface HintButtonProps {
    gameId: string;
    disabled: boolean; // true when not the viewer's turn
    phase: "BIDDING" | "PLAYING";
}

/**
 * AI Hint button. Calls POST /api/games/:id/hint and shows the response.
 * Loading: spinner + "Thinking…". Result: panel with suggestion + reasoning.
 * Error: small red message, auto-clears after 5s.
 */
export default function HintButton({ gameId, disabled, phase }: HintButtonProps) {
    const [state, setState] = useState<"idle" | "loading" | "result" | "error">("idle");
    const [hint, setHint] = useState<{ suggestion: string; reasoning: string } | null>(null);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const requestHint = async () => {
        if (disabled || state === "loading") return;
        setState("loading");
        setHint(null);
        setErrorMsg(null);

        try {
            const res = await fetch(`/api/games/${gameId}/hint`, { method: "POST" });
            if (res.ok) {
                const data = await res.json();
                setHint(data);
                setState("result");
            } else {
                const data = await res.json().catch(() => ({}));
                setErrorMsg(data.error || "Could not get hint");
                setState("error");
                setTimeout(() => setState("idle"), 5000);
            }
        } catch {
            setErrorMsg("Network error");
            setState("error");
            setTimeout(() => setState("idle"), 5000);
        }
    };

    return (
        <div data-testid="hint-button-container" className="mt-2">
            <button
                data-testid="hint-button"
                onClick={requestHint}
                disabled={disabled || state === "loading"}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg border transition-colors ${
                    disabled
                        ? "opacity-40 cursor-not-allowed border-border text-text-muted"
                        : "border-accent text-accent hover:bg-accent/10"
                }`}
            >
                {state === "loading" ? (
                    <span className="flex items-center gap-2">
                        <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                        </svg>
                        Thinking…
                    </span>
                ) : (
                    "Get Hint 💡"
                )}
            </button>

            {state === "result" && hint && (
                <div data-testid="hint-panel" className="mt-3 p-4 bg-surface-elevated border border-border rounded-xl">
                    <div className="flex justify-between items-start mb-2">
                        <span className="text-xs font-semibold text-accent uppercase tracking-wide">
                            {phase === "BIDDING" ? "Suggested Bid" : "Suggested Play"}
                        </span>
                        <button
                            onClick={() => setState("idle")}
                            className="text-text-muted hover:text-foreground"
                            aria-label="Dismiss hint"
                        >×</button>
                    </div>
                    <p data-testid="hint-suggestion" className="text-lg font-bold text-foreground mb-2">{hint.suggestion}</p>
                    <p data-testid="hint-reasoning" className="text-sm text-text-muted">{hint.reasoning}</p>
                </div>
            )}

            {state === "error" && errorMsg && (
                <p data-testid="hint-error" className="mt-2 text-sm text-red-400">{errorMsg}</p>
            )}
        </div>
    );
}
