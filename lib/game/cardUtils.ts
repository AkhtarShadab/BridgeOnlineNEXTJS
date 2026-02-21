/**
 * Card utility functions for Bridge game
 */

export type Suit = 'S' | 'H' | 'D' | 'C'; // Spades, Hearts, Diamonds, Clubs
export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
    suit: Suit;
    rank: Rank;
}

const SUITS: Suit[] = ['S', 'H', 'D', 'C'];
const RANKS: Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

/**
 * Create a standard 52-card deck
 */
export function createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of SUITS) {
        for (const rank of RANKS) {
            deck.push({ suit, rank });
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
 * Deal 13 cards to each of 4 players
 */
export function dealCards(shuffledDeck: Card[]): {
    NORTH: Card[];
    SOUTH: Card[];
    EAST: Card[];
    WEST: Card[];
} {
    if (shuffledDeck.length !== 52) {
        throw new Error('Deck must have exactly 52 cards');
    }

    return {
        NORTH: shuffledDeck.slice(0, 13),
        SOUTH: shuffledDeck.slice(13, 26),
        EAST: shuffledDeck.slice(26, 39),
        WEST: shuffledDeck.slice(39, 52),
    };
}

/**
 * Sort hand by suit (Spades, Hearts, Diamonds, Clubs) and rank
 */
export function sortHand(cards: Card[]): Card[] {
    const suitOrder: Record<Suit, number> = { S: 0, H: 1, D: 2, C: 3 };
    const rankOrder: Record<Rank, number> = {
        '2': 0, '3': 1, '4': 2, '5': 3, '6': 4, '7': 5, '8': 6,
        '9': 7, 'T': 8, 'J': 9, 'Q': 10, 'K': 11, 'A': 12
    };

    return [...cards].sort((a, b) => {
        if (a.suit !== b.suit) {
            return suitOrder[a.suit] - suitOrder[b.suit];
        }
        return rankOrder[b.rank] - rankOrder[a.rank]; // Descending rank within suit
    });
}

/**
 * Convert card to string representation (e.g., "AS" for Ace of Spades)
 */
export function cardToString(card: Card): string {
    return `${card.rank}${card.suit}`;
}

/**
 * Parse string to card (e.g., "AS" -> { suit: 'S', rank: 'A' })
 */
export function stringToCard(str: string): Card {
    if (str.length !== 2) {
        throw new Error('Invalid card string format');
    }
    const rank = str[0] as Rank;
    const suit = str[1] as Suit;

    if (!RANKS.includes(rank) || !SUITS.includes(suit)) {
        throw new Error('Invalid card');
    }

    return { suit, rank };
}

/**
 * Get numeric value of rank for comparison
 */
export function getRankValue(rank: Rank): number {
    const values: Record<Rank, number> = {
        '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8,
        '9': 9, 'T': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14
    };
    return values[rank];
}
