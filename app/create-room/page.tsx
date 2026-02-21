"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function CreateRoomPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [roomName, setRoomName] = useState("");
    const [biddingSystem, setBiddingSystem] = useState("SAYC");
    const [numBoards, setNumBoards] = useState(1);
    const [timerEnabled, setTimerEnabled] = useState(true);
    const [timerDuration, setTimerDuration] = useState(90);
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
            const response = await fetch("/api/rooms/create", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    name: roomName,
                    settings: {
                        biddingSystem,
                        numBoards,
                        timerEnabled,
                        timerDuration,
                    },
                }),
            });

            const data = await response.json();

            if (response.ok) {
                router.push(`/room/${data.roomId}`);
            } else {
                setError(data.error || "Failed to create room");
            }
        } catch (err) {
            setError("An error occurred. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950">
            <div className="max-w-2xl mx-auto p-6">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-emerald-800 dark:text-emerald-400 mb-2">
                        Create Game Room
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Set up a new Bridge game room and invite your friends
                    </p>
                </div>

                {/* Form */}
                <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8">
                    {error && (
                        <div className="mb-6 p-4 bg-red-100 dark:bg-red-900/30 border border-red-400 dark:border-red-700 rounded-lg text-red-700 dark:text-red-400">
                            {error}
                        </div>
                    )}

                    {/* Room Name */}
                    <div className="mb-6">
                        <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-2">
                            Room Name
                        </label>
                        <input
                            type="text"
                            value={roomName}
                            onChange={(e) => setRoomName(e.target.value)}
                            placeholder="e.g., Friday Night Bridge"
                            required
                            maxLength={100}
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                        />
                    </div>

                    {/* Bidding System */}
                    <div className="mb-6">
                        <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-2">
                            Bidding System
                        </label>
                        <select
                            value={biddingSystem}
                            onChange={(e) => setBiddingSystem(e.target.value)}
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                        >
                            <option value="SAYC">Standard American Yellow Card (SAYC)</option>
                            <option value="StandardAmerican">Standard American</option>
                        </select>
                    </div>

                    {/* Number of Boards */}
                    <div className="mb-6">
                        <label className="block text-gray-700 dark:text-gray-300 font-semibold mb-2">
                            Number of Boards
                        </label>
                        <input
                            type="number"
                            value={numBoards}
                            onChange={(e) => setNumBoards(parseInt(e.target.value) || 1)}
                            min={1}
                            max={10}
                            className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                        />
                    </div>

                    {/* Timer Settings */}
                    <div className="mb-6">
                        <div className="flex items-center mb-3">
                            <input
                                type="checkbox"
                                id="timerEnabled"
                                checked={timerEnabled}
                                onChange={(e) => setTimerEnabled(e.target.checked)}
                                className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500"
                            />
                            <label htmlFor="timerEnabled" className="ml-3 text-gray-700 dark:text-gray-300 font-semibold">
                                Enable Turn Timer
                            </label>
                        </div>

                        {timerEnabled && (
                            <div>
                                <label className="block text-gray-600 dark:text-gray-400 text-sm mb-2">
                                    Timer Duration (seconds)
                                </label>
                                <input
                                    type="number"
                                    value={timerDuration}
                                    onChange={(e) => setTimerDuration(parseInt(e.target.value) || 30)}
                                    min={30}
                                    max={300}
                                    className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-emerald-500 dark:bg-gray-700 dark:text-white"
                                />
                            </div>
                        )}
                    </div>

                    {/* Action Buttons */}
                    <div className="flex gap-4">
                        <button
                            type="submit"
                            disabled={loading}
                            className="flex-1 px-6 py-3 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                        >
                            {loading ? "Creating..." : "Create Room"}
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
            </div>
        </div>
    );
}
