import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { processBidAction } from '@/lib/game/actions';
import { shouldUseQueue, enqueueGameAction, type BidPayload } from '@/lib/queue/gameQueue';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const bidSchema = z.object({
    action: z.enum(['bid', 'pass', 'double', 'redouble']),
    bid: z.object({
        level: z.number().int().min(1).max(7),
        suit: z.enum(['C', 'D', 'H', 'S', 'NT']),
    }).optional(),
    actionId: z.string().optional(), // Feature 18: client-generated UUID for idempotency
});

/**
 * POST /api/games/[gameId]/bid
 * Make a bid during the auction phase.
 *
 * Feature 18: when FEATURE_ACTION_QUEUE is on (and Redis configured), the action
 * is enqueued to BullMQ and processed by the Game Worker (serialized per game).
 * When off, processed inline via processBidAction. The client sends an
 * `actionId` (UUID) for idempotency; if missing, one is generated server-side.
 */
export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ gameId: string }> }
) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { gameId } = await params;
        const body = await request.json();
        const { action, bid, actionId } = bidSchema.parse(body);
        const finalActionId = actionId ?? randomUUID();

        // Fast-fail validation before enqueueing: auth ✓, Zod ✓, player in game ✓.
        // Phase/turn checks happen in the processing function (or worker).
        const game = await prisma.game.findUnique({
            where: { id: gameId },
            include: { gamePlayers: true },
        });
        if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
        const player = game.gamePlayers.find(p => p.userId === session.user.id);
        if (!player) return NextResponse.json({ error: 'You are not in this game' }, { status: 403 });

        // Feature 18: enqueue or process inline.
        if (shouldUseQueue()) {
            const payload: BidPayload = { action, bid: bid as BidPayload['bid'] | undefined };
            await enqueueGameAction({ actionId: finalActionId, gameId, userId: session.user.id, type: 'bid', payload });
            return NextResponse.json({ success: true, queued: true, actionId: finalActionId });
        }

        // Inline path (current behavior): process synchronously.
        const result = await processBidAction(gameId, session.user.id, action, bid as { level: number; suit: string } | undefined, finalActionId);
        return NextResponse.json(result.data, { status: result.status });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid bid', details: error.errors }, { status: 400 });
        }
        console.error('Error making bid:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
