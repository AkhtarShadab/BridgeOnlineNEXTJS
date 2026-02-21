"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface Invitation {
    id: string;
    room: {
        id: string;
        name: string;
        inviteCode: string;
        status: string;
    };
    inviter: {
        id: string;
        username: string;
        avatarUrl: string | null;
    };
    createdAt: string;
}

export default function InvitationsPage() {
    const router = useRouter();
    const { data: session, status } = useSession();
    const [invitations, setInvitations] = useState<Invitation[]>([]);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState<string | null>(null);

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        } else if (status === "authenticated") {
            loadInvitations();
        }
    }, [status, router]);

    const loadInvitations = async () => {
        try {
            const response = await fetch("/api/invitations");
            if (response.ok) {
                const data = await response.json();
                setInvitations(data.invitations || []);
            }
        } catch (error) {
            console.error("Failed to load invitations:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleRespond = async (invitationId: string, action: "accept" | "decline") => {
        setProcessing(invitationId);
        try {
            const response = await fetch(`/api/invitations/${invitationId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action }),
            });

            const data = await response.json();

            if (response.ok) {
                if (action === "accept" && data.roomId) {
                    router.push(`/room/${data.roomId}`);
                } else {
                    alert(data.message || "Success");
                    loadInvitations();
                }
            } else {
                alert(data.error || "Failed to respond to invitation");
                loadInvitations();
            }
        } catch (error) {
            alert("An error occurred");
        } finally {
            setProcessing(null);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950">
                <div className="text-center">
                    <div className="text-4xl mb-4">♠ ♥ ♦ ♣</div>
                    <p className="text-emerald-600 dark:text-emerald-400">Loading invitations...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-emerald-50 to-teal-100 dark:from-gray-900 dark:to-emerald-950">
            <div className="max-w-4xl mx-auto p-6">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-emerald-800 dark:text-emerald-400 mb-2">
                        Room Invitations
                    </h1>
                    <p className="text-gray-600 dark:text-gray-400">
                        Invitations from your friends to join game rooms
                    </p>
                </div>

                {/* Invitations List */}
                <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
                    {invitations.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">📬</div>
                            <h2 className="text-2xl font-semibold text-gray-800 dark:text-gray-200 mb-2">
                                No Pending Invitations
                            </h2>
                            <p className="text-gray-600 dark:text-gray-400 mb-6">
                                You don't have any room invitations at the moment
                            </p>
                            <button
                                onClick={() => router.push("/dashboard")}
                                className="px-6 py-3 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700"
                            >
                                Back to Dashboard
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {invitations.map((invitation) => (
                                <div
                                    key={invitation.id}
                                    className="p-6 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-emerald-500 transition-colors"
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-12 h-12 bg-purple-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                                                    {invitation.inviter.username[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
                                                        {invitation.inviter.username} invited you
                                                    </h3>
                                                    <p className="text-sm text-gray-500 dark:text-gray-400">
                                                        {new Date(invitation.createdAt).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="ml-15 space-y-1">
                                                <p className="text-gray-700 dark:text-gray-300">
                                                    <span className="font-semibold">Room:</span> {invitation.room.name}
                                                </p>
                                                <p className="text-gray-700 dark:text-gray-300">
                                                    <span className="font-semibold">Code:</span>{" "}
                                                    <span className="font-mono">{invitation.room.inviteCode}</span>
                                                </p>
                                                <p className="text-gray-700 dark:text-gray-300">
                                                    <span className="font-semibold">Status:</span> {invitation.room.status}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 ml-4">
                                            <button
                                                onClick={() => handleRespond(invitation.id, "accept")}
                                                disabled={processing !== null}
                                                className="px-6 py-2 bg-emerald-600 text-white font-semibold rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {processing === invitation.id ? "Joining..." : "Accept"}
                                            </button>
                                            <button
                                                onClick={() => handleRespond(invitation.id, "decline")}
                                                disabled={processing !== null}
                                                className="px-6 py-2 bg-gray-300 dark:bg-gray-700 text-gray-700 dark:text-gray-300 font-semibold rounded-lg hover:bg-gray-400 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                Decline
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Back Button */}
                {invitations.length > 0 && (
                    <div className="mt-6">
                        <button
                            onClick={() => router.push("/dashboard")}
                            className="px-6 py-3 bg-white dark:bg-gray-800 text-emerald-600 dark:text-emerald-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 font-semibold"
                        >
                            ← Back to Dashboard
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
