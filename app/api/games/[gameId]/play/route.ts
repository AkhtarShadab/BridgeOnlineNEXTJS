import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { processPlayAction } from '@/lib/game/actions';
import { shouldUseQueue, enqueueGameAction, type PlayPayload } from '@/lib/queue/gameQueue';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const playCardSchema = z.object({
    card: z.string().regex(/^[2-9TJQKA][CDHS]$/), // e.g., "AS", "KH", "QD"
    actionId: z.string().optional(), // Feature 18: client-generated UUID for idempotency
});

/**
 * POST /api/games/[gameId]/play
 * Play a card during the playing phase.
 *
 * Feature 18: when FEATURE_ACTION_QUEUE is on (and Redis configured), the action
 * is enqueued to BullMQ and processed by the Game Worker (serialized per game).
 * When off, processed inline via processPlayAction.
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
        const { card, actionId } = playCardSchema.parse(body);
        const finalActionId = actionId ?? randomUUID();

        // Fast-fail: auth ✓, Zod ✓, player in game ✓.
        const game = await prisma.game.findUnique({
            where: { id: gameId },
            include: { gamePlayers: true },
        });
        if (!game) return NextResponse.json({ error: 'Game not found' }, { status: 404 });
        const player = game.gamePlayers.find(p => p.userId === session.user.id);
        if (!player) return NextResponse.json({ error: 'You are not in this game' }, { status: 403 });

        // Feature 18: enqueue or process inline.
        if (shouldUseQueue()) {
            const payload: PlayPayload = { card };
            await enqueueGameAction({ actionId: finalActionId, gameId, userId: session.user.id, type: 'play', payload });
            return NextResponse.json({ success: true, queued: true, actionId: finalActionId });
        }

        // Inline path (current behavior): process synchronously.
        const result = await processPlayAction(gameId, session.user.id, card, finalActionId);
        return NextResponse.json(result.data, { status: result.status });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: 'Invalid card', details: error.errors }, { status: 400 });
        }
        console.error('Error playing card:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
