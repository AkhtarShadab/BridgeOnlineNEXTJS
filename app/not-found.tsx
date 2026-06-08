"use client";

export default function NotFound() {
    return (
        <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center p-8 max-w-2xl">
                <div className="mb-8">
                    <h1 className="text-9xl font-bold text-accent mb-4">
                        404
                    </h1>
                    <div className="text-6xl mb-4 text-foreground">♠ ♥ ♦ ♣</div>
                    <h2 className="text-3xl font-semibold text-foreground mb-4">
                        Page Not Found
                    </h2>
                    <p className="text-xl text-text-muted mb-8">
                        Looks like you've bid too high! This page doesn't exist.
                    </p>
                </div>

                <div className="space-y-4">
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
                        Common Bridge Terms:
                    </h3>
                    <div className="grid grid-cols-2 gap-4 text-left text-sm text-text-muted">
                        <div>
                            <strong className="text-accent">Bid:</strong> Promise to win tricks
                        </div>
                        <div>
                            <strong className="text-accent">Trump:</strong> Dominant suit
                        </div>
                        <div>
                            <strong className="text-accent">Dummy:</strong> Partner's hand
                        </div>
                        <div>
                            <strong className="text-accent">Contract:</strong> Final bid
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
