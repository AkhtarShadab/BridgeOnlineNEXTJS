import { Card, RANK_VALUES, Suit, Rank } from '../constants/cards';

export interface Trick {
    cards: { card: Card; player: string }[];
    winner: string;
    ledSuit: Suit;
}

/**
 * Validate if a card play is legal
 */
export function isValidPlay(
    card: Card,
    hand: Card[],
    currentTrick: { card: Card; player: string }[],
    trumpSuit: Suit | 'NT' | null
): { valid: boolean; error?: string } {
    if (!hand.includes(card)) {
        return { valid: false, error: 'Card not in hand' };
    }

    // First card of trick - always valid
    if (currentTrick.length === 0) {
        return { valid: true };
    }

    // Must follow suit if possible
    const ledSuit = currentTrick[0].card[1] as Suit;
    const cardSuit = card[1] as Suit;

    if (cardSuit !== ledSuit) {
        // Check if player has any cards of led suit
        const hasLedSuit = hand.some(c => c[1] === ledSuit);
        if (hasLedSuit) {
            return { valid: false, error: `Must follow suit: ${ledSuit}` };
        }
    }

    return { valid: true };
}

/**
 * Determine the winner of a trick
 */
export function determineTrickWinner(
    trick: { card: Card; player: string }[],
    trumpSuit: Suit | 'NT' | null
): string {
    if (trick.length === 0) throw new Error('Empty trick');

    const ledSuit = trick[0].card[1] as Suit;

    let winningCard = trick[0];

    for (let i = 1; i < trick.length; i++) {
        const currentCard = trick[i];
        const currentSuit = currentCard.card[1] as Suit;
        const winningSuit = winningCard.card[1] as Suit;

        // Trump beats non-trump
        if (trumpSuit && trumpSuit !== 'NT') {
            if (currentSuit === trumpSuit && winningSuit !== trumpSuit) {
                winningCard = currentCard;
                continue;
            }
            if (winningSuit === trumpSuit && currentSuit !== trumpSuit) {
                continue;
            }
        }

        // Must be same suit to compare
        if (currentSuit === winningSuit) {
            const currentRank = currentCard.card[0] as Rank;
            const winningRank = winningCard.card[0] as Rank;

            if (RANK_VALUES[currentRank] > RANK_VALUES[winningRank]) {
                winningCard = currentCard;
            }
        }
    }

    return winningCard.player;
}

/**
 * Get the next player in clockwise order
 */
export function getNextPlayer(
    currentPlayer: string,
    seats: { north: string; south: string; east: string; west: string }
): string {
    const seatOrder = ['north', 'south', 'east', 'west'] as const;

    // Find current player's seat
    const currentSeat = Object.entries(seats).find(
        ([_, playerId]) => playerId === currentPlayer
    )?.[0] as typeof seatOrder[number] | undefined;

    if (!currentSeat) throw new Error('Player not found in seats');

    const currentIndex = seatOrder.indexOf(currentSeat);
    const nextIndex = (currentIndex + 1) % 4;
    const nextSeat = seatOrder[nextIndex];

    return seats[nextSeat];
}
