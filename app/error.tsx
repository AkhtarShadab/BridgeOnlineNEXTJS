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
        // Log the error to an error reporting service
        console.error("Application error:", error);
    }, [error]);

    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 to-orange-100 dark:from-gray-900 dark:to-red-950">
            <div className="text-center p-8 max-w-2xl">
                <div className="mb-8">
                    <h1 className="text-9xl font-bold text-red-600 dark:text-red-400 mb-4">
                        500
                    </h1>
                    <div className="text-6xl mb-4">😰 ♠ ♥ ♦ ♣</div>
                    <h2 className="text-3xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                        Something Went Wrong
                    </h2>
                    <p className="text-xl text-gray-600 dark:text-gray-400 mb-4">
                        We've dealt a bad hand! An unexpected error occurred.
                    </p>
                    {error.digest && (
                        <p className="text-sm text-gray-500 dark:text-gray-500 mb-8 font-mono">
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
                        className="inline-block px-8 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg mr-4"
                    >
                        Go to Dashboard
                    </a>
                    <a
                        href="/"
                        className="inline-block px-8 py-3 bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 font-semibold rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors shadow-lg border-2 border-emerald-600 dark:border-emerald-400"
                    >
                        Go to Home
                    </a>
                </div>

                <div className="mt-12 p-6 bg-white dark:bg-gray-800 rounded-xl shadow-lg">
                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-3">
                        What you can do:
                    </h3>
                    <ul className="text-left text-sm text-gray-600 dark:text-gray-400 space-y-2">
                        <li className="flex items-start">
                            <span className="text-red-600 dark:text-red-400 mr-2">•</span>
                            <span>Try refreshing the page or clicking "Try Again"</span>
                        </li>
                        <li className="flex items-start">
                            <span className="text-red-600 dark:text-red-400 mr-2">•</span>
                            <span>Check your internet connection</span>
                        </li>
                        <li className="flex items-start">
                            <span className="text-red-600 dark:text-red-400 mr-2">•</span>
                            <span>If the problem persists, contact support with the Error ID above</span>
                        </li>
                    </ul>
                </div>

                {process.env.NODE_ENV === "development" && (
                    <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-900 rounded-lg text-left">
                        <p className="text-xs font-semibold text-gray-700 dark:text-gray-300 mb-2">
                            Development Error Details:
                        </p>
                        <pre className="text-xs text-red-600 dark:text-red-400 overflow-auto">
                            {error.message}
                        </pre>
                        {error.stack && (
                            <pre className="text-xs text-gray-600 dark:text-gray-500 overflow-auto mt-2">
                                {error.stack}
                            </pre>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
