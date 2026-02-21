import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/active-room
 * Check if the current user has an active game room
 */
export async function GET() {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json({ activeRoom: null });
        }

        const activePlayer = await prisma.gamePlayer.findFirst({
            where: {
                userId: session.user.id,
                gameRoom: {
                    status: {
                        in: ['WAITING', 'READY', 'IN_PROGRESS']
                    }
                }
            },
            select: {
                gameRoomId: true
            }
        });

        return NextResponse.json({
            activeRoom: activePlayer ? activePlayer.gameRoomId : null
        });
    } catch (error) {
        console.error('Error checking active room:', error);
        return NextResponse.json({ activeRoom: null });
    }
}
