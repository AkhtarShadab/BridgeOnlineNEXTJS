import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const searchParams = request.nextUrl.searchParams;
        const query = searchParams.get("q");

        if (!query || query.trim().length < 2) {
            return NextResponse.json({ users: [] });
        }

        // Search for users by username or email (exclude current user)
        const users = await prisma.user.findMany({
            where: {
                AND: [
                    {
                        id: {
                            not: session.user.id,
                        },
                    },
                    {
                        OR: [
                            {
                                username: {
                                    contains: query,
                                    mode: "insensitive",
                                },
                            },
                            {
                                email: {
                                    contains: query,
                                    mode: "insensitive",
                                },
                            },
                        ],
                    },
                ],
            },
            select: {
                id: true,
                username: true,
                email: true,
                avatarUrl: true,
                stats: true,
            },
            take: 20,
        });

        return NextResponse.json({ users });
    } catch (error) {
        console.error("Search users error:", error);
        return NextResponse.json(
            { error: "Failed to search users" },
            { status: 500 }
        );
    }
}
