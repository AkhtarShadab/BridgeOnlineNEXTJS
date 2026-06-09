import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { ActiveRoomChecker } from "@/components/ActiveRoomChecker";

export default async function DashboardPage() {
    const session = await auth();

    if (!session?.user) {
        redirect("/login");
    }

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
                    <div
                        data-testid="stats-strip"
                        className="flex gap-8 items-center bg-surface/80 backdrop-blur-sm border border-border rounded-xl px-6 py-4 mb-8"
                    >
                        <div className="text-center">
                            <div className="text-2xl font-bold text-accent">0</div>
                            <div className="text-xs text-text-muted uppercase tracking-wide">Games Played</div>
                        </div>
                        <div className="w-px h-8 bg-border" />
                        <div className="text-center">
                            <div className="text-2xl font-bold text-accent">—</div>
                            <div className="text-xs text-text-muted uppercase tracking-wide">Win Rate</div>
                        </div>
                        <div className="w-px h-8 bg-border" />
                        <div className="text-center">
                            <div className="text-2xl font-bold text-accent">—</div>
                            <div className="text-xs text-text-muted uppercase tracking-wide">Rank</div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {/* User Profile Card */}
                        <div className="bg-surface/80 backdrop-blur-sm border border-border p-6 rounded-xl shadow-lg">
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

                        {/* Create Room Card */}
                        <div className="bg-surface/80 backdrop-blur-sm border border-border p-6 rounded-xl shadow-lg">
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

                        {/* Join Room Card */}
                        <div className="bg-surface/80 backdrop-blur-sm border border-border p-6 rounded-xl shadow-lg">
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

                        {/* Room Invitations Card */}
                        <div className="bg-surface/80 backdrop-blur-sm border border-border p-6 rounded-xl shadow-lg">
                            <h2 className="text-2xl font-bold text-foreground mb-4">
                                Room Invitations
                            </h2>
                            <p className="text-text-muted mb-4">
                                View and accept invitations from your friends
                            </p>
                            <a
                                href="/invitations"
                                className="inline-block w-full text-center px-6 py-3 bg-orange-600 text-white font-semibold rounded-lg hover:bg-orange-700 transition-colors"
                            >
                                View Invitations
                            </a>
                        </div>

                        {/* Friends Card */}
                        <div className="bg-surface/80 backdrop-blur-sm border border-border p-6 rounded-xl shadow-lg">
                            <h2 className="text-2xl font-bold text-foreground mb-4">
                                Friends
                            </h2>
                            <p className="text-text-muted mb-4">
                                Manage your friends and find new players to play with
                            </p>
                            <a
                                href="/dashboard/friends"
                                className="inline-block w-full text-center px-6 py-3 bg-team-ew text-background font-semibold rounded-lg hover:opacity-90 transition-opacity"
                            >
                                View Friends
                            </a>
                        </div>
                    </div>

                    {/* How to Play Section */}
                    <div className="mt-12 bg-surface/80 backdrop-blur-sm border border-border p-8 rounded-xl shadow-lg">
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
