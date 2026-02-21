import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function Home() {
    // Redirect logged-in users to dashboard
    const session = await auth();
    if (session?.user) {
        redirect("/dashboard");
    }

    return (
        <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950">
            <div className="text-center space-y-8 p-8">
                <h1 className="text-6xl font-bold text-emerald-800 dark:text-emerald-400">
                    ♠ ♥ BridgeOnline ♦ ♣
                </h1>
                <p className="text-2xl text-gray-700 dark:text-gray-300">
                    Real-time Multiplayer Bridge Card Game
                </p>
                <div className="space-y-4 pt-8">
                    <a
                        href="/login"
                        className="inline-block px-8 py-4 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 transition-colors shadow-lg"
                    >
                        Log In
                    </a>
                    <br />
                    <a
                        href="/register"
                        className="inline-block px-8 py-4 bg-white text-emerald-600 font-semibold rounded-lg hover:bg-gray-100 transition-colors shadow-lg border-2 border-emerald-600"
                    >
                        Register
                    </a>
                </div>
                <div className="pt-12 text-sm text-gray-600 dark:text-gray-400">
                    <p>✓ ACBL Rules Compliant</p>
                    <p>✓ Real-time Multiplayer</p>
                    <p>✓ Private Game Rooms</p>
                </div>
            </div>
        </div>
    );
}
