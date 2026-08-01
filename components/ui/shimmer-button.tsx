"use client";

/**
 * ShimmerButton — a light spark travelling around the button perimeter.
 * Adapted from Magic UI for Tailwind 3.4 (v4-only classes replaced with
 * arbitrary properties: `@container-[size]` → `[container-type:size]`,
 * `inset-(--cut)` → `[inset:var(--cut)]`). Keyframes `shimmer-slide` and
 * `spin-around` live in tailwind.config.ts.
 *
 * Accepts an optional `href` — renders an <a> instead of a <button> so
 * navigation CTAs stay real links (e2e text/nav selectors depend on it).
 */

import React, { type CSSProperties } from "react";
import { cn } from "@/lib/utils";

export interface ShimmerButtonProps extends React.HTMLAttributes<HTMLElement> {
    href?: string;
    shimmerColor?: string;
    shimmerSize?: string;
    borderRadius?: string;
    shimmerDuration?: string;
    background?: string;
    children?: React.ReactNode;
    type?: "button" | "submit";
}

export function ShimmerButton({
    href,
    shimmerColor = "#ffffff",
    shimmerSize = "0.05em",
    shimmerDuration = "3s",
    borderRadius = "100px",
    background = "var(--accent)",
    className,
    children,
    type = "button",
    ...props
}: ShimmerButtonProps) {
    const style = {
        "--spread": "90deg",
        "--shimmer-color": shimmerColor,
        "--radius": borderRadius,
        "--speed": shimmerDuration,
        "--cut": shimmerSize,
        "--bg": background,
    } as CSSProperties;

    const classes = cn(
        "group relative z-0 flex cursor-pointer items-center justify-center overflow-hidden [border-radius:var(--radius)] border border-white/10 px-6 py-3 whitespace-nowrap text-white [background:var(--bg)]",
        "transform-gpu transition-transform duration-300 ease-in-out active:translate-y-px",
        className,
    );

    const inner = (
        <>
            {/* spark container */}
            <div className={cn("-z-30 blur-[2px]", "absolute inset-0 overflow-visible [container-type:size]")}>
                {/* spark */}
                <div className="absolute inset-0 aspect-square h-[100cqh] animate-shimmer-slide rounded-none [mask:none]">
                    <div className="absolute -inset-full w-auto rotate-0 animate-spin-around [translate:0_0] [background:conic-gradient(from_calc(270deg-(var(--spread)*0.5)),transparent_0,var(--shimmer-color)_var(--spread),transparent_var(--spread))]" />
                </div>
            </div>
            {children}
            {/* highlight */}
            <div className="absolute inset-0 size-full rounded-2xl px-4 py-1.5 text-sm font-medium shadow-[inset_0_-8px_10px_#ffffff1f] transform-gpu transition-all duration-300 ease-in-out group-hover:shadow-[inset_0_-6px_10px_#ffffff3f] group-active:shadow-[inset_0_-10px_10px_#ffffff3f]" />
            {/* backdrop */}
            <div className="absolute -z-20 [border-radius:var(--radius)] [background:var(--bg)] [inset:var(--cut)]" />
        </>
    );

    if (href) {
        return (
            <a href={href} style={style} className={classes} {...(props as React.AnchorHTMLAttributes<HTMLAnchorElement>)}>
                {inner}
            </a>
        );
    }
    return (
        <button type={type} style={style} className={classes} {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}>
            {inner}
        </button>
    );
}
