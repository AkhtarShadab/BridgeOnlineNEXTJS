import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const seatSchema = z.object({
    seat: z.enum(['NORTH', 'SOUTH', 'EAST', 'WEST']),
});

/**
 * PATCH /api/rooms/[roomId]/seat
 * Change player's seat in the room.
 * The check-and-update runs inside a transaction to prevent race conditions
 * where two players try to claim the same seat simultaneously.
 */
export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ roomId: string }> }
) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { roomId } = await params;
        const body = await request.json();
        const { seat } = seatSchema.parse(body);

        const updated = await prisma.$transaction(async (tx) => {
            // Find the calling player's record
            const gamePlayer = await tx.gamePlayer.findFirst({
                where: { gameRoomId: roomId, userId: session.user.id },
            });

            if (!gamePlayer) {
                throw new Error('NOT_IN_ROOM');
            }

            // Check if the target seat is already taken by someone else
            const seatTaken = await tx.gamePlayer.findFirst({
                where: {
                    gameRoomId: roomId,
                    seat,
                    userId: { not: session.user.id },
                },
            });

            if (seatTaken) {
                throw new Error('SEAT_TAKEN');
            }

            // Atomically move to the new seat
            return tx.gamePlayer.update({
                where: { id: gamePlayer.id },
                data: { seat },
            });
        });

        return NextResponse.json({ success: true, seat: updated.seat });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid seat', details: error.errors },
                { status: 400 }
            );
        }

        if (error instanceof Error) {
            if (error.message === 'NOT_IN_ROOM') {
                return NextResponse.json({ error: 'You are not in this room' }, { status: 404 });
            }
            if (error.message === 'SEAT_TAKEN') {
                return NextResponse.json({ error: 'This seat is already taken' }, { status: 409 });
            }
            // Prisma unique constraint (P2002) — fallback if two requests raced through
            if ((error as any).code === 'P2002') {
                return NextResponse.json({ error: 'This seat was just taken by another player' }, { status: 409 });
            }
        }

        console.error('Error changing seat:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

