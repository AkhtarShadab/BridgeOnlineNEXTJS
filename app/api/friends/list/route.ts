import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        // Get accepted friendships (both directions)
        const acceptedFriendships = await prisma.friendship.findMany({
            where: {
                AND: [
                    {
                        OR: [
                            { requesterId: session.user.id },
                            { addresseeId: session.user.id },
                        ],
                    },
                    { status: "ACCEPTED" },
                ],
            },
            include: {
                requester: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        avatarUrl: true,
                        stats: true,
                    },
                },
                addressee: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        avatarUrl: true,
                        stats: true,
                    },
                },
            },
        });

        // Get pending requests received by current user
        const pendingReceived = await prisma.friendship.findMany({
            where: {
                addresseeId: session.user.id,
                status: "PENDING",
            },
            include: {
                requester: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        avatarUrl: true,
                        stats: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        // Get pending requests sent by current user
        const pendingSent = await prisma.friendship.findMany({
            where: {
                requesterId: session.user.id,
                status: "PENDING",
            },
            include: {
                addressee: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        avatarUrl: true,
                        stats: true,
                    },
                },
            },
            orderBy: {
                createdAt: "desc",
            },
        });

        // Transform accepted friendships to get the friend user
        const friends = acceptedFriendships.map((friendship) => {
            const friend =
                friendship.requesterId === session.user.id
                    ? friendship.addressee
                    : friendship.requester;
            return {
                friendshipId: friendship.id,
                friend,
                since: friendship.createdAt,
            };
        });

        return NextResponse.json({
            friends,
            pendingReceived,
            pendingSent,
        });
    } catch (error) {
        console.error("Get friends list error:", error);
        return NextResponse.json(
            { error: "Failed to get friends list" },
            { status: 500 }
        );
    }
}
