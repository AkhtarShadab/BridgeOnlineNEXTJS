"use client";

import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

interface User {
    id: string;
    username: string;
    email: string;
    avatarUrl: string | null;
    stats: any;
}

interface Friend {
    friendshipId: string;
    friend: User;
    since: string;
}

interface FriendRequest {
    id: string;
    requester: User;
    addressee: User;
    createdAt: string;
}

export default function FriendsPage() {
    const { data: session, status } = useSession();
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState<User[]>([]);
    const [friends, setFriends] = useState<Friend[]>([]);
    const [pendingReceived, setPendingReceived] = useState<FriendRequest[]>([]);
    const [pendingSent, setPendingSent] = useState<FriendRequest[]>([]);
    const [loading, setLoading] = useState(true);
    const [searching, setSearching] = useState(false);
    const [activeTab, setActiveTab] = useState<"friends" | "requests" | "search">("friends");

    useEffect(() => {
        if (status === "unauthenticated") {
            router.push("/login");
        } else if (status === "authenticated") {
            loadFriendsData();
        }
    }, [status, router]);

    const loadFriendsData = async () => {
        try {
            const response = await fetch("/api/friends/list");
            if (response.ok) {
                const data = await response.json();
                setFriends(data.friends || []);
                setPendingReceived(data.pendingReceived || []);
                setPendingSent(data.pendingSent || []);
            }
        } catch (error) {
            console.error("Failed to load friends:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleSearch = async (query: string) => {
        setSearchQuery(query);
        if (query.trim().length < 2) {
            setSearchResults([]);
            return;
        }

        setSearching(true);
        try {
            const response = await fetch(`/api/friends/search?q=${encodeURIComponent(query)}`);
            if (response.ok) {
                const data = await response.json();
                setSearchResults(data.users || []);
            }
        } catch (error) {
            console.error("Search failed:", error);
        } finally {
            setSearching(false);
        }
    };

    const sendFriendRequest = async (userId: string) => {
        try {
            const response = await fetch("/api/friends/request", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ addresseeId: userId }),
            });

            if (response.ok) {
                alert("Friend request sent!");
                loadFriendsData();
                setSearchResults(searchResults.filter((u) => u.id !== userId));
            } else {
                const data = await response.json();
                alert(data.error || "Failed to send request");
            }
        } catch (error) {
            console.error("Failed to send request:", error);
            alert("Failed to send friend request");
        }
    };

    const respondToRequest = async (friendshipId: string, action: "accept" | "decline") => {
        try {
            const response = await fetch("/api/friends/respond", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ friendshipId, action }),
            });

            if (response.ok) {
                alert(action === "accept" ? "Friend request accepted!" : "Friend request declined");
                loadFriendsData();
            } else {
                const data = await response.json();
                alert(data.error || "Failed to respond");
            }
        } catch (error) {
            console.error("Failed to respond:", error);
            alert("Failed to respond to request");
        }
    };

    const removeFriend = async (friendshipId: string) => {
        if (!confirm("Are you sure you want to remove this friend?")) return;

        try {
            const response = await fetch("/api/friends/remove", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ friendshipId }),
            });

            if (response.ok) {
                alert("Friend removed");
                loadFriendsData();
            } else {
                const data = await response.json();
                alert(data.error || "Failed to remove friend");
            }
        } catch (error) {
            console.error("Failed to remove friend:", error);
            alert("Failed to remove friend");
        }
    };

    const cancelRequest = async (friendshipId: string) => {
        try {
            const response = await fetch("/api/friends/remove", {
                method: "DELETE",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ friendshipId }),
            });

            if (response.ok) {
                alert("Request canceled");
                loadFriendsData();
            }
        } catch (error) {
            console.error("Failed to cancel request:", error);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-background">
                <div className="text-center">
                    <div className="text-4xl mb-4 text-accent">♠ ♥ ♦ ♣</div>
                    <p className="text-text-muted">Loading friends...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-background">
            <div className="max-w-6xl mx-auto p-6">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-accent mb-2">
                        Friends
                    </h1>
                    <p className="text-text-muted">
                        Manage your friends and find new players
                    </p>
                </div>

                {/* Tabs */}
                <div className="flex gap-4 mb-6">
                    <button
                        onClick={() => setActiveTab("friends")}
                        className={`px-6 py-3 rounded-lg font-semibold transition-colors ${activeTab === "friends"
                                ? "bg-accent text-white"
                                : "bg-surface text-text-muted hover:bg-surface-elevated"
                            }`}
                    >
                        Friends ({friends.length})
                    </button>
                    <button
                        onClick={() => setActiveTab("requests")}
                        className={`px-6 py-3 rounded-lg font-semibold transition-colors relative ${activeTab === "requests"
                                ? "bg-accent text-white"
                                : "bg-surface text-text-muted hover:bg-surface-elevated"
                            }`}
                    >
                        Requests
                        {pendingReceived.length > 0 && (
                            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-xs rounded-full w-6 h-6 flex items-center justify-center">
                                {pendingReceived.length}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab("search")}
                        className={`px-6 py-3 rounded-lg font-semibold transition-colors ${activeTab === "search"
                                ? "bg-accent text-white"
                                : "bg-surface text-text-muted hover:bg-surface-elevated"
                            }`}
                    >
                        Find Players
                    </button>
                </div>

                {/* Content */}
                <div className="bg-surface border border-border rounded-2xl p-6">
                    {/* Friends Tab */}
                    {activeTab === "friends" && (
                        <div>
                            {friends.length === 0 ? (
                                <div className="text-center py-12">
                                    <div className="text-6xl mb-4">👥</div>
                                    <p className="text-text-muted mb-4">
                                        You don't have any friends yet
                                    </p>
                                    <button
                                        onClick={() => setActiveTab("search")}
                                        className="px-6 py-2 bg-accent text-white rounded-lg hover:bg-[var(--primary-hover)]"
                                    >
                                        Find Players
                                    </button>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {friends.map((item) => (
                                        <div
                                            key={item.friendshipId}
                                            className="p-4 border border-border rounded-lg hover:border-accent transition-colors"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center text-white font-bold text-xl">
                                                        {item.friend.username[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <h3 className="font-semibold text-foreground">
                                                            {item.friend.username}
                                                        </h3>
                                                        <p className="text-sm text-text-muted">
                                                            Friends since {new Date(item.since).toLocaleDateString()}
                                                        </p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => removeFriend(item.friendshipId)}
                                                    className="text-red-600 hover:text-red-700 text-sm"
                                                >
                                                    Remove
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}

                    {/* Requests Tab */}
                    {activeTab === "requests" && (
                        <div className="space-y-6">
                            {/* Received Requests */}
                            <div>
                                <h3 className="text-xl font-semibold mb-4 text-foreground">
                                    Received ({pendingReceived.length})
                                </h3>
                                {pendingReceived.length === 0 ? (
                                    <p className="text-text-muted">No pending requests</p>
                                ) : (
                                    <div className="space-y-3">
                                        {pendingReceived.map((request) => (
                                            <div
                                                key={request.id}
                                                className="p-4 border border-border rounded-lg flex justify-between items-center"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 bg-surface-elevated rounded-full flex items-center justify-center text-foreground font-bold text-xl">
                                                        {request.requester.username[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-semibold text-foreground">
                                                            {request.requester.username}
                                                        </h4>
                                                        <p className="text-sm text-text-muted">
                                                            {request.requester.email}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-2">
                                                    <button
                                                        onClick={() => respondToRequest(request.id, "accept")}
                                                        className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-[var(--primary-hover)]"
                                                    >
                                                        Accept
                                                    </button>
                                                    <button
                                                        onClick={() => respondToRequest(request.id, "decline")}
                                                        className="px-4 py-2 bg-surface-elevated text-text-muted rounded-lg hover:bg-border"
                                                    >
                                                        Decline
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Sent Requests */}
                            <div>
                                <h3 className="text-xl font-semibold mb-4 text-foreground">
                                    Sent ({pendingSent.length})
                                </h3>
                                {pendingSent.length === 0 ? (
                                    <p className="text-text-muted">No pending requests</p>
                                ) : (
                                    <div className="space-y-3">
                                        {pendingSent.map((request) => (
                                            <div
                                                key={request.id}
                                                className="p-4 border border-border rounded-lg flex justify-between items-center"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 bg-surface-elevated rounded-full flex items-center justify-center text-foreground font-bold text-xl">
                                                        {request.addressee.username[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-semibold text-foreground">
                                                            {request.addressee.username}
                                                        </h4>
                                                        <p className="text-sm text-text-muted">Pending...</p>
                                                    </div>
                                                </div>
                                                <button
                                                    onClick={() => cancelRequest(request.id)}
                                                    className="px-4 py-2 text-red-600 hover:text-red-700"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Search Tab */}
                    {activeTab === "search" && (
                        <div>
                            <div className="mb-6">
                                <input
                                    type="text"
                                    placeholder="Search by username or email..."
                                    value={searchQuery}
                                    onChange={(e) => handleSearch(e.target.value)}
                                    className="w-full px-4 py-3 border border-border bg-surface text-foreground rounded-lg focus:ring-2 focus:ring-accent"
                                />
                            </div>

                            {searching ? (
                                <div className="text-center py-12">
                                    <p className="text-text-muted">Searching...</p>
                                </div>
                            ) : searchQuery.length < 2 ? (
                                <div className="text-center py-12">
                                    <div className="text-6xl mb-4">🔍</div>
                                    <p className="text-text-muted">
                                        Search for players by username or email
                                    </p>
                                </div>
                            ) : searchResults.length === 0 ? (
                                <div className="text-center py-12">
                                    <p className="text-text-muted">No users found</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {searchResults.map((user) => {
                                        const isFriend = friends.some((f) => f.friend.id === user.id);
                                        const sentRequest = pendingSent.some((r) => r.addressee.id === user.id);
                                        const receivedRequest = pendingReceived.some((r) => r.requester.id === user.id);

                                        return (
                                            <div
                                                key={user.id}
                                                className="p-4 border border-border rounded-lg flex justify-between items-center"
                                            >
                                                <div className="flex items-center gap-3">
                                                    <div className="w-12 h-12 bg-accent rounded-full flex items-center justify-center text-white font-bold text-xl">
                                                        {user.username[0].toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <h4 className="font-semibold text-foreground">
                                                            {user.username}
                                                        </h4>
                                                        <p className="text-sm text-text-muted">{user.email}</p>
                                                    </div>
                                                </div>
                                                <div>
                                                    {isFriend ? (
                                                        <span className="text-accent">
                                                            ✓ Friends
                                                        </span>
                                                    ) : sentRequest ? (
                                                        <span className="text-text-muted">Request Sent</span>
                                                    ) : receivedRequest ? (
                                                        <button
                                                            onClick={() => setActiveTab("requests")}
                                                            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-[var(--primary-hover)]"
                                                        >
                                                            View Request
                                                        </button>
                                                    ) : (
                                                        <button
                                                            onClick={() => sendFriendRequest(user.id)}
                                                            className="px-4 py-2 bg-accent text-white rounded-lg hover:bg-[var(--primary-hover)]"
                                                        >
                                                            Add Friend
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Back to Dashboard */}
                <div className="mt-6">
                    <a
                        href="/dashboard"
                        className="inline-block px-6 py-3 bg-surface text-accent rounded-lg border border-border hover:bg-surface-elevated font-semibold"
                    >
                        ← Back to Dashboard
                    </a>
                </div>
            </div>
        </div>
    );
}
