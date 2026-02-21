"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function JoinRoomPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [inviteCode, setInviteCode] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    if (status === "unauthenticated") {
        router.push("/login");
        return null;
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const response = await fetch("/api/rooms/join", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ inviteCode: inviteCode.toUpperCase() }),
            });

            const data = await response.json();

            if (response.ok) {
                router.push(`/room/${data.room.id}`);
            } else {
                setError(data.error || "Failed to join room");
            }
        } catch (err) {
            setError("An error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950">
            <div className="max-w-xl mx-auto p-6 pt-20">
                {/* Header */}
                <div className="text-center mb-8">
                    <h1 className="text-4xl font-bold text-emerald-800 dark:text-emerald-400 mb-2">
                        Join Game Room
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Enter the invite code to join an existing game
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
                    {error && (
                        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg text-red-700 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    {/* Invite Code Input */}
                    <div className="mb-6">
                        <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-2">
                            Invite Code
                        </label>
                        <input
                            type="text"
                            value={inviteCode}
                            onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                            placeholder="ABCD1234"
                            required
                            maxLength={10}
                            className="w-full px-4 py-4 text-2xl text-center font-mono tracking-wider border-2 border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white uppercase"
                        />
                        <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                            Enter the 6-10 character code shared by the room host
                        </p>
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4">
                        <button
                            type="submit"
                            disabled={loading || inviteCode.length < 6}
                            className="flex-1 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? "Joining..." : "Join Room"}
                        </button>
                        <button
                            type="button"
                            onClick={() => router.push("/dashboard")}
                            className="px-6 py-3 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 transition-colors"
                        >
                            Cancel
                        </button>
                    </div>
                </form>

                {/* Help Section */}
                <div className="mt-8 bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6">
                    <h2 className="text-xl font-semibold text-gray-800 dark:text-gray-200 mb-3">
                        Don't have an invite code?
                    </h2>
                    <p className="text-gray-600 dark:text-gray-400 mb-4">
                        Ask a friend to create a room and share the invite code with you, or create your own room and invite others to play.
                    </p>
                    <button
                        onClick={() => router.push("/create-room")}
                        className="w-full px-6 py-3 bg-teal-600 text-white font-semibold rounded-lg hover:bg-teal-700 transition-colors"
                    >
                        Create Your Own Room
                    </button>
                </div>
            </div>
        </div>
    );
}
