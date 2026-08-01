import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ActiveRoomChecker } from "@/components/ActiveRoomChecker";
import { prisma } from "@/lib/db";
import { normalizeStats, winRatePct } from "@/lib/game/stats";
import { NumberTicker } from "@/components/ui/number-ticker";
import { MagicCard } from "@/components/ui/magic-card";
import { BlurFade } from "@/components/ui/blur-fade";

export default async function DashboardPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

    // Feature 14: real player stats for the signed-in user.
    const userRow = session.user.id
        ? await prisma.user.findUnique({
              where: { id: session.user.id },
              select: { stats: true },
          })
        : null;
    const stats = normalizeStats(userRow?.stats);
    const winRate = winRatePct(stats);

    return (
        <ActiveRoomChecker>
            <div className="min-h-screen bg-background">
                <div className="container mx-auto px-4 py-8">
                    <div className="flex justify-between items-center mb-6">
                        <h1 className="text-4xl font-bold text-accent">
                            ♠ ♥ BridgeOnline ♦ ♣
                        </h1>
                        <div className="flex items-center gap-4">
                            <span className="text-text-muted">
                                Welcome, {session.user.name}
                            </span>
                            <form action={async () => {
                                "use server";
                                const { signOut } = await import("@/lib/auth");
                                await signOut();
                            }}>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                                >
                                    Sign Out
                                </button>
                            </form>
                        </div>
                    </div>

                    {/* Stats strip */}
                    <BlurFade delay={0.1}>
                    <div
                        data-testid="stats-strip"
                        className="flex gap-8 items-center bg-surface border border-border rounded-xl px-6 py-4 mb-8"
                    >
                        {/* NumberTicker animates only the last stretch (startValue) so the
                            spring settles fast — large jumps (e.g. 0→100%) would otherwise
                            still be mid-count when e2e's 5s toHaveText window closes. */}
                        <div className="text-center">
                            <div data-testid="games-played" className="halo-metric text-2xl font-bold text-accent">
                                {stats.gamesPlayed === 0 ? (
                                    "0"
                                ) : (
                                    <NumberTicker
                                        value={stats.gamesPlayed}
                                        startValue={Math.max(0, stats.gamesPlayed - 15)}
                                        className="text-accent"
                                    />
                                )}
                            </div>
                            <div className="halo-eyebrow mt-1">Games Played</div>
                        </div>
                        <div className="w-px h-8 bg-border" />
                        <div className="text-center">
                            <div data-testid="win-rate" className="halo-metric text-2xl font-bold text-accent">
                                {winRate === null ? (
                                    "—"
                                ) : (
                                    <>
                                        <NumberTicker
                                            value={winRate}
                                            startValue={Math.max(0, winRate - 15)}
                                            className="text-accent"
                                        />%
                                    </>
                                )}
                            </div>
                            <div className="halo-eyebrow mt-1">Win Rate</div>
                        </div>
                        <div className="w-px h-8 bg-border" />
                        <div className="text-center">
                            <div
                                data-testid="rank"
                                className="halo-metric text-2xl font-bold text-accent"
                                title="Rank arrives with the leaderboard feature"
                            >
                                —
                            </div>
                            <div className="halo-eyebrow mt-1">Rank</div>
                        </div>
                    </div>
                    </BlurFade>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* User Profile Card */}
                        <BlurFade delay={0.15}>
                        <MagicCard className="rounded-2xl h-full">
                            <div className="p-6">
                            <h2 className="text-2xl font-bold text-foreground mb-4">
                                Your Profile
                            </h2>
                            <div className="space-y-2">
                                <p className="text-text-muted">
                                    <span className="font-semibold text-foreground">Username:</span> {session.user.name}
                                </p>
                                <p className="text-text-muted">
                                    <span className="font-semibold text-foreground">Email:</span> {session.user.email}
                                </p>
                            </div>
                            </div>
                        </MagicCard>
                        </BlurFade>

                        {/* Create Room Card */}
                        <BlurFade delay={0.2}>
                        <MagicCard className="rounded-2xl h-full">
                            <div className="p-6">
                            <h2 className="text-2xl font-bold text-foreground mb-4">
                                New Game
                            </h2>
                            <p className="text-text-muted mb-4">
                                Create a new game room and invite friends to play Bridge
                            </p>
                            <a
                                href="/create-room"
                                className="inline-block w-full text-center px-6 py-3 bg-accent text-background font-semibold rounded-lg hover:bg-accent-muted transition-colors"
                            >
                                Create Room
                            </a>
                            </div>
                        </MagicCard>
                        </BlurFade>

                        {/* Join Room Card */}
                        <BlurFade delay={0.25}>
                        <MagicCard className="rounded-2xl h-full">
                            <div className="p-6">
                            <h2 className="text-2xl font-bold text-foreground mb-4">
                                Join Game
                            </h2>
                            <p className="text-text-muted mb-4">
                                Enter an invite code to join an existing game
                            </p>
                            <a
                                href="/join-room"
                                className="inline-block w-full text-center px-6 py-3 bg-accent-muted text-background font-semibold rounded-lg hover:bg-accent transition-colors"
                            >
                                Join Room
                            </a>
                            </div>
                        </MagicCard>
                        </BlurFade>

                        {/* Room Invitations Card */}
                        <BlurFade delay={0.3}>
                        <MagicCard className="rounded-2xl h-full">
                            <div className="p-6">
                            <h2 className="text-2xl font-bold text-foreground mb-4">
                                Room Invitations
                            </h2>
                            <p className="text-text-muted mb-4">
                                View and accept invitations from your friends
                            </p>
                            <a
                                href="/invitations"
                                className="inline-block w-full text-center px-6 py-3 bg-surface-elevated text-foreground font-semibold rounded-lg border border-[var(--border-strong)] hover:bg-border transition-colors"
                            >
                                View Invitations
                            </a>
                            </div>
                        </MagicCard>
                        </BlurFade>

                        {/* Friends Card */}
                        <BlurFade delay={0.35}>
                        <MagicCard className="rounded-2xl h-full">
                            <div className="p-6">
                            <h2 className="text-2xl font-bold text-foreground mb-4">
                                Friends
                            </h2>
                            <p className="text-text-muted mb-4">
                                Manage your friends and find new players to play with
                            </p>
                            <a
                                href="/dashboard/friends"
                                className="inline-block w-full text-center px-6 py-3 bg-surface-elevated text-foreground font-semibold rounded-lg border border-[var(--border-strong)] hover:bg-border transition-colors"
                            >
                                View Friends
                            </a>
                            </div>
                        </MagicCard>
                        </BlurFade>
                    </div>

                    {/* How to Play Section */}
                    <div className="mt-12 bg-surface border border-border p-8 rounded-2xl">
                        <h2 className="text-3xl font-bold text-foreground mb-6">
                            How to Play
                        </h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-text-muted">
                            <div>
                                <h3 className="text-xl font-semibold text-accent mb-2">
                                    1. Create or Join a Room
                                </h3>
                                <p>
                                    Start by creating a new game room or joining an existing one with an invite code. You'll need 4 players total.
                                </p>
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-accent mb-2">
                                    2. The Bidding Phase
                                </h3>
                                <p>
                                    Players bid to declare the contract. Bids range from 1♣ to 7NT. Pass, Double, or Redouble are also available.
                                </p>
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-accent mb-2">
                                    3. Playing the Hand
                                </h3>
                                <p>
                                    The declarer and dummy try to win enough tricks to fulfill the contract. Opponents try to stop them.
                                </p>
                            </div>
                            <div>
                                <h3 className="text-xl font-semibold text-accent mb-2">
                                    4. Scoring
                                </h3>
                                <p>
                                    Points are awarded based on the contract level, tricks won, and vulnerability. Make your contract to score!
                                </p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </ActiveRoomChecker>
    );
}
