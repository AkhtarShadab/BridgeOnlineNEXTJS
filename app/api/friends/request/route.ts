import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const body = await request.json();
        const { addresseeId } = body;

        if (!addresseeId) {
            return NextResponse.json(
                { error: "addresseeId is required" },
                { status: 400 }
            );
        }

        // Cannot send request to yourself
        if (addresseeId === session.user.id) {
            return NextResponse.json(
                { error: "Cannot send friend request to yourself" },
                { status: 400 }
            );
        }

        // Check if addressee exists
        const addressee = await prisma.user.findUnique({
            where: { id: addresseeId },
        });

        if (!addressee) {
            return NextResponse.json({ error: "User not found" }, { status: 404 });
        }

        // Check if friendship already exists (in either direction)
        const existingFriendship = await prisma.friendship.findFirst({
            where: {
                OR: [
                    {
                        requesterId: session.user.id,
                        addresseeId: addresseeId,
                    },
                    {
                        requesterId: addresseeId,
                        addresseeId: session.user.id,
                    },
                ],
            },
        });

        if (existingFriendship) {
            if (existingFriendship.status === "ACCEPTED") {
                return NextResponse.json(
                    { error: "Already friends" },
                    { status: 400 }
                );
            } else if (existingFriendship.status === "PENDING") {
                return NextResponse.json(
                    { error: "Friend request already pending" },
                    { status: 400 }
                );
            } else if (existingFriendship.status === "BLOCKED") {
                return NextResponse.json(
                    { error: "Cannot send friend request" },
                    { status: 403 }
                );
            }
        }

        // Create friend request
        const friendship = await prisma.friendship.create({
            data: {
                requesterId: session.user.id,
                addresseeId: addresseeId,
                status: "PENDING",
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

        return NextResponse.json({ friendship }, { status: 201 });
    } catch (error) {
        console.error("Send friend request error:", error);
        return NextResponse.json(
            { error: "Failed to send friend request" },
            { status: 500 }
        );
    }
}
