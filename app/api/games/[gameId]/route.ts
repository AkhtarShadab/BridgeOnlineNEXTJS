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
                gameRoom: {
                    select: { id: true, settings: true },
                },
                gameResult: true,
                gameMoves: { orderBy: { sequenceNumber: 'asc' } },
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

        // Determine declarer & dummy seats (needed by PlayingTable)
        let declarerSeat: string | null = null;
        let dummySeat: string | null = null;
        const declarerPlayer = game.gamePlayers.find(p => p.userId === game.declarerId);
        if (declarerPlayer) {
            declarerSeat = declarerPlayer.seat;
            dummySeat = getPartnerSeat(declarerSeat);
        }

        // Per-seat card counts for the table component (how many cards each player holds)
        const handCounts: Record<string, number> = {};
        for (const [seat, cards] of Object.entries(hands)) {
            handCounts[seat] = (cards as string[]).length;
        }

        // Get dummy hand if applicable (after first card played in PLAYING phase)
        let dummyHand = null;
        if (game.phase === 'PLAYING' && gameState.currentTrick && gameState.currentTrick.length > 0 && dummySeat) {
            dummyHand = hands[dummySeat] || [];
        }

        return NextResponse.json({
            gameId: game.id,
            roomId: game.gameRoom?.id,
            phase: game.phase,
            boardNumber: game.boardNumber,
            currentPlayer: game.currentPlayer,
            dealer: game.dealer,
            declarer: game.declarer,
            declarerSeat,
            dummySeat,
            playerSeat,
            hand: playerHand,
            dummyHand,
            handCounts,
            bidHistory: gameState.bidHistory || [],
            currentBid: gameState.currentBid || null,
            currentTrick: gameState.currentTrick || [],
            tricks: gameState.tricks || [],
            tricksWon: calculateTricksWon(gameState.tricks || []),
            contract: gameState.contract,
            trumpSuit: gameState.trumpSuit,
            vulnerability: gameState.vulnerability || { NS: false, EW: false },
            scoreNS: game.gameResult?.scoreNS ?? 0,
            scoreEW: game.gameResult?.scoreEW ?? 0,
            totalBoards: ((game.gameRoom as any)?.settings as any)?.numBoards ?? 1,
            // Feature 10: per-board scores from completed games in same room
            boardScores: await loadBoardScores(game.gameRoom.id, game.id),
            result: game.gameResult?.detailedScoring
                ? mapDetailedScoringToBreakdown(game.gameResult.detailedScoring)
                : null,
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

/**
 * Feature 10: load all completed-board scores for the same room, ordered by
 * board number. Used by ScoreCard to show session totals.
 */
async function loadBoardScores(roomId: string, currentGameId: string) {
    const completedGames = await prisma.game.findMany({
        where: {
            gameRoomId: roomId,
            phase: 'COMPLETED',
        },
        orderBy: { boardNumber: 'asc' },
        include: { gameResult: true },
    });
    return completedGames.map((g) => {
        const state = g.gameState as any;
        const contract = state?.contract;
        const overOrUnder = state?.tricksWon
            ? (g.gameResult?.tricksWon ?? 0) - (contract?.level ?? 0) - 6
            : 0;
        return {
            boardNumber: g.boardNumber,
            scoreNS: g.gameResult?.scoreNS ?? 0,
            scoreEW: g.gameResult?.scoreEW ?? 0,
            contract: contract
                ? {
                      level: contract.level,
                      suit: contract.suit,
                      doubled: contract.doubled,
                      redoubled: contract.redoubled,
                  }
                : null,
            result: contract
                ? {
                      contractMade: overOrUnder >= 0,
                      overtricks: overOrUnder > 0 ? overOrUnder : 0,
                      undertricks: overOrUnder < 0 ? -overOrUnder : 0,
                  }
                : null,
        };
    });
}

/**
 * Feature 10: hydrate the ScoreBreakdown from the stored detailedScoring.
 * If the stored scoring is already a full breakdown, return it; otherwise
 * build a minimal one from the integer totals.
 */
function mapDetailedScoringToBreakdown(detailed: any): any {
    if (!detailed) return null;
    // New shape: { result: ScoreBreakdown, breakdown, scoreNS, scoreEW }
    if (detailed.result && typeof detailed.result === 'object') {
        return detailed.result;
    }
    // Legacy shape: { breakdown, scoreNS, scoreEW } — derive minimal breakdown
    const contractMade = (detailed.breakdown?.penalty ?? 0) === 0;
    return {
        contractMade,
        tricksNeeded: 0,
        tricksTaken: 0,
        overtricks: detailed.breakdown?.overtricks ?? 0,
        undertricks: contractMade ? 0 : Math.abs(detailed.breakdown?.overtricks ?? 0),
        doubled: false,
        redoubled: false,
        trickScore: detailed.breakdown?.trickScore ?? 0,
        overtrickBonus: 0,
        gameBonus: detailed.breakdown?.gameBonus ?? 0,
        slamBonus: detailed.breakdown?.slamBonus ?? 0,
        doubleBonus: detailed.breakdown?.doubleBonus ?? 0,
        penalty: detailed.breakdown?.penalty ?? 0,
        points: (detailed.scoreNS ?? 0) > 0 ? detailed.scoreNS : -(detailed.scoreEW ?? 0),
    };
}
