"use client";

import { useEffect, useState } from "react";

interface BidDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    children: React.ReactNode;
}

/**
 * Bottom-sheet wrapper for BiddingBox on mobile.
 * Dark backdrop + slide-up panel, focus-trapped, ESC closes.
 */
export default function BidDrawer({ isOpen, onClose, children }: BidDrawerProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        if (isOpen && !mounted) setMounted(true);
        if (!isOpen && mounted) {
            // delay unmount for animation
            const id = setTimeout(() => setMounted(false), 200);
            return () => clearTimeout(id);
        }
    }, [isOpen, mounted]);

    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") onClose();
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [isOpen, onClose]);

    if (!mounted) return null;

    return (
        <div
            data-testid="bid-drawer-backdrop"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
            onClick={onClose}
        >
            <div
                role="dialog"
                aria-modal="true"
                data-testid="bid-drawer"
                className="absolute bottom-0 left-0 right-0 max-h-[80vh] overflow-y-auto bg-background border-t border-border rounded-t-2xl shadow-2xl transition-transform"
                style={{ transform: isOpen ? "translateY(0)" : "translateY(100%)" }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-center justify-between p-4 border-b border-border">
                    <span className="text-sm font-semibold text-text-muted uppercase tracking-wide">Make a Bid</span>
                    <button
                        data-testid="bid-drawer-close"
                        onClick={onClose}
                        className="text-text-muted hover:text-foreground text-2xl leading-none"
                        aria-label="Close bid drawer"
                    >×</button>
                </div>
                <div className="p-4">
                    {children}
                </div>
            </div>
        </div>
    );
}
