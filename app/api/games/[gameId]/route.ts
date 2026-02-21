import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';

/**
 * GET /api/games/[gameId]
 * Get current game state for the authenticated player
 */
export async function GET(
    request: NextRequest,
    { params }: { params: Promise<{ gameId: string }> }
) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { gameId } = await params;

        const game = await prisma.game.findUnique({
            where: { id: gameId },
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
                currentPlayer: {
                    select: {
                        id: true,
                        username: true,
                    },
                },
                dealer: {
                    select: {
                        id: true,
                        username: true,
                    },
                },
                declarer: {
                    select: {
                        id: true,
                        username: true,
                    },
                },
            },
        });

        if (!game) {
            return NextResponse.json(
                { error: 'Game not found' },
                { status: 404 }
            );
        }

        // Verify player is in this game
        const player = game.gamePlayers.find(p => p.userId === session.user.id);
        if (!player) {
            return NextResponse.json(
                { error: 'You are not in this game' },
                { status: 403 }
            );
        }

        // Get player's seat
        const playerSeat = player.seat;

        // Get player's hand from gameState
        const gameState = game.gameState as any;
        const hands = gameState.hands || {};
        const playerHand = hands[playerSeat] || [];

        // Get dummy hand if applicable (after first card played in PLAYING phase)
        let dummyHand = null;
        if (game.phase === 'PLAYING' && gameState.currentTrick && gameState.currentTrick.length > 0) {
            // Find dummy seat (partner of declarer)
            const declarerPlayer = game.gamePlayers.find(p => p.userId === game.declarerId);
            if (declarerPlayer) {
                const declarerSeat = declarerPlayer.seat;
                const dummySeat = getPartnerSeat(declarerSeat);
                dummyHand = hands[dummySeat] || [];
            }
        }

        return NextResponse.json({
            gameId: game.id,
            phase: game.phase,
            boardNumber: game.boardNumber,
            currentPlayer: game.currentPlayer,
            dealer: game.dealer,
            declarer: game.declarer,
            playerSeat,
            hand: playerHand,
            dummyHand,
            bidHistory: gameState.bidHistory || [],
            currentTrick: gameState.currentTrick || [],
            tricks: gameState.tricks || [],
            tricksWon: calculateTricksWon(gameState.tricks || []),
            contract: gameState.contract,
            trumpSuit: gameState.trumpSuit,
            players: game.gamePlayers.map(p => ({
                userId: p.userId,
                username: p.user.username,
                seat: p.seat,
                avatarUrl: p.user.avatarUrl,
            })),
        });
    } catch (error) {
        console.error('Error fetching game state:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * Get partner seat (opposite seat)
 */
function getPartnerSeat(seat: string): string {
    const partners: Record<string, string> = {
        NORTH: 'SOUTH',
        SOUTH: 'NORTH',
        EAST: 'WEST',
        WEST: 'EAST',
    };
    return partners[seat] || seat;
}

/**
 * Calculate tricks won by each team
 */
function calculateTricksWon(tricks: any[]): { NS: number; EW: number } {
    let NS = 0;
    let EW = 0;

    tricks.forEach(trick => {
        if (trick.winner === 'NORTH' || trick.winner === 'SOUTH') {
            NS++;
        } else if (trick.winner === 'EAST' || trick.winner === 'WEST') {
            EW++;
        }
    });

    return { NS, EW };
}
