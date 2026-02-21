import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function DELETE(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { friendshipId } = body;

        if (!friendshipId) {
            return NextResponse.json(
                { error: "friendshipId is required" },
                { status: 400 }
            );
        }

        // Find the friendship
        const friendship = await prisma.friendship.findUnique({
            where: { id: friendshipId },
        });

        if (!friendship) {
            return NextResponse.json(
                { error: "Friendship not found" },
                { status: 404 }
            );
        }

        // User must be part of the friendship
        if (
            friendship.requesterId !== session.user.id &&
            friendship.addresseeId !== session.user.id
        ) {
            return NextResponse.json(
                { error: "You can only remove your own friendships" },
                { status: 403 }
            );
        }

        // Delete the friendship
        await prisma.friendship.delete({
            where: { id: friendshipId },
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Remove friend error:", error);
        return NextResponse.json(
            { error: "Failed to remove friend" },
            { status: 500 }
        );
    }
}
