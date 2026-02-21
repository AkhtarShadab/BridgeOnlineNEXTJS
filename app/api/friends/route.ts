import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/friends
 * Get user's friends list and pending friend requests
 */
export async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const userId = session.user.id;

        // Get accepted friends
        const friendships = await prisma.friendship.findMany({
            where: {
                OR: [
                    { requesterId: userId, status: 'ACCEPTED' },
                    { addresseeId: userId, status: 'ACCEPTED' },
                ],
            },
            include: {
                requester: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                        lastLogin: true,
                    },
                },
                addressee: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                        lastLogin: true,
                    },
                },
            },
        });

        // Map to friend objects (the other person in the friendship)
        const friends = friendships.map(f =>
            f.requesterId === userId ? f.addressee : f.requester
        );

        // Get pending requests received (requests TO this user)
        const pendingReceived = await prisma.friendship.findMany({
            where: {
                addresseeId: userId,
                status: 'PENDING',
            },
            include: {
                requester: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                    },
                },
            },
        });

        // Get pending requests sent (requests FROM this user)
        const pendingSent = await prisma.friendship.findMany({
            where: {
                requesterId: userId,
                status: 'PENDING',
            },
            include: {
                addressee: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                    },
                },
            },
        });

        return NextResponse.json({
            friends,
            pendingReceived: pendingReceived.map(f => ({
                friendshipId: f.id,
                user: f.requester,
                createdAt: f.createdAt,
            })),
            pendingSent: pendingSent.map(f => ({
                friendshipId: f.id,
                user: f.addressee,
                createdAt: f.createdAt,
            })),
        });
    } catch (error) {
        console.error('Error fetching friends:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * POST /api/friends
 * Send a friend request
 * Body: { addresseeId: string }
 */
export async function POST(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const body = await request.json();
        const { addresseeId } = body;

        if (!addresseeId) {
            return NextResponse.json(
                { error: 'addresseeId is required' },
                { status: 400 }
            );
        }

        // Cannot send friend request to yourself
        if (addresseeId === session.user.id) {
            return NextResponse.json(
                { error: 'Cannot send friend request to yourself' },
                { status: 400 }
            );
        }

        // Check if target user exists
        const targetUser = await prisma.user.findUnique({
            where: { id: addresseeId },
        });

        if (!targetUser) {
            return NextResponse.json(
                { error: 'User not found' },
                { status: 404 }
            );
        }

        // Check if friendship already exists (in either direction)
        const existingFriendship = await prisma.friendship.findFirst({
            where: {
                OR: [
                    { requesterId: session.user.id, addresseeId },
                    { requesterId: addresseeId, addresseeId: session.user.id },
                ],
            },
        });

        if (existingFriendship) {
            if (existingFriendship.status === 'ACCEPTED') {
                return NextResponse.json(
                    { error: 'You are already friends with this user' },
                    { status: 400 }
                );
            } else if (existingFriendship.status === 'PENDING') {
                return NextResponse.json(
                    { error: 'Friend request already pending' },
                    { status: 400 }
                );
            } else if (existingFriendship.status === 'BLOCKED') {
                return NextResponse.json(
                    { error: 'Cannot send friend request to this user' },
                    { status: 400 }
                );
            }
        }

        // Create friend request
        const friendship = await prisma.friendship.create({
            data: {
                requesterId: session.user.id,
                addresseeId,
                status: 'PENDING',
            },
        });

        return NextResponse.json({
            success: true,
            friendshipId: friendship.id,
        });
    } catch (error) {
        console.error('Error sending friend request:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
