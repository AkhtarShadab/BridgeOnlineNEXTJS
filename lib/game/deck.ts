import { Card, RANKS, SUITS } from '../constants/cards';

/**
 * Generate a standard 52-card deck
 */
export function generateDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push(`${rank}${suit}` as Card);
        }
    }
    return deck;
}

/**
 * Shuffle deck using Fisher-Yates algorithm
 */
export function shuffleDeck(deck: Card[]): Card[] {
    const shuffled = [...deck];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
}

/**
 * Deal cards to 4 players (13 cards each)
 */
export function dealCards(deck: Card[]): {
    north: Card[];
    south: Card[];
    east: Card[];
    west: Card[];
} {
    const shuffled = shuffleDeck(deck);
    return {
        north: shuffled.slice(0, 13),
        south: shuffled.slice(13, 26),
        east: shuffled.slice(26, 39),
        west: shuffled.slice(39, 52),
    };
}

/**
 * Sort a hand of cards by suit and rank
 */
export function sortHand(hand: Card[]): Card[] {
    return hand.sort((a, b) => {
        const suitA = a[1];
        const suitB = b[1];
        if (suitA !== suitB) {
            return SUITS.indexOf(suitA as any) - SUITS.indexOf(suitB as any);
        }
        const rankA = a[0];
        const rankB = b[0];
        return RANKS.indexOf(rankB as any) - RANKS.indexOf(rankA as any); // Descending within suit
    });
}
