import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const inviteSchema = z.object({
    friendId: z.string(),
});

export async function POST(
    req: NextRequest,
    { params }: { params: Promise<{ roomId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { roomId } = await params;
        const body = await req.json();
        const { friendId } = inviteSchema.parse(body);

        // Verify room exists and user is in it
        const room = await prisma.gameRoom.findUnique({
            where: { id: roomId },
            include: {
                gamePlayers: true,
            },
        });

        if (!room) {
            return NextResponse.json({ error: 'Room not found' }, { status: 404 });
        }

        const userInRoom = room.gamePlayers.some((p: any) => p.userId === session.user.id);
        if (!userInRoom) {
            return NextResponse.json({ error: 'You are not in this room' }, { status: 403 });
        }

        if (room.status !== 'WAITING') {
            return NextResponse.json({ error: 'Room is not accepting players' }, { status: 400 });
        }

        if (room.gamePlayers.length >= 4) {
            return NextResponse.json({ error: 'Room is full' }, { status: 400 });
        }

        // Verify friendship exists
        const friendship = await prisma.friendship.findFirst({
            where: {
                OR: [
                    { requesterId: session.user.id, addresseeId: friendId, status: 'ACCEPTED' },
                    { requesterId: friendId, addresseeId: session.user.id, status: 'ACCEPTED' },
                ],
            },
        });

        if (!friendship) {
            return NextResponse.json({ error: 'User is not your friend' }, { status: 400 });
        }

        // Check if friend is already in the room
        const friendInRoom = room.gamePlayers.some((p: any) => p.userId === friendId);
        if (friendInRoom) {
            return NextResponse.json({ error: 'Friend is already in the room' }, { status: 400 });
        }

        // Check for existing pending invitation
        const existingInvitation = await prisma.roomInvitation.findFirst({
            where: {
                roomId,
                inviteeId: friendId,
                status: 'PENDING',
            },
        });

        if (existingInvitation) {
            return NextResponse.json({ error: 'Invitation already sent' }, { status: 400 });
        }

        // Create invitation
        const invitation = await prisma.roomInvitation.create({
            data: {
                roomId,
                inviterId: session.user.id,
                inviteeId: friendId,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            },
            include: {
                room: {
                    select: {
                        name: true,
                        inviteCode: true,
                    },
                },
                inviter: {
                    select: {
                        username: true,
                    },
                },
            },
        });

        return NextResponse.json({
            success: true,
            invitation: {
                id: invitation.id,
                roomName: invitation.room.name,
                inviterUsername: invitation.inviter.username,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }
        console.error('Create invitation error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
