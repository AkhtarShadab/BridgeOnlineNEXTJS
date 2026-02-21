import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

const readySchema = z.object({
    isReady: z.boolean(),
});

/**
 * PATCH /api/rooms/[roomId]/ready
 * Toggle player's ready status
 * Body: { isReady: boolean }
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
        const { isReady } = readySchema.parse(body);

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

        // Update ready status
        const updated = await prisma.gamePlayer.update({
            where: { id: gamePlayer.id },
            data: { isReady },
        });

        // Check if all players are ready and update room status
        const allPlayers = await prisma.gamePlayer.findMany({
            where: { gameRoomId: roomId },
        });

        if (allPlayers.length === 4 && allPlayers.every(p => p.isReady)) {
            await prisma.gameRoom.update({
                where: { id: roomId },
                data: { status: 'READY' },
            });
        } else {
            // If not all ready, ensure room is in WAITING status
            await prisma.gameRoom.update({
                where: { id: roomId },
                data: { status: 'WAITING' },
            });
        }

        return NextResponse.json({
            success: true,
            isReady: updated.isReady,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }
        console.error('Error updating ready status:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
