"use client";

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950">
            <div className="text-center p-8 max-w-2xl">
                <div className="mb-8">
                    <h1 className="text-9xl font-bold text-emerald-600 dark:text-emerald-400 mb-4">
                        404
                    </h1>
                    <div className="text-6xl mb-4">♠ ♥ ♦ ♣</div>
                    <h2 className="text-3xl font-semibold text-gray-800 dark:text-gray-200 mb-4">
                        Page Not Found
                    </h2>
                    <p className="text-xl text-gray-600 dark:text-gray-400 mb-8">
                        Looks like you've bid too high! This page doesn't exist.
                    </p>
                </div>

                <div className="space-y-4">
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
                        Common Bridge Terms:
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-left text-sm text-gray-600 dark:text-gray-400">
                        <div>
                            <strong className="text-emerald-600 dark:text-emerald-400">Bid:</strong> Promise to win tricks
                        </div>
                        <div>
                            <strong className="text-emerald-600 dark:text-emerald-400">Trump:</strong> Dominant suit
                        </div>
                        <div>
                            <strong className="text-emerald-600 dark:text-emerald-400">Dummy:</strong> Partner's hand
                        </div>
                        <div>
                            <strong className="text-emerald-600 dark:text-emerald-400">Contract:</strong> Final bid
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
