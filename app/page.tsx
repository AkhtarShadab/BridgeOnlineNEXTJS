import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
    // Redirect logged-in users to dashboard
    const session = await auth();
    if (session?.user) {
        redirect("/dashboard");
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-background px-6">
            <div className="text-center space-y-8 p-8 max-w-2xl">
                <p className="halo-eyebrow">Real-time multiplayer bridge</p>
                <h1 className="text-6xl font-bold text-foreground tracking-tight">
                    ♠ ♥ BridgeOnline ♦ ♣
                </h1>
                <p className="text-xl text-text-muted">
                    A calm, focused table for ACBL-rules contract bridge with friends.
                </p>
                <div className="flex items-center justify-center gap-4 pt-4">
                    <a
                        href="/login"
                        className="inline-block px-6 h-10 leading-10 bg-accent text-white font-semibold rounded-[10px] hover:bg-[var(--primary-hover)] transition-colors"
                    >
                        Log In
                    </a>
                    <a
                        href="/register"
                        className="inline-block px-6 h-10 leading-10 bg-surface text-foreground font-semibold rounded-[10px] border border-[var(--border-strong)] hover:bg-surface-elevated transition-colors"
                    >
                        Register
                    </a>
                </div>
                <div className="pt-12 flex flex-wrap items-center justify-center gap-3 text-sm text-text-muted">
                    <span className="halo-chip">✓ ACBL rules</span>
                    <span className="halo-chip">✓ Real-time</span>
                    <span className="halo-chip">✓ Private rooms</span>
                </div>
            </div>
        </div>
    );
}
