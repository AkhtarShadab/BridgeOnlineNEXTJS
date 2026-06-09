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
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center">
                    <div className="text-4xl mb-4 text-accent">♠ ♥ ♦ ♣</div>
                    <p className="text-accent">Loading invitations...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-4xl mx-auto p-6">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-accent mb-2">
                        Room Invitations
                    </h1>
                    <p className="text-text-muted">
                        Invitations from your friends to join game rooms
                    </p>
                </div>

                {/* Invitations List */}
                <div className="bg-surface border border-border rounded-2xl shadow-xl p-6">
                    {invitations.length === 0 ? (
                        <div className="text-center py-12">
                            <div className="text-6xl mb-4">📬</div>
                            <h2 className="text-2xl font-semibold text-foreground mb-2">
                                No Pending Invitations
                            </h2>
                            <p className="text-text-muted mb-6">
                                You don't have any room invitations at the moment
                            </p>
                            <button
                                onClick={() => router.push("/dashboard")}
                                className="px-6 py-3 bg-accent text-background rounded-lg hover:bg-accent-muted font-semibold transition-colors"
                            >
                                Back to Dashboard
                            </button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            {invitations.map((invitation) => (
                                <div
                                    key={invitation.id}
                                    className="p-6 border border-border rounded-lg hover:border-accent transition-colors bg-surface-elevated"
                                >
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-3 mb-3">
                                                <div className="w-12 h-12 bg-team-ew rounded-full flex items-center justify-center text-background font-bold text-lg">
                                                    {invitation.inviter.username[0].toUpperCase()}
                                                </div>
                                                <div>
                                                    <h3 className="text-lg font-semibold text-foreground">
                                                        {invitation.inviter.username} invited you
                                                    </h3>
                                                    <p className="text-sm text-text-muted">
                                                        {new Date(invitation.createdAt).toLocaleString()}
                                                    </p>
                                                </div>
                                            </div>
                                            <div className="ml-15 space-y-1">
                                                <p className="text-foreground">
                                                    <span className="font-semibold text-accent">Room:</span> {invitation.room.name}
                                                </p>
                                                <p className="text-foreground">
                                                    <span className="font-semibold text-accent">Code:</span>{" "}
                                                    <span className="font-mono">{invitation.room.inviteCode}</span>
                                                </p>
                                                <p className="text-foreground">
                                                    <span className="font-semibold text-accent">Status:</span> {invitation.room.status}
                                                </p>
                                            </div>
                                        </div>
                                        <div className="flex gap-2 ml-4">
                                            <button
                                                onClick={() => handleRespond(invitation.id, "accept")}
                                                disabled={processing !== null}
                                                className="px-6 py-2 bg-accent text-background font-semibold rounded-lg hover:bg-accent-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                            >
                                                {processing === invitation.id ? "Joining..." : "Accept"}
                                            </button>
                                            <button
                                                onClick={() => handleRespond(invitation.id, "decline")}
                                                disabled={processing !== null}
                                                className="px-6 py-2 bg-surface-elevated border border-border text-foreground font-semibold rounded-lg hover:bg-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                            className="px-6 py-3 bg-surface border border-border text-accent rounded-lg hover:bg-surface-elevated font-semibold transition-colors"
                        >
                            ← Back to Dashboard
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
