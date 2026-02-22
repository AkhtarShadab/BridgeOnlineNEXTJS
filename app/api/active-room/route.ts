import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/active-room
 * Returns the user's active room and active game (if in progress).
 * Used by useActiveRoomRedirect to resume the correct page after navigation.
 */
export async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ activeRoom: null, activeGame: null });
        }

        const activePlayer = await prisma.gamePlayer.findFirst({
            where: {
                userId: session.user.id,
                gameRoom: {
                    status: { in: ['WAITING', 'READY', 'IN_PROGRESS'] },
                },
            },
            select: {
                gameRoomId: true,
                gameId: true,          // linked game (set when game starts)
                gameRoom: {
                    select: { status: true },
                },
            },
        });

        if (!activePlayer) {
            return NextResponse.json({ activeRoom: null, activeGame: null });
        }

        // If the room is IN_PROGRESS and the player has a linked game, return that too
        const activeGame =
            activePlayer.gameRoom.status === 'IN_PROGRESS' && activePlayer.gameId
                ? activePlayer.gameId
                : null;

        return NextResponse.json({
            activeRoom: activePlayer.gameRoomId,
            activeGame,
        });
    } catch (error) {
        console.error('Error checking active room:', error);
        return NextResponse.json({ activeRoom: null, activeGame: null });
    }
}
