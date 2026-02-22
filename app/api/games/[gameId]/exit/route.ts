import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * POST /api/games/[gameId]/exit
 *
 * Called when a player clicks "Exit" in the game board.
 *
 * Effects:
 *   - Exiting player: their GamePlayer.isReady is set to false
 *   - Room status: reverted to WAITING (allows remaining players to restart)
 *   - All remaining players: receive a `game:player_exited` socket event
 *     containing the roomId so they can redirect to the room lobby
 *   - Exiting player: gets { redirect: '/dashboard' } in the response
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ gameId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { gameId } = await params;

        // Fetch game with players and room
        const game = await prisma.game.findUnique({
            where: { id: gameId },
            include: {
                gamePlayers: {
                    include: {
                        user: { select: { id: true, username: true } },
                    },
                },
                gameRoom: true,
            },
        });

        if (!game) {
            return NextResponse.json({ error: 'Game not found' }, { status: 404 });
        }

        // Verify the caller is actually in this game
        const exitingPlayer = game.gamePlayers.find(p => p.userId === session.user.id);
        if (!exitingPlayer) {
            return NextResponse.json({ error: 'You are not in this game' }, { status: 403 });
        }

        const roomId = game.gameRoom.id;

        // 1. DELETE the exiting player's GamePlayer record — this vacates their seat
        //    so other players see an empty slot when they return to the room lobby.
        await prisma.gamePlayer.delete({
            where: { id: exitingPlayer.id },
        });

        // 2. Mark all REMAINING players as NOT READY
        await prisma.gamePlayer.updateMany({
            where: { gameRoomId: roomId },
            data: { isReady: false },
        });

        // 3. Revert room status to WAITING so remaining players can ready-up again
        await prisma.gameRoom.update({
            where: { id: roomId },
            data: { status: 'WAITING' },
        });

        // 4. Notify all OTHER players via socket to redirect to the room lobby
        if (global.io) {
            global.io
                .to(`room-${roomId}`)
                .to(`game-${gameId}`)
                .emit('game:player_exited', {
                    exitedUserId: session.user.id,
                    exitedUsername: exitingPlayer.user.username,
                    roomId,
                });
            console.log(
                `[ExitRoute] ${exitingPlayer.user.username} exited game ${gameId} — notified room-${roomId} / game-${gameId}`
            );
        }

        return NextResponse.json({
            success: true,
            roomId,
            redirect: '/dashboard',
        });
    } catch (error) {
        console.error('[ExitRoute] Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
