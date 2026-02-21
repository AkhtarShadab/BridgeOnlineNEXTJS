"use client";

import { useEffect } from "react";
import "./globals.css";

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Global error:", error);
    }, [error]);

    return (
        <html>
            <body>
                <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 dark:from-gray-900 dark:to-red-950">
                    <div className="text-center p-8 max-w-2xl">
                        <div className="mb-8">
                            <h1 className="text-9xl font-bold text-red-600 dark:text-red-400 mb-4">
                                Oops!
                            </h1>
                            <div className="text-6xl mb-4">💔 ♠ ♥ ♦ ♣</div>
                            <h2 className="text-3xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                                Critical Error
                            </h2>
                            <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
                                The app encountered a critical error. Let's reshuffle and try again!
                            </p>
                        </div>

                        <div className="space-y-4">
                            <button
                                onClick={reset}
                                className="inline-block px-8 py-3 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors shadow-lg"
                            >
                                Reload Application
                            </button>
                        </div>

                        {process.env.NODE_ENV === "development" && error && (
                            <div className="mt-8 p-4 bg-gray-100 dark:bg-gray-900 rounded-lg text-left">
                                <p className="text-xs font-semibold text-gray-700  dark:text-gray-300 mb-2">
                                    Error Details:
                                </p>
                                <pre className="text-xs text-red-600 dark:text-red-400 overflow-auto">
                                    {error.message}
                                </pre>
                            </div>
                        )}
                    </div>
                </div>
            </body>
        </html>
    );
}
