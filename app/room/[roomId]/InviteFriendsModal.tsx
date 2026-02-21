"use client";

import { useState, useEffect } from "react";

interface Friend {
    friendshipId: string;
    friend: {
        id: string;
        username: string;
        email: string;
        avatarUrl: string | null;
    };
}

interface InviteFriendsModalProps {
    roomId: string;
    isOpen: boolean;
    onClose: () => void;
}

export default function InviteFriendsModal({ roomId, isOpen, onClose }: InviteFriendsModalProps) {
    const [friends, setFriends] = useState<Friend[]>([]);
    const [loading, setLoading] = useState(true);
    const [inviting, setInviting] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            loadFriends();
        }
    }, [isOpen]);

    const loadFriends = async () => {
        try {
            const response = await fetch("/api/friends/list");
            if (response.ok) {
                const data = await response.json();
                setFriends(data.friends || []);
            }
        } catch (error) {
            console.error("Failed to load friends:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleInvite = async (friendId: string) => {
        setInviting(friendId);
        try {
            const response = await fetch(`/api/rooms/${roomId}/invite`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ friendId }),
            });

            const data = await response.json();

            if (response.ok) {
                alert("Invitation sent successfully!");
            } else {
                alert(data.error || "Failed to send invitation");
            }
        } catch (error) {
            alert("An error occurred");
        } finally {
            setInviting(null);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 max-h-[80vh] overflow-hidden flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-gray-200 dark:border-gray-700">
                    <div className="flex justify-between items-center">
                        <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-200">
                            Invite Friends
                        </h2>
                        <button
                            onClick={onClose}
                            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div className="p-6 overflow-y-auto flex-1">
                    {loading ? (
                        <div className="text-center py-8">
                            <p className="text-gray-600 dark:text-gray-400">Loading friends...</p>
                        </div>
                    ) : friends.length === 0 ? (
                        <div className="text-center py-8">
                            <div className="text-4xl mb-3">👥</div>
                            <p className="text-gray-600 dark:text-gray-400">
                                You don't have any friends yet
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {friends.map((item) => (
                                <div
                                    key={item.friendshipId}
                                    className="p-4 border border-gray-200 dark:border-gray-700 rounded-lg flex justify-between items-center"
                                >
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center text-white font-bold">
                                            {item.friend.username[0].toUpperCase()}
                                        </div>
                                        <div>
                                            <h3 className="font-semibold text-gray-800 dark:text-gray-200">
                                                {item.friend.username}
                                            </h3>
                                            <p className="text-sm text-gray-500 dark:text-gray-400">
                                                {item.friend.email}
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleInvite(item.friend.id)}
                                        disabled={inviting !== null}
                                        className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {inviting === item.friend.id ? "Sending..." : "Invite  "}
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
