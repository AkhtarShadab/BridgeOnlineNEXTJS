import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const respondSchema = z.object({
    action: z.enum(['accept', 'decline']),
});

export async function PATCH(
    req: NextRequest,
    { params }: { params: Promise<{ invitationId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { invitationId } = await params;
        const body = await req.json();
        const { action } = respondSchema.parse(body);

        // Find the invitation
        const invitation = await prisma.roomInvitation.findUnique({
            where: { id: invitationId },
            include: {
                room: {
                    include: {
                        gamePlayers: true,
                    },
                },
            },
        });

        if (!invitation) {
            return NextResponse.json({ error: 'Invitation not found' }, { status: 404 });
        }

        if (invitation.inviteeId !== session.user.id) {
            return NextResponse.json({ error: 'This invitation is not for you' }, { status: 403 });
        }

        if (invitation.status !== 'PENDING') {
            return NextResponse.json({ error: 'Invitation already responded to' }, { status: 400 });
        }

        if (invitation.expiresAt < new Date()) {
            await prisma.roomInvitation.update({
                where: { id: invitationId },
                data: { status: 'EXPIRED' },
            });
            return NextResponse.json({ error: 'Invitation has expired' }, { status: 400 });
        }

        if (action === 'accept') {
            // Check room availability
            if (invitation.room.status !== 'WAITING') {
                return NextResponse.json({ error: 'Room is not accepting players' }, { status: 400 });
            }

            if (invitation.room.gamePlayers.length >= 4) {
                return NextResponse.json({ error: 'Room is full' }, { status: 400 });
            }

            // Check if user is already in the room
            const alreadyInRoom = invitation.room.gamePlayers.some((p: any) => p.userId === session.user.id);
            if (alreadyInRoom) {
                await prisma.roomInvitation.update({
                    where: { id: invitationId },
                    data: { status: 'ACCEPTED' },
                });
                return NextResponse.json({
                    success: true,
                    roomId: invitation.roomId,
                    message: 'You are already in this room',
                });
            }

            // Find available seat
            const occupiedSeats = invitation.room.gamePlayers.map((p: any) => p.seat);
            const availableSeats = ['NORTH', 'SOUTH', 'EAST', 'WEST'].filter(
                seat => !occupiedSeats.includes(seat as any)
            );

            if (availableSeats.length === 0) {
                return NextResponse.json({ error: 'No seats available' }, { status: 400 });
            }

            // Add player to room and update invitation
            await prisma.$transaction([
                prisma.gamePlayer.create({
                    data: {
                        gameRoomId: invitation.roomId,
                        userId: session.user.id,
                        seat: availableSeats[0] as any,
                    },
                }),
                prisma.roomInvitation.update({
                    where: { id: invitationId },
                    data: { status: 'ACCEPTED' },
                }),
            ]);

            return NextResponse.json({
                success: true,
                roomId: invitation.roomId,
                message: 'Invitation accepted',
            });
        } else {
            // Decline
            await prisma.roomInvitation.update({
                where: { id: invitationId },
                data: { status: 'DECLINED' },
            });

            return NextResponse.json({
                success: true,
                message: 'Invitation declined',
            });
        }
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }
        console.error('Respond to invitation error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
