/**
 * Bridge game engine - core game logic and state management
 */

import { prisma } from '@/lib/db';
import { createDeck, shuffleDeck, dealCards, sortHand, type Card, cardToString } from './cardUtils';

export type SeatPosition = 'NORTH' | 'SOUTH' | 'EAST' | 'WEST';
export type GamePhase = 'INITIALIZING' | 'BIDDING' | 'PLAYING' | 'SCORING' | 'COMPLETED';

interface Vulnerability {
    NS: boolean;
    EW: boolean;
}

/**
 * Calculate vulnerability based on board number (standard rotation)
 * Board 1: None
 * Board 2: NS
 * Board 3: EW
 * Board 4: Both
 * Repeats every 4 boards
 */
export function calculateVulnerability(boardNumber: number): Vulnerability {
    const position = ((boardNumber - 1) % 4) + 1;

    switch (position) {
        case 1:
            return { NS: false, EW: false }; // None vulnerable
        case 2:
            return { NS: true, EW: false };  // NS vulnerable
        case 3:
            return { NS: false, EW: true };  // EW vulnerable
        case 4:
            return { NS: true, EW: true };   // Both vulnerable
        default:
            return { NS: false, EW: false };
    }
}

/**
 * Determine dealer based on board number (rotates clockwise)
 * Board 1: NORTH
 * Board 2: EAST
 * Board 3: SOUTH
 * Board 4: WEST
 * Repeats every 4 boards
 */
export function getDealerForBoard(boardNumber: number): SeatPosition {
    const positions: SeatPosition[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    const index = (boardNumber - 1) % 4;
    return positions[index];
}

/**
 * Get next player in clockwise order
 */
export function getNextPlayer(current: SeatPosition): SeatPosition {
    const order: SeatPosition[] = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
    const currentIndex = order.indexOf(current);
    return order[(currentIndex + 1) % 4];
}

/**
 * Initialize a new game instance
 */
export async function initializeGame(roomId: string) {
    // Get all players in the room
    const players = await prisma.gamePlayer.findMany({
        where: { gameRoomId: roomId },
        include: { user: true }
    });

    if (players.length !== 4) {
        throw new Error('Game requires exactly 4 players');
    }

    // Get room to determine board number
    const room = await prisma.gameRoom.findUnique({
        where: { id: roomId },
        select: { settings: true }
    });

    const boardNumber = 1; // Start with board 1
    const dealer = getDealerForBoard(boardNumber);
    const vulnerability = calculateVulnerability(boardNumber);

    // Create and shuffle deck
    const deck = createDeck();
    const shuffledDeck = shuffleDeck(deck);
    const hands = dealCards(shuffledDeck);

    // Sort each hand
    const sortedHands = {
        NORTH: sortHand(hands.NORTH),
        SOUTH: sortHand(hands.SOUTH),
        EAST: sortHand(hands.EAST),
        WEST: sortHand(hands.WEST),
    };

    // Find dealer player
    const dealerPlayer = players.find(p => p.seat === dealer);
    if (!dealerPlayer) {
        throw new Error('Dealer player not found');
    }

    // Create game record
    const game = await prisma.game.create({
        data: {
            gameRoomId: roomId,
            phase: 'BIDDING',
            boardNumber,
            dealerId: dealerPlayer.userId,
            currentPlayerId: dealerPlayer.userId, // Dealer starts bidding
            gameState: {
                hands: sortedHands,
                currentBid: null,
                bidHistory: [],
                tricks: [],
                currentTrick: [],
                trumpSuit: null,
                contract: null,
                vulnerability,
                dealer,
                passCount: 0, // Track consecutive passes
            },
            deck: shuffledDeck.map(cardToString), // Store deck for verification
        },
    });

    // Update game players to link to this game
    await prisma.gamePlayer.updateMany({
        where: { gameRoomId: roomId },
        data: { gameId: game.id },
    });

    // Update room status
    await prisma.gameRoom.update({
        where: { id: roomId },
        data: { status: 'IN_PROGRESS' },
    });

    return game;
}

/**
 * Get player's hand from game state
 */
export function getPlayerHand(gameState: any, seat: SeatPosition): Card[] {
    return gameState.hands[seat] || [];
}

/**
 * Remove card from player's hand
 */
export function removeCardFromHand(gameState: any, seat: SeatPosition, card: Card): any {
    const hand = gameState.hands[seat] || [];
    const cardStr = cardToString(card);

    const newHand = hand.filter((c: Card) => cardToString(c) !== cardStr);

    return {
        ...gameState,
        hands: {
            ...gameState.hands,
            [seat]: newHand,
        },
    };
}
