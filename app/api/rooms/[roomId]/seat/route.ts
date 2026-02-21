import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const seatSchema = z.object({
    seat: z.enum(['NORTH', 'SOUTH', 'EAST', 'WEST']),
});

/**
 * PATCH /api/rooms/[roomId]/seat
 * Change player's seat in the room
 * Body: { seat: "NORTH" | "SOUTH" | "EAST" | "WEST" }
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

        // Find the player's record in this room
        const gamePlayer = await prisma.gamePlayer.findFirst({
            where: {
                gameRoomId: roomId,
                userId: session.user.id,
            },
        });

        if (!gamePlayer) {
            return NextResponse.json(
                { error: 'You are not in this room' },
                { status: 404 }
            );
        }

        // Check if the seat is already taken by another player
        const seatTaken = await prisma.gamePlayer.findFirst({
            where: {
                gameRoomId: roomId,
                seat,
                userId: {
                    not: session.user.id,
                },
            },
        });

        if (seatTaken) {
            return NextResponse.json(
                { error: 'This seat is already taken' },
                { status: 400 }
            );
        }

        // Update the player's seat
        const updated = await prisma.gamePlayer.update({
            where: { id: gamePlayer.id },
            data: { seat },
        });

        return NextResponse.json({
            success: true,
            seat: updated.seat,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid seat', details: error.errors },
                { status: 400 }
            );
        }
        console.error('Error changing seat:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
