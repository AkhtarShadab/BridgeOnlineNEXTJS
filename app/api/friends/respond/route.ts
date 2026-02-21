import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { friendshipId, action } = body;

        if (!friendshipId || !action) {
            return NextResponse.json(
                { error: "friendshipId and action are required" },
                { status: 400 }
            );
        }

        if (action !== "accept" && action !== "decline") {
            return NextResponse.json(
                { error: "action must be 'accept' or 'decline'" },
                { status: 400 }
            );
        }

        // Find the friendship
        const friendship = await prisma.friendship.findUnique({
            where: { id: friendshipId },
        });

        if (!friendship) {
            return NextResponse.json(
                { error: "Friend request not found" },
                { status: 404 }
            );
        }

        // Only the addressee can respond to the request
        if (friendship.addresseeId !== session.user.id) {
            return NextResponse.json(
                { error: "You can only respond to requests sent to you" },
                { status: 403 }
            );
        }

        // Can only respond to pending requests
        if (friendship.status !== "PENDING") {
            return NextResponse.json(
                { error: "This request has already been responded to" },
                { status: 400 }
            );
        }

        // Update the friendship status
        const updatedFriendship = await prisma.friendship.update({
            where: { id: friendshipId },
            data: {
                status: action === "accept" ? "ACCEPTED" : "REJECTED",
            },
            include: {
                requester: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        avatarUrl: true,
                    },
                },
                addressee: {
                    select: {
                        id: true,
                        username: true,
                        email: true,
                        avatarUrl: true,
                    },
                },
            },
        });

        return NextResponse.json({ friendship: updatedFriendship });
    } catch (error) {
        console.error("Respond to friend request error:", error);
        return NextResponse.json(
            { error: "Failed to respond to friend request" },
            { status: 500 }
        );
    }
}
