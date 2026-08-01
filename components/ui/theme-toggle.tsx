"use client";

/**
 * Light/dark theme toggle — adapted from Magic UI's AnimatedThemeToggler.
 * Uncontrolled: owns the `dark` class on <html> and persists to
 * localStorage["theme"] (paired with the no-flash script in app/layout.tsx,
 * which defaults to dark). Animates the switch with a View Transitions
 * circle reveal from the button; falls back to an instant toggle where
 * startViewTransition is unavailable.
 *
 * Hidden on /game/* — the table is dark-only by design (see globals.css
 * .table-theme), so a toggle there would do nothing visible.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

function SunIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
    );
}

function MoonIcon() {
    return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
    );
}

interface AnimatedThemeTogglerProps extends React.ComponentPropsWithoutRef<"button"> {
    duration?: number;
}

export function AnimatedThemeToggler({ className, duration = 400, ...props }: AnimatedThemeTogglerProps) {
    const [isDark, setIsDark] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const isTransitioningRef = useRef(false);

    // Track the class the no-flash script (or another toggle) applied.
    useEffect(() => {
        const update = () => setIsDark(document.documentElement.classList.contains("dark"));
        update();
        const observer = new MutationObserver(update);
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
        return () => observer.disconnect();
    }, []);

    const toggleTheme = useCallback(() => {
        const button = buttonRef.current;
        if (!button || isTransitioningRef.current) return;

        const applyTheme = () => {
            const next = !document.documentElement.classList.contains("dark");
            document.documentElement.classList.toggle("dark");
            setIsDark(next);
            try {
                localStorage.setItem("theme", next ? "dark" : "light");
            } catch {
                /* private browsing — theme just won't persist */
            }
        };

        if (typeof document.startViewTransition !== "function") {
            applyTheme();
            return;
        }

        const { top, left, width, height } = button.getBoundingClientRect();
        const x = left + width / 2;
        const y = top + height / 2;
        const maxRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));

        isTransitioningRef.current = true;
        const transition = document.startViewTransition(() => {
            flushSync(applyTheme);
        });
        transition.finished.finally(() => {
            isTransitioningRef.current = false;
        }).catch(() => {});
        transition.ready
            .then(() => {
                document.documentElement.animate(
                    { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${maxRadius}px at ${x}px ${y}px)`] },
                    { duration, easing: "ease-in-out", pseudoElement: "::view-transition-new(root)" },
                );
            })
            .catch(() => {});
    }, [duration]);

    return (
        <button
            type="button"
            ref={buttonRef}
            onClick={toggleTheme}
            className={cn(className)}
            aria-label="Toggle theme"
            data-testid="theme-toggle"
            {...props}
        >
            {isDark ? <SunIcon /> : <MoonIcon />}
            <span className="sr-only">Toggle theme</span>
        </button>
    );
}

/** Globally-mounted toggle chip (app/layout.tsx). Hidden on game routes.
 *  Bottom-right: top-right collides with the dashboard's Sign Out button, and
 *  the toast stack (bottom-right) only exists on /game/* where this is hidden. */
export function ThemeToggle() {
    const pathname = usePathname();
    if (pathname?.startsWith("/game/")) return null;
    return (
        <AnimatedThemeToggler className="fixed bottom-4 right-4 z-[60] flex h-9 w-9 items-center justify-center rounded-full border border-border text-foreground shadow-lg backdrop-blur transition-colors hover:bg-surface-elevated" style={{ backgroundColor: "color-mix(in srgb, var(--surface) 80%, transparent)" }} />
    );
}
