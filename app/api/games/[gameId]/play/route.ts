import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { validateCardPlay, evaluateTrick } from '@/lib/game/playing';
import { calculateScore } from '@/lib/game/scoring';
import { z } from 'zod';

const playCardSchema = z.object({
    card: z.string().regex(/^[2-9TJQKA][CDHS]$/), // e.g., "AS", "KH", "QD"
});

/**
 * POST /api/games/[gameId]/play
 * Play a card during the playing phase
 * Body: { card: "AS" }
 */
export async function POST(
    request: NextRequest,
    { params }: { params: { gameId: string } }
) {
    try {
        const session = await auth();

        if (!session?.user?.id) {
            return NextResponse.json(
                { error: 'Unauthorized' },
                { status: 401 }
            );
        }

        const { gameId } = params;
        const body = await request.json();
        const { card } = playCardSchema.parse(body);

        // Fetch game
        const game = await prisma.game.findUnique({
            where: { id: gameId },
            include: {
                gamePlayers: true,
            },
        });

        if (!game) {
            return NextResponse.json(
                { error: 'Game not found' },
                { status: 404 }
            );
        }

        // Verify player is in game
        const player = game.gamePlayers.find(p => p.userId === session.user.id);
        if (!player) {
            return NextResponse.json(
                { error: 'You are not in this game' },
                { status: 403 }
            );
        }

        //Must be in PLAYING phase
        if (game.phase !== 'PLAYING') {
            return NextResponse.json(
                { error: 'Game is not in playing phase' },
                { status: 400 }
            );
        }

        // Must be current player's turn (or declarer playing for dummy)
        const playerSeat = player.seat;
        const isPlayerTurn = game.currentPlayerId === session.user.id;

        // Check if player is declarer and it's dummy's turn
        const declarer = game.gamePlayers.find(p => p.userId === game.declarerId);
        const dummySeat = declarer ? getPartnerSeat(declarer.seat) : null;
        const isDummyTurn = dummySeat && game.gamePlayers.find(p => p.seat === dummySeat)?.userId === game.currentPlayerId;
        const isDeclarerPlayingForDummy = game.declarerId === session.user.id && isDummyTurn;

        if (!isPlayerTurn && !isDeclarerPlayingForDummy) {
            return NextResponse.json(
                { error: 'Not your turn' },
                { status: 400 }
            );
        }

        const gameState = game.gameState as any;
        const hands = game.deck as any;

        // Get current player's hand
        const currentPlayerSeat = game.gamePlayers.find(p => p.userId === game.currentPlayerId)?.seat;
        if (!currentPlayerSeat) {
            return NextResponse.json({ error: 'Current player not found' }, { status: 500 });
        }

        const currentHand = hands[currentPlayerSeat] || [];

        // Validate card is in hand
        if (!currentHand.includes(card)) {
            return NextResponse.json(
                { error: 'Card not in your hand' },
                { status: 400 }
            );
        }

        // Validate play follows suit rules
        const currentTrick = gameState.currentTrick || [];
        const validation = validateCardPlay(card, currentHand, currentTrick, gameState.contract?.suit);

        if (!validation.valid) {
            return NextResponse.json(
                { error: validation.error },
                { status: 400 }
            );
        }

        // Remove card from hand
        const updatedHand = currentHand.filter((c: string) => c !== card);
        hands[currentPlayerSeat] = updatedHand;

        // Add card to current trick
        currentTrick.push({
            card,
            player: game.currentPlayerId,
            seat: currentPlayerSeat,
        });

        let tricks = gameState.tricks || [];
        let nextPlayer = getNextPlayer(game.gamePlayers, game.currentPlayerId!);
        let newPhase = game.phase;

        // Check if trick is complete (4 cards)
        if (currentTrick.length === 4) {
            const winner = evaluateTrick(currentTrick, gameState.contract?.suit || null);
            tricks.push({
                cards: currentTrick,
                winner: winner.seat,
            });

            // Winner leads next trick
            nextPlayer = game.gamePlayers.find(p => p.seat === winner.seat);
            gameState.currentTrick = [];

            // Check if all 13 tricks complete
            if (tricks.length === 13) {
                newPhase = 'SCORING';

                // Calculate score
                const tricksWon = calculateTricksWon(tricks);
                const declarerTeam = declarer && (declarer.seat === 'NORTH' || declarer.seat === 'SOUTH') ? 'NS' : 'EW';
                const declarerTricks = declarerTeam === 'NS' ? tricksWon.NS : tricksWon.EW;

                const contract = gameState.contract;
                const vulnerability = getVulnerability(game.boardNumber);

                const score = calculateScore(contract, declarerTricks, declarerTeam, vulnerability);

                // Create game result
                await prisma.gameResult.create({
                    data: {
                        gameId,
                        winningTeam: score.scoreNS > score.scoreEW ? 'NS' : 'EW',
                        contractTricks: contract.level + 6,
                        contractSuit: contract.suit,
                        tricksWon: declarerTricks,
                        scoreNS: score.scoreNS,
                        scoreEW: score.scoreEW,
                        detailedScoring: score,
                    },
                });

                await prisma.game.update({
                    where: { id: gameId },
                    data: {
                        phase: 'COMPLETED',
                        endedAt: new Date(),
                    },
                });

                return NextResponse.json({
                    success: true,
                    card,
                    trickComplete: true,
                    gameComplete: true,
                    score,
                });
            }
        } else {
            gameState.currentTrick = currentTrick;
        }

        // Update game state
        const updatedGameState = {
            ...gameState,
            currentTrick: currentTrick.length === 4 ? [] : currentTrick,
            tricks,
        };

        await prisma.game.update({
            where: { id: gameId },
            data: {
                gameState: updatedGameState,
                deck: hands,
                currentPlayerId: nextPlayer?.userId,
                phase: newPhase,
            },
        });

        // Record move
        await prisma.gameMove.create({
            data: {
                gameId,
                playerId: session.user.id,
                moveType: 'PLAY_CARD',
                moveData: { card },
                sequenceNumber: (gameState.bidHistory?.length || 0) + tricks.length * 4 + currentTrick.length,
            },
        });

        return NextResponse.json({
            success: true,
            card,
            trickComplete: currentTrick.length === 4,
            gameComplete: newPhase === 'COMPLETED',
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid card', details: error.errors },
                { status: 400 }
            );
        }
        console.error('Error playing card:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * Get partner seat (opposite)
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
 * Get next player clockwise
 */
function getNextPlayer(players: any[], currentPlayerId: string): any {
    const seatOrder = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    const currentPlayer = players.find(p => p.userId === currentPlayerId);
    if (!currentPlayer) return null;

    const currentSeatIndex = seatOrder.indexOf(currentPlayer.seat);
    const nextSeatIndex = (currentSeatIndex + 1) % 4;
    const nextSeat = seatOrder[nextSeatIndex];

    return players.find(p => p.seat === nextSeat);
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
        } else {
            EW++;
        }
    });

    return { NS, EW };
}

/**
 * Get vulnerability based on board number
 */
function getVulnerability(boardNumber: number): { NS: boolean; EW: boolean } {
    const vuln = boardNumber % 16;

    // Standard vulnerability rotation
    if ([1, 8, 11, 14].includes(vuln)) return { NS: false, EW: false };
    if ([2, 5, 12, 15].includes(vuln)) return { NS: true, EW: false };
    if ([3, 6, 9, 0].includes(vuln)) return { NS: false, EW: true };
    if ([4, 7, 10, 13].includes(vuln)) return { NS: true, EW: true };

    return { NS: false, EW: false };
}
