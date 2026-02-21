import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { initializeGame } from '@/lib/game/gameEngine';

/**
 * POST /api/rooms/[roomId]/start
 * Start the game (create Game record and deal cards)
 * Only the room creator can start the game
 */
export async function POST(
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

        // Fetch room with players
        const room = await prisma.gameRoom.findUnique({
            where: { id: roomId },
            include: {
                gamePlayers: {
                    include: {
                        user: true,
                    },
                },
            },
        });

        if (!room) {
            return NextResponse.json(
                { error: 'Room not found' },
                { status: 404 }
            );
        }

        // Only creator can start the game
        if (room.creatorId !== session.user.id) {
            return NextResponse.json(
                { error: 'Only the room creator can start the game' },
                { status: 403 }
            );
        }

        // Must have exactly 4 players
        if (room.gamePlayers.length !== 4) {
            return NextResponse.json(
                { error: 'Need exactly 4 players to start' },
                { status: 400 }
            );
        }

        // All players must be ready
        if (!room.gamePlayers.every((p: any) => p.isReady)) {
            return NextResponse.json(
                { error: 'All players must be ready to start' },
                { status: 400 }
            );
        }

        // Room must be in READY status
        if (room.status !== 'READY') {
            return NextResponse.json(
                { error: 'Room is not ready to start' },
                { status: 400 }
            );
        }

        // Initialize game using game engine
        const game = await initializeGame(roomId);

        // Emit WebSocket event to notify all players in the room
        if (global.io) {
            global.io.to(`room-${roomId}`).emit('game:started', {
                gameId: game.id,
                roomId: roomId,
            });
            console.log(`Emitted game:started to room-${roomId}`);
        }

        return NextResponse.json({
            success: true,
            gameId: game.id,
            message: 'Game started successfully',
        });
    } catch (error) {
        console.error('Error starting game:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
