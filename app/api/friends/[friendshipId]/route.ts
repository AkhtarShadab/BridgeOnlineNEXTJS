import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * PATCH /api/friends/[friendshipId]
 * Accept or reject a friend request
 * Body: { action: "accept" | "reject" }
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: { friendshipId: string } }
) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { friendshipId } = params;
        const body = await request.json();
        const { action } = body;

        if (!action || !['accept', 'reject'].includes(action)) {
            return NextResponse.json(
                { error: 'Invalid action. Must be "accept" or "reject"' },
                { status: 400 }
            );
        }

        // Find the friendship
        const friendship = await prisma.friendship.findUnique({
            where: { id: friendshipId },
        });

        if (!friendship) {
            return NextResponse.json(
                { error: 'Friend request not found' },
                { status: 404 }
            );
        }

        // Only the addressee (person who received the request) can accept/reject
        if (friendship.addresseeId !== session.user.id) {
            return NextResponse.json(
                { error: 'You can only accept/reject requests sent to you' },
                { status: 403 }
            );
        }

        // Only pending requests can be accepted/rejected
        if (friendship.status !== 'PENDING') {
            return NextResponse.json(
                { error: 'This request has already been processed' },
                { status: 400 }
            );
        }

        // Update the friendship status
        const newStatus = action === 'accept' ? 'ACCEPTED' : 'REJECTED';
        const updatedFriendship = await prisma.friendship.update({
            where: { id: friendshipId },
            data: { status: newStatus },
        });

        return NextResponse.json({
            success: true,
            friendship: updatedFriendship,
        });
    } catch (error) {
        console.error('Error updating friend request:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/friends/[friendshipId]
 * Remove a friend or cancel a friend request
 */
export async function DELETE(
    request: NextRequest,
    { params }: { params: { friendshipId: string } }
) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { friendshipId } = params;

        // Find the friendship
        const friendship = await prisma.friendship.findUnique({
            where: { id: friendshipId },
        });

        if (!friendship) {
            return NextResponse.json(
                { error: 'Friendship not found' },
                { status: 404 }
            );
        }

        // User must be part of the friendship
        const userId = session.user.id;
        if (friendship.requesterId !== userId && friendship.addresseeId !== userId) {
            return NextResponse.json(
                { error: 'You are not part of this friendship' },
                { status: 403 }
            );
        }

        // Delete the friendship
        await prisma.friendship.delete({
            where: { id: friendshipId },
        });

        return NextResponse.json({
            success: true,
            message: 'Friendship removed successfully',
        });
    } catch (error) {
        console.error('Error deleting friendship:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
