import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { auth } from '@/lib/auth';

export async function GET(req: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const invitations = await prisma.roomInvitation.findMany({
            where: {
                inviteeId: session.user.id,
                status: 'PENDING',
                expiresAt: {
                    gt: new Date(),
                },
            },
            include: {
                room: {
                    select: {
                        id: true,
                        name: true,
                        inviteCode: true,
                        status: true,
                    },
                },
                inviter: {
                    select: {
                        id: true,
                        username: true,
                        avatarUrl: true,
                    },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        });

        return NextResponse.json({ invitations });
    } catch (error) {
        console.error('Get invitations error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
