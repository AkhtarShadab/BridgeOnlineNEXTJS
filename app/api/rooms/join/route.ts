import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const joinRoomSchema = z.object({
    inviteCode: z.string().min(6).max(10),
});

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { inviteCode } = joinRoomSchema.parse(body);

        const room = await prisma.gameRoom.findUnique({
            where: { inviteCode },
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
            },
        });

        if (!room) {
            return NextResponse.json({ error: 'Room not found' }, { status: 404 });
        }

        if (room.status === 'COMPLETED' || room.status === 'ABANDONED') {
            return NextResponse.json({ error: 'Room is closed' }, { status: 400 });
        }

        if (room.expiresAt < new Date()) {
            return NextResponse.json({ error: 'Room has expired' }, { status: 400 });
        }

        if (room.gamePlayers.length >= 4) {
            return NextResponse.json({ error: 'Room is full' }, { status: 400 });
        }

        // Check if user is already in the room
        const alreadyIn = room.gamePlayers.some(
            (p) => p.userId === session.user.id
        );
        if (alreadyIn) {
            return NextResponse.json({
                success: true,
                room: {
                    id: room.id,
                    name: room.name,
                    inviteCode: room.inviteCode,
                    status: room.status,
                    players: room.gamePlayers.map((p) => ({
                        userId: p.user.id,
                        username: p.user.username,
                        seat: p.seat,
                        isReady: p.isReady,
                    })),
                    settings: room.settings,
                },
            });
        }

        // Add player to room (seat will be selected later)
        // For now, find the first available seat
        const occupiedSeats = room.gamePlayers.map((p) => p.seat);
        const availableSeats = ['NORTH', 'SOUTH', 'EAST', 'WEST'].filter(
            (seat) => !occupiedSeats.includes(seat as any)
        );

        if (availableSeats.length === 0) {
            return NextResponse.json({ error: 'No seats available' }, { status: 400 });
        }

        await prisma.gamePlayer.create({
            data: {
                gameRoomId: room.id,
                userId: session.user.id,
                seat: availableSeats[0] as any,
            },
        });

        // Fetch updated room
        const updatedRoom = await prisma.gameRoom.findUnique({
            where: { id: room.id },
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
            },
        });

        return NextResponse.json({
            success: true,
            room: {
                id: updatedRoom!.id,
                name: updatedRoom!.name,
                inviteCode: updatedRoom!.inviteCode,
                status: updatedRoom!.status,
                players: updatedRoom!.gamePlayers.map((p) => ({
                    userId: p.user.id,
                    username: p.user.username,
                    seat: p.seat,
                    isReady: p.isReady,
                })),
                settings: updatedRoom!.settings,
            },
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }
        console.error('Join room error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
