import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/rooms/[roomId]
 * Get room details and all players
 */
export async function GET(
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

        const room = await prisma.gameRoom.findUnique({
            where: { id: roomId },
            include: {
                gamePlayers: {
                    include: {
                        user: {
                            select: {
                                id: true,
                                username: true,
                                avatarUrl: true,
                            },
                        },
                    },
                },
                creator: {
                    select: {
                        id: true,
                        username: true,
                    },
                },
                // Fetch latest game so non-creator players can be redirected via polling
                games: {
                    orderBy: { startedAt: 'desc' },
                    take: 1,
                    select: { id: true },
                },
            },
        });

        if (!room) {
            return NextResponse.json(
                { error: 'Room not found' },
                { status: 404 }
            );
        }

        return NextResponse.json({
            id: room.id,
            name: room.name,
            inviteCode: room.inviteCode,
            status: room.status,
            settings: room.settings,
            creatorId: room.creatorId,
            creator: room.creator,
            createdAt: room.createdAt,
            expiresAt: room.expiresAt,
            // Enables polling fallback redirect for non-creator players
            activeGameId: room.games[0]?.id ?? null,
            players: room.gamePlayers.map((p) => ({
                id: p.id,
                userId: p.user.id,
                username: p.user.username,
                avatarUrl: p.user.avatarUrl,
                seat: p.seat,
                isReady: p.isReady,
                joinedAt: p.joinedAt,
            })),
        });
    } catch (error) {
        console.error('Error fetching room:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * DELETE /api/rooms/[roomId]
 * Leave the room (remove player from room)
 */
export async function DELETE(
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

        // Find the player in this room
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

        // Delete the game player record
        await prisma.gamePlayer.delete({
            where: { id: gamePlayer.id },
        });

        // Check if room is now empty, if so, mark as abandoned
        const remainingPlayers = await prisma.gamePlayer.count({
            where: { gameRoomId: roomId },
        });

        if (remainingPlayers === 0) {
            await prisma.gameRoom.update({
                where: { id: roomId },
                data: { status: 'ABANDONED' },
            });
        }

        return NextResponse.json({
            success: true,
            message: 'Left room successfully',
        });
    } catch (error) {
        console.error('Error leaving room:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
