"use client";

import { useEffect } from "react";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Application error:", error);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center p-8 max-w-2xl">
                <div className="mb-8">
                    <h1 className="text-9xl font-bold text-red-500 mb-4">
                        500
                    </h1>
                    <div className="text-6xl mb-4">♠ ♥ ♦ ♣</div>
                    <h2 className="text-3xl font-semibold text-foreground mb-4">
                        Something Went Wrong
                    </h2>
                    <p className="text-xl text-text-muted mb-4">
                        We've dealt a bad hand! An unexpected error occurred.
                    </p>
                    {error.digest && (
                        <p className="text-sm text-text-muted mb-8 font-mono">
                            Error ID: {error.digest}
                        </p>
                    )}
                </div>

                <div className="space-y-4">
                    <button
                        onClick={reset}
                        className="inline-block px-8 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-lg mr-4"
                    >
                        Try Again
                    </button>
                    <a
                        href="/dashboard"
                        className="inline-block px-8 py-3 bg-accent text-background font-semibold rounded-lg hover:bg-accent-muted transition-colors shadow-lg mr-4"
                    >
                        Go to Dashboard
                    </a>
                    <a
                        href="/"
                        className="inline-block px-8 py-3 bg-surface border border-border text-accent font-semibold rounded-lg hover:bg-surface-elevated transition-colors shadow-lg"
                    >
                        Go to Home
                    </a>
                </div>

                <div className="mt-12 p-6 bg-surface border border-border rounded-xl shadow-lg">
                    <h3 className="text-lg font-semibold text-foreground mb-3">
                        What you can do:
                    </h3>
                    <ul className="text-left text-sm text-text-muted space-y-2">
                        <li className="flex items-start">
                            <span className="text-red-400 mr-2">•</span>
                            <span>Try refreshing the page or clicking "Try Again"</span>
                        </li>
                        <li className="flex items-start">
                            <span className="text-red-400 mr-2">•</span>
                            <span>Check your internet connection</span>
                        </li>
                        <li className="flex items-start">
                            <span className="text-red-400 mr-2">•</span>
                            <span>If the problem persists, contact support with the Error ID above</span>
                        </li>
                    </ul>
                </div>

                {process.env.NODE_ENV === "development" && (
                    <div className="mt-6 p-4 bg-surface-elevated border border-border rounded-lg text-left">
                        <p className="text-xs font-semibold text-foreground mb-2">
                            Development Error Details:
                        </p>
                        <pre className="text-xs text-red-400 overflow-auto">
                            {error.message}
                        </pre>
                        {error.stack && (
                            <pre className="text-xs text-text-muted overflow-auto mt-2">
                                {error.stack}
                            </pre>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
