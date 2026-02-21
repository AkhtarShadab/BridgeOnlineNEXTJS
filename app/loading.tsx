export default function Loading() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950">
            <div className="text-center">
                <div className="relative inline-block">
                    {/* Animated card suits */}
                    <div className="flex gap-6 text-6xl mb-6">
                        <span className="animate-bounce" style={{ animationDelay: "0s" }}>
                            ♠
                        </span>
                        <span className="animate-bounce" style={{ animationDelay: "0.2s" }}>
                            ♥
                        </span>
                        <span className="animate-bounce" style={{ animationDelay: "0.4s" }}>
                            ♦
                        </span>
                        <span className="animate-bounce" style={{ animationDelay: "0.6s" }}>
                            ♣
                        </span>
                    </div>
                </div>
                <h2 className="text-2xl font-semibold text-emerald-800 dark:text-emerald-400 mb-2">
                    Loading...
                </h2>
                <p className="text-gray-600 dark:text-gray-400">
                    Dealing the cards
                </p>

                {/* Loading bar */}
                <div className="mt-6 w-64 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-emerald-500 to-teal-500 animate-pulse"></div>
                </div>
            </div>
        </div>
    );
}
