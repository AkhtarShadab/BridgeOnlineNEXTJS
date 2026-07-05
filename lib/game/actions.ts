/**
 * Feature 18 — Pure game-action processing extracted from the bid/play routes.
 *
 * Both the API routes (inline path, FEATURE_ACTION_QUEUE=false) and the Game
 * Worker (queue path, FEATURE_ACTION_QUEUE=true) call these functions. This
 * removes the duplication and gives the worker a framework-agnostic entry point.
 *
 * Idempotency: each action carries an `actionId` (client UUID). The functions
 * check whether the action has already been applied (by looking for the
 * actionId in bidHistory / currentTrick) and return the prior result without
 * re-mutating if so. This guards against retried jobs double-applying.
 */

import { prisma } from '@/lib/db';
import { getGameStateStore, type GameState } from './gameStateStore';
import { isBiddingComplete, isPassedOut, determineContract, type BidAction } from './bidding';
import { isValidPlay, determineTrickWinner } from './playing';
import { calculateScore } from './scoring';
import { applyBoardToStats, normalizeStats, winningSideOf, TEAM_OF_SEAT, type Seat } from './stats';
import { incrementGamesCompleted } from '../observability/metrics';
import { getDealerForBoard, calculateVulnerability } from './gameEngine';
import { createDeck, shuffleDeck, dealCards, sortHand, cardToString } from './cardUtils';
import { GamePhase } from '@prisma/client';
import type { Card } from '@/lib/constants/cards';

export interface ActionResult {
    success: boolean;
    error?: string;
    status: number;
    data: Record<string, unknown>;
}

/**
 * Process a bid action. Extracted from app/api/games/[gameId]/bid/route.ts.
 * Called inline (flag off) or by the worker (flag on).
 */
export async function processBidAction(
    gameId: string,
    userId: string,
    action: 'bid' | 'pass' | 'double' | 'redouble',
    bid: { level: number; suit: string } | undefined,
    actionId: string,
): Promise<ActionResult> {
    const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
            gamePlayers: { include: { user: { select: { id: true, username: true } } } },
            gameRoom: true,
        },
    });

    if (!game) return { success: false, error: 'Game not found', status: 404, data: {} };

    const player = game.gamePlayers.find(p => p.userId === userId);
    if (!player) return { success: false, error: 'You are not in this game', status: 403, data: {} };
    if (game.phase !== 'BIDDING') return { success: false, error: 'Game is not in bidding phase', status: 400, data: {} };
    if (game.currentPlayerId !== userId) return { success: false, error: 'Not your turn', status: 400, data: {} };

    const gameState = ((await getGameStateStore().load(gameId)) ?? (game.gameState as any)) as any;
    const bidHistory: (BidAction & { actionId?: string })[] = gameState.bidHistory || [];

    // Idempotency: if this actionId is already in bidHistory, skip.
    if (bidHistory.some(b => (b as any).actionId === actionId)) {
        return { success: true, status: 200, data: { bidAction: bidHistory.find(b => (b as any).actionId === actionId), idempotent: true } };
    }

    const biddingPlayer = game.gamePlayers.find(p => p.userId === userId);
    const bidAction: BidAction & { actionId?: string } = {
        type: action,
        player: userId,
        playerName: (biddingPlayer as any)?.user?.username || 'Unknown',
        seat: (biddingPlayer as any)?.seat || '',
        actionId,
        bid: bid ? { level: bid.level as any, suit: bid.suit as any } : undefined,
    };

    bidHistory.push(bidAction);
    const nextPlayer = getNextPlayer(game.gamePlayers, userId);

    // Passed-out board → redeal
    if (isPassedOut(bidHistory)) {
        const nextBoardNumber = (game.boardNumber ?? 1) + 1;
        const newDealer = getDealerForBoard(nextBoardNumber);
        const newVulnerability = calculateVulnerability(nextBoardNumber);
        const deck = createDeck();
        const shuffled = shuffleDeck(deck);
        const hands = dealCards(shuffled);
        const sortedHands = {
            NORTH: sortHand(hands.NORTH), SOUTH: sortHand(hands.SOUTH),
            EAST: sortHand(hands.EAST), WEST: sortHand(hands.WEST),
        };
        const dealerPlayer = game.gamePlayers.find((p: any) => p.seat === newDealer);
        const redealtState = {
            hands: sortedHands, currentBid: null, bidHistory: [], tricks: [],
            currentTrick: [], trumpSuit: null, contract: null,
            vulnerability: newVulnerability, dealer: newDealer, passCount: 0,
        };
        await getGameStateStore().save(gameId, redealtState as unknown as GameState, { phaseTransition: true });
        await prisma.game.update({
            where: { id: gameId },
            data: {
                phase: GamePhase.BIDDING, boardNumber: nextBoardNumber,
                dealerId: dealerPlayer?.userId ?? game.dealerId,
                currentPlayerId: dealerPlayer?.userId ?? game.currentPlayerId,
                deck: shuffled.map(cardToString),
            },
        });
        if (global.io) {
            global.io.to(`room-${game.gameRoom.id}`).to(`game-${gameId}`).emit('game:passed_out', { gameId, boardNumber: nextBoardNumber, dealer: newDealer, vulnerability: newVulnerability });
        }
        await prisma.gameMove.create({ data: { gameId, playerId: userId, moveType: 'PASS', moveData: { actionId }, sequenceNumber: bidHistory.length } });
        return { success: true, status: 200, data: { bidAction, passedOut: true, boardNumber: nextBoardNumber } };
    }

    // Check if bidding complete
    const biddingComplete = isBiddingComplete(bidHistory);
    let newPhase: GamePhase = game.phase;
    let contract = null;
    let declarerId = game.declarerId;
    if (biddingComplete) {
        contract = determineContract(bidHistory);
        if (contract) { newPhase = GamePhase.PLAYING; declarerId = contract.declarer; }
    }

    const updatedGameState = { ...gameState, bidHistory, currentBid: bidHistory.filter(b => b.type === 'bid').pop()?.bid || null, contract };
    const finalCurrentPlayerId = biddingComplete
        ? (contract ? getPlayerToLeftOfDeclarer(game.gamePlayers, contract.declarer) : null)
        : nextPlayer?.userId || null;

    await getGameStateStore().save(gameId, updatedGameState as GameState, { phaseTransition: biddingComplete });
    await prisma.game.update({ where: { id: gameId }, data: { currentPlayerId: finalCurrentPlayerId, phase: newPhase, declarerId } });

    if (global.io) {
        global.io.to(`room-${game.gameRoom.id}`).to(`game-${gameId}`).emit('game:bid_made', { gameId, bid: bidAction, biddingComplete, contract, phase: newPhase });
    }
    await prisma.gameMove.create({ data: { gameId, playerId: userId, moveType: action.toUpperCase() as any, moveData: { ...bid, actionId }, sequenceNumber: bidHistory.length } });

    return { success: true, status: 200, data: { bidAction, biddingComplete, contract, nextPhase: newPhase } };
}

/**
 * Process a card play. Extracted from app/api/games/[gameId]/play/route.ts.
 */
export async function processPlayAction(
    gameId: string,
    userId: string,
    card: string,
    actionId: string,
): Promise<ActionResult> {
    const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: { gamePlayers: true, gameRoom: true },
    });

    if (!game) return { success: false, error: 'Game not found', status: 404, data: {} };
    const player = game.gamePlayers.find(p => p.userId === userId);
    if (!player) return { success: false, error: 'You are not in this game', status: 403, data: {} };
    if (game.phase !== 'PLAYING') return { success: false, error: 'Game is not in playing phase', status: 400, data: {} };

    const declarer = game.gamePlayers.find(p => p.userId === game.declarerId);
    const dummySeat = declarer ? getPartnerSeat(declarer.seat) : null;
    const isDummyTurn = dummySeat && game.gamePlayers.find(p => p.seat === dummySeat)?.userId === game.currentPlayerId;
    const isDeclarerPlayingForDummy = game.declarerId === userId && isDummyTurn;
    if (game.currentPlayerId !== userId && !isDeclarerPlayingForDummy) {
        return { success: false, error: 'Not your turn', status: 400, data: {} };
    }

    const gameState = ((await getGameStateStore().load(gameId)) ?? (game.gameState as any)) as any;
    const hands: Record<string, string[]> = { ...(gameState.hands || {}) };
    const currentPlayerSeat = game.gamePlayers.find(p => p.userId === game.currentPlayerId)?.seat;
    if (!currentPlayerSeat) return { success: false, error: 'Current player not found', status: 500, data: {} };

    const currentHand = hands[currentPlayerSeat] || [];

    // Idempotency: if the card is already not in the hand AND it's in the
    // currentTrick or tricks with this actionId, it was already played.
    const currentTrick: any[] = gameState.currentTrick || [];
    if (!currentHand.includes(card) && currentTrick.some(t => t.card === card && t.actionId === actionId)) {
        return { success: true, status: 200, data: { card, idempotent: true } };
    }

    if (!currentHand.includes(card)) return { success: false, error: 'Card not in your hand', status: 400, data: {} };
    const validation = isValidPlay(card as Card, currentHand as Card[], currentTrick, gameState.contract?.suit ?? null);
    if (!validation.valid) return { success: false, error: validation.error, status: 400, data: {} };

    const updatedHand = currentHand.filter((c: string) => c !== card);
    hands[currentPlayerSeat] = updatedHand;
    currentTrick.push({ card, player: game.currentPlayerId, seat: currentPlayerSeat, actionId });

    let tricks: any[] = gameState.tricks || [];
    let nextPlayer = getNextPlayer(game.gamePlayers, game.currentPlayerId!);
    let newPhase: GamePhase = game.phase;

    if (currentTrick.length === 4) {
        const winnerPlayerId = determineTrickWinner(currentTrick, gameState.contract?.suit ?? null);
        const winnerPlayer = game.gamePlayers.find(p => p.userId === winnerPlayerId);
        tricks.push({ cards: currentTrick, winner: winnerPlayer?.seat });
        nextPlayer = winnerPlayer;
        gameState.currentTrick = [];

        if (tricks.length === 13) {
            newPhase = GamePhase.SCORING;
            const tricksWon = calculateTricksWon(tricks);
            const declarerTeam = declarer && (declarer.seat === 'NORTH' || declarer.seat === 'SOUTH') ? 'NS' : 'EW';
            const declarerTricks = declarerTeam === 'NS' ? tricksWon.NS : tricksWon.EW;
            const contract = gameState.contract;
            const vulnerability = getVulnerability(game.boardNumber);
            const score = calculateScore(contract, declarerTricks, declarerTeam, vulnerability);
            const contractMade = declarerTricks >= contract.level + 6;

            await prisma.gameResult.create({
                data: {
                    gameId, winningTeam: score.scoreNS > score.scoreEW ? 'NS' : 'EW',
                    contractTricks: contract.level + 6, contractSuit: contract.suit,
                    tricksWon: declarerTricks, scoreNS: score.scoreNS, scoreEW: score.scoreEW,
                    detailedScoring: { ...(score as object), statsApplied: true },
                },
            });
            await updatePlayerStatsForBoard(game.gamePlayers, declarer?.seat as Seat | undefined, contractMade, score.scoreNS, score.scoreEW);

            const finalGameState = { ...gameState, hands, currentTrick: [], tricks };
            await getGameStateStore().save(gameId, finalGameState as GameState, { phaseTransition: true });
            await getGameStateStore().evict(gameId);
            await prisma.game.update({ where: { id: gameId }, data: { phase: GamePhase.COMPLETED, endedAt: new Date() } });
            // Feature 21: increment the games-completed Prometheus counter.
            incrementGamesCompleted();

            const roomSettings = (game.gameRoom as any).settings ?? {};
            const totalBoards = typeof roomSettings === 'object' ? (roomSettings as any).numBoards ?? 1 : 1;
            const nextGameId = game.boardNumber < totalBoards ? await startNextBoard(game, game.gameRoom.id) : null;

            if (global.io) {
                global.io.to(`room-${game.gameRoom.id}`).to(`game-${gameId}`).emit('game:card_played', { gameId, card });
                global.io.to(`room-${game.gameRoom.id}`).to(`game-${gameId}`).emit('game:completed', { gameId, score, nextGameId, boardNumber: game.boardNumber, totalBoards });
            }
            return { success: true, status: 200, data: { card, trickComplete: true, gameComplete: true, score, nextGameId, boardNumber: game.boardNumber, totalBoards } };
        }
        if (global.io) {
            global.io.to(`room-${game.gameRoom.id}`).to(`game-${gameId}`).emit('game:card_played', { gameId, card });
            global.io.to(`room-${game.gameRoom.id}`).to(`game-${gameId}`).emit('game:trick_completed', { gameId });
        }
    } else {
        gameState.currentTrick = currentTrick;
    }

    const updatedGameState = { ...gameState, hands, currentTrick: currentTrick.length === 4 ? [] : currentTrick, tricks };
    await getGameStateStore().save(gameId, updatedGameState as GameState, { phaseTransition: false });
    await prisma.game.update({ where: { id: gameId }, data: { currentPlayerId: nextPlayer?.userId, phase: newPhase } });
    await prisma.gameMove.create({ data: { gameId, playerId: userId, moveType: 'PLAY_CARD', moveData: { card, actionId }, sequenceNumber: (gameState.bidHistory?.length || 0) + tricks.length * 4 + currentTrick.length } });

    if (global.io) {
        global.io.to(`room-${game.gameRoom.id}`).to(`game-${gameId}`).emit('game:card_played', { gameId, card });
    }
    return { success: true, status: 200, data: { card, trickComplete: currentTrick.length === 4, gameComplete: false } };
}

/* ── helpers (copied from the routes to keep actions.ts self-contained) ── */

function getNextPlayer(players: any[], currentPlayerId: string): any {
    const seatOrder = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    const currentPlayer = players.find(p => p.userId === currentPlayerId);
    if (!currentPlayer) return null;
    const nextSeat = seatOrder[(seatOrder.indexOf(currentPlayer.seat) + 1) % 4];
    return players.find(p => p.seat === nextSeat);
}

function getPlayerToLeftOfDeclarer(players: any[], declarerId: string): string | null {
    return getNextPlayer(players, declarerId)?.userId || null;
}

function getPartnerSeat(seat: string): string {
    return { NORTH: 'SOUTH', SOUTH: 'NORTH', EAST: 'WEST', WEST: 'EAST' }[seat] || seat;
}

function calculateTricksWon(tricks: any[]): { NS: number; EW: number } {
    let NS = 0, EW = 0;
    tricks.forEach(t => { if (t.winner === 'NORTH' || t.winner === 'SOUTH') NS++; else EW++; });
    return { NS, EW };
}

function getVulnerability(boardNumber: number): { NS: boolean; EW: boolean } {
    const vuln = boardNumber % 16;
    if ([1, 8, 11, 14].includes(vuln)) return { NS: false, EW: false };
    if ([2, 5, 12, 15].includes(vuln)) return { NS: true, EW: false };
    if ([3, 6, 9, 0].includes(vuln)) return { NS: false, EW: true };
    if ([4, 7, 10, 13].includes(vuln)) return { NS: true, EW: true };
    return { NS: false, EW: false };
}

async function updatePlayerStatsForBoard(
    gamePlayers: { userId: string; seat: string }[],
    declarerSeat: Seat | undefined,
    contractMade: boolean,
    scoreNS: number,
    scoreEW: number,
) {
    const seated = gamePlayers.filter((p): p is { userId: string; seat: Seat } => !!p.userId && p.seat in TEAM_OF_SEAT);
    if (seated.length === 0) return;
    const winningSide = winningSideOf(declarerSeat ? { declarer: declarerSeat } : null, contractMade);
    const scoreMagnitude = Math.abs(scoreNS) + Math.abs(scoreEW);
    const users = await prisma.user.findMany({ where: { id: { in: seated.map(p => p.userId) } }, select: { id: true, stats: true } });
    const statsById = new Map(users.map(u => [u.id, normalizeStats(u.stats)]));
    await prisma.$transaction(seated.map(p => {
        const prev = statsById.get(p.userId) ?? { gamesPlayed: 0, gamesWon: 0, totalScore: 0 };
        const next = applyBoardToStats(prev, p.seat, winningSide, scoreMagnitude);
        return prisma.user.update({ where: { id: p.userId }, data: { stats: next } });
    }));
}

async function startNextBoard(completedGame: any, roomId: string): Promise<string | null> {
    try {
        const nextBoardNumber = (completedGame.boardNumber ?? 1) + 1;
        const dealer = getDealerForBoard(nextBoardNumber);
        const vulnerability = calculateVulnerability(nextBoardNumber);
        const players = await prisma.gamePlayer.findMany({ where: { gameRoomId: roomId } });
        if (players.length !== 4) return null;
        const deck = createDeck(); const shuffled = shuffleDeck(deck); const hands = dealCards(shuffled);
        const sortedHands = {
            NORTH: sortHand(hands.NORTH).map(cardToString), SOUTH: sortHand(hands.SOUTH).map(cardToString),
            EAST: sortHand(hands.EAST).map(cardToString), WEST: sortHand(hands.WEST).map(cardToString),
        };
        const dealerPlayer = players.find(p => p.seat === dealer);
        if (!dealerPlayer) return null;
        const newGame = await prisma.game.create({
            data: {
                gameRoomId: roomId, phase: GamePhase.BIDDING, boardNumber: nextBoardNumber,
                dealerId: dealerPlayer.userId, currentPlayerId: dealerPlayer.userId,
                gameState: { hands: sortedHands, currentBid: null, bidHistory: [], tricks: [], currentTrick: [], trumpSuit: null, contract: null, vulnerability, dealer, passCount: 0 } as object,
                deck: shuffled.map(cardToString),
            },
        });
        await prisma.gamePlayer.updateMany({ where: { gameRoomId: roomId }, data: { gameId: newGame.id, isReady: false } });
        if (global.io) {
            global.io.to(`room-${roomId}`).to(`game-${completedGame.id}`).emit('game:next_board', { gameId: completedGame.id, nextGameId: newGame.id, boardNumber: nextBoardNumber });
        }
        return newGame.id;
    } catch (error) {
        console.error('[actions] Error starting next board:', error);
        return null;
    }
}
