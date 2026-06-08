export default function Loading() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center">
                <div className="relative inline-block">
                    {/* Animated card suits */}
                    <div className="flex gap-6 text-6xl mb-6">
                        <span className="animate-bounce text-suit-black" style={{ animationDelay: "0s" }}>
                            ♠
                        </span>
                        <span className="animate-bounce text-suit-red" style={{ animationDelay: "0.2s" }}>
                            ♥
                        </span>
                        <span className="animate-bounce text-suit-red" style={{ animationDelay: "0.4s" }}>
                            ♦
                        </span>
                        <span className="animate-bounce text-suit-black" style={{ animationDelay: "0.6s" }}>
                            ♣
                        </span>
                    </div>
                </div>
                <h2 className="text-2xl font-semibold text-accent mb-2">
                    Loading...
                </h2>
                <p className="text-text-muted">
                    Dealing the cards
                </p>

                {/* Loading bar */}
                <div className="mt-6 w-64 h-2 bg-surface-elevated rounded-full overflow-hidden border border-border">
                    <div className="h-full bg-gradient-to-r from-accent to-accent-muted animate-pulse"></div>
                </div>
            </div>
        </div>
    );
}
