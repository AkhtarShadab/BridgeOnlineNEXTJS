"use client";

/**
 * MagicCard — cursor-following spotlight + border highlight on hover.
 * Adapted from Magic UI: gradient mode only (orb mode dropped), no
 * next-themes (theme awareness comes from the --magic-card-gradient and
 * --background/--border CSS variables, which flip with html.dark), and
 * Tailwind v4 var tokens replaced with this repo's v3 tokens.
 */

import React, { useCallback, useEffect, useRef } from "react";
import { motion, useMotionTemplate, useMotionValue } from "motion/react";
import { cn } from "@/lib/utils";

interface MagicCardProps {
    children?: React.ReactNode;
    className?: string;
    gradientSize?: number;
    gradientColor?: string;
    gradientOpacity?: number;
    gradientFrom?: string;
    gradientTo?: string;
}

export function MagicCard({
    children,
    className,
    gradientSize = 200,
    gradientColor = "var(--magic-card-gradient)",
    gradientOpacity = 0.8,
    gradientFrom = "var(--accent)",
    gradientTo = "var(--accent-muted)",
}: MagicCardProps) {
    const mouseX = useMotionValue(-gradientSize);
    const mouseY = useMotionValue(-gradientSize);
    const gradientSizeRef = useRef(gradientSize);

    useEffect(() => {
        gradientSizeRef.current = gradientSize;
    }, [gradientSize]);

    const reset = useCallback(() => {
        const off = -gradientSizeRef.current;
        mouseX.set(off);
        mouseY.set(off);
    }, [mouseX, mouseY]);

    const handlePointerMove = useCallback(
        (e: React.PointerEvent<HTMLDivElement>) => {
            const rect = e.currentTarget.getBoundingClientRect();
            mouseX.set(e.clientX - rect.left);
            mouseY.set(e.clientY - rect.top);
        },
        [mouseX, mouseY],
    );

    useEffect(() => {
        reset();
        const handleGlobalPointerOut = (e: PointerEvent) => {
            if (!e.relatedTarget) reset();
        };
        const handleBlur = () => reset();
        window.addEventListener("pointerout", handleGlobalPointerOut);
        window.addEventListener("blur", handleBlur);
        return () => {
            window.removeEventListener("pointerout", handleGlobalPointerOut);
            window.removeEventListener("blur", handleBlur);
        };
    }, [reset]);

    return (
        <motion.div
            className={cn("group relative isolate overflow-hidden rounded-[inherit] border border-transparent", className)}
            onPointerMove={handlePointerMove}
            onPointerLeave={reset}
            style={{
                background: useMotionTemplate`
          linear-gradient(var(--surface) 0 0) padding-box,
          radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
            ${gradientFrom},
            ${gradientTo},
            var(--border) 100%
          ) border-box
        `,
            }}
        >
            <div className="absolute inset-px z-20 rounded-[inherit] bg-surface" />
            <motion.div
                suppressHydrationWarning
                className="pointer-events-none absolute inset-px z-30 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100"
                style={{
                    background: useMotionTemplate`
            radial-gradient(${gradientSize}px circle at ${mouseX}px ${mouseY}px,
              ${gradientColor},
              transparent 100%
            )
          `,
                    opacity: gradientOpacity,
                }}
            />
            <div className="relative z-40">{children}</div>
        </motion.div>
    );
}
