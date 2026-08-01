/**
 * Imperative confetti helper (canvas-confetti). Fired by ScoreCard when the
 * viewer's team wins a board. Respects prefers-reduced-motion.
 */

import confetti from "canvas-confetti";

export function fireConfetti(options?: confetti.Options): void {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    void confetti({
        particleCount: 120,
        spread: 75,
        origin: { y: 0.6 },
        ...options,
    });
}
