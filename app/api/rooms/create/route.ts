import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';
import { generateInviteCode } from '@/lib/utils/invite-code';
import { z } from 'zod';
import { Prisma } from '@prisma/client';

const createRoomSchema = z.object({
    name: z.string().min(1).max(100),
    settings: z.object({
        biddingSystem: z.enum(['SAYC', 'StandardAmerican']).default('SAYC'),
        numBoards: z.number().int().min(1).max(10).default(1),
        timerEnabled: z.boolean().default(true),
        timerDuration: z.number().int().min(30).max(300).default(90),
    }).optional(),
});

export async function POST(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { name, settings } = createRoomSchema.parse(body);

        const inviteCode = generateInviteCode();
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        // Create room and add creator as first player in a transaction
        const room = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
            const newRoom = await tx.gameRoom.create({
                data: {
                    name,
                    inviteCode,
                    creatorId: session.user.id,
                    expiresAt,
                    settings: settings || {},
                },
            });

            // Automatically add creator as first player (SOUTH seat)
            await tx.gamePlayer.create({
                data: {
                    gameRoomId: newRoom.id,
                    userId: session.user.id,
                    seat: 'SOUTH',
                    isReady: false,
                },
            });

            return newRoom;
        });

        return NextResponse.json({
            roomId: room.id,
            inviteCode: room.inviteCode,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid input', details: error.errors },
                { status: 400 }
            );
        }
        console.error('Create room error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
