import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { validateBidAction, isBiddingComplete, determineContract, type BidAction } from '@/lib/game/bidding';
import { z } from 'zod';

const bidSchema = z.object({
    action: z.enum(['bid', 'pass', 'double', 'redouble']),
    bid: z.object({
        level: z.number().int().min(1).max(7),
        suit: z.enum(['C', 'D', 'H', 'S', 'NT']),
    }).optional(),
});

/**
 * POST /api/games/[gameId]/bid
 * Make a bid during the auction phase
 * Body: { action: "bid" | "pass" | "double" | "redouble", bid?: { level, suit } }
 */
export async function POST(
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
        const body = await request.json();
        const { action, bid } = bidSchema.parse(body);

        // Fetch game
        const game = await prisma.game.findUnique({
            where: { id: gameId },
            include: {
                gamePlayers: {
                    include: {
                        user: { select: { id: true, username: true } },
                    },
                },
                gameRoom: true,
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

        // Must be in BIDDING phase
        if (game.phase !== 'BIDDING') {
            return NextResponse.json(
                { error: 'Game is not in bidding phase' },
                { status: 400 }
            );
        }

        // Must be current player's turn
        if (game.currentPlayerId !== session.user.id) {
            return NextResponse.json(
                { error: 'Not your turn' },
                { status: 400 }
            );
        }

        const gameState = game.gameState as any;
        const bidHistory: BidAction[] = gameState.bidHistory || [];

        // Create bid action — include username for display in bid history
        const biddingPlayer = game.gamePlayers.find(p => p.userId === session.user.id);
        const bidAction: BidAction = {
            type: action,
            player: session.user.id,
            playerName: (biddingPlayer as any)?.user?.username || 'Unknown',
            seat: (biddingPlayer as any)?.seat || '',
            bid: bid ? {
                level: bid.level as any,
                suit: bid.suit,
            } : undefined,
        };

        // Validate bid (simplified - would need seat info for team logic)
        // const validation = validateBidAction(bidAction, bidHistory, session.user.id, null);
        // if (!validation.valid) {
        //   return NextResponse.json({ error: validation.error }, { status: 400 });
        // }

        // Add to bid history
        bidHistory.push(bidAction);

        // Determine next player (clockwise)
        const nextPlayer = getNextPlayer(game.gamePlayers, session.user.id);

        // Check if bidding is complete
        const biddingComplete = isBiddingComplete(bidHistory);
        let newPhase = game.phase;
        let contract = null;
        let declarerId = game.declarerId;

        if (biddingComplete) {
            contract = determineContract(bidHistory);
            if (contract) {
                newPhase = 'PLAYING';
                declarerId = contract.declarer;
            } else {
                // All passed, no contract - game ends
                newPhase = 'COMPLETED';
            }
        }

        // Update game state
        const updatedGameState = {
            ...gameState,
            bidHistory,
            currentBid: bidHistory.filter(b => b.type === 'bid').pop()?.bid || null,
            contract,
        };

        await prisma.game.update({
            where: { id: gameId },
            data: {
                gameState: updatedGameState,
                currentPlayerId: biddingComplete ? (contract ? getPlayerToLeftOfDeclarer(game.gamePlayers, contract.declarer) : null) : nextPlayer?.userId,
                phase: newPhase,
                declarerId: declarerId,
            },
        });

        // Emit WebSocket event to notify all players via both channels:
        // - room-* : joined during lobby phase
        // - game-* : joined when game page loads (after roomId is fetched)
        if (global.io) {
            const roomKey = `room-${game.gameRoom.id}`;
            const gameKey = `game-${gameId}`;
            const roomSockets = global.io.sockets.adapter.rooms.get(roomKey)?.size ?? 0;
            const gameSockets = global.io.sockets.adapter.rooms.get(gameKey)?.size ?? 0;
            console.log(`[BidRoute] Emitting game:bid_made → ${roomKey} (${roomSockets} sockets) + ${gameKey} (${gameSockets} sockets)`);
            global.io
                .to(roomKey)
                .to(gameKey)
                .emit('game:bid_made', {
                    gameId,
                    bid: bidAction,
                    biddingComplete,
                    contract,
                    phase: newPhase,
                });
        } else {
            console.error('[BidRoute] ⚠️ global.io is not set — WebSocket broadcast skipped!');
        }

        // Record move
        await prisma.gameMove.create({
            data: {
                gameId,
                playerId: session.user.id,
                moveType: action.toUpperCase() as any,
                moveData: bid || {},
                sequenceNumber: bidHistory.length,
            },
        });

        return NextResponse.json({
            success: true,
            bidAction,
            biddingComplete,
            contract,
            nextPhase: newPhase,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json(
                { error: 'Invalid bid', details: error.errors },
                { status: 400 }
            );
        }
        console.error('Error making bid:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

/**
 * Get next player in clockwise order
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
 * Get player to left of declarer (who leads first trick)
 */
function getPlayerToLeftOfDeclarer(players: any[], declarerId: string): string | null {
    const nextPlayer = getNextPlayer(players, declarerId);
    return nextPlayer?.userId || null;
}
