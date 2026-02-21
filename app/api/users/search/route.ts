import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/users/search?q={query}
 * Search for users by username
 */
export async function GET(request: NextRequest) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get('q');

        if (!query || query.trim().length === 0) {
            return NextResponse.json(
                { error: 'Search query is required' },
                { status: 400 }
            );
        }

        // Search for users by username (case-insensitive)
        // Exclude the current user from results
        const users = await prisma.user.findMany({
            where: {
                AND: [
                    {
                        username: {
                            contains: query.trim(),
                            mode: 'insensitive',
                        },
                    },
                    {
                        id: {
                            not: session.user.id,
                        },
                    },
                ],
            },
            select: {
                id: true,
                username: true,
                avatarUrl: true,
            },
            take: 10, // Limit results to 10 users
        });

        return NextResponse.json({ users });
    } catch (error) {
        console.error('Error searching users:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}
