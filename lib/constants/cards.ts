// Card ranks and suits
export const SUITS = ['C', 'D', 'H', 'S'] as const;
export const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;

export type Suit = typeof SUITS[number];
export type Rank = typeof RANKS[number];
export type Card = `${Rank}${Suit}`;

// Suit symbols for display
export const SUIT_SYMBOLS: Record<Suit, string> = {
    C: '♣',
    D: '♦',
    H: '♥',
    S: '♠',
};

// Suit colors
export const SUIT_COLORS: Record<Suit, 'red' | 'black'> = {
    C: 'black',
    D: 'red',
    H: 'red',
    S: 'black',
};

// Rank names
export const RANK_NAMES: Record<Rank, string> = {
    '2': '2',
    '3': '3',
    '4': '4',
    '5': '5',
    '6': '6',
    '7': '7',
    '8': '8',
    '9': '9',
    'T': '10',
    'J': 'Jack',
    'Q': 'Queen',
    'K': 'King',
    'A': 'Ace',
};

// Card values for comparison (higher is better)
export const RANK_VALUES: Record<Rank, number> = {
    '2': 2,
    '3': 3,
    '4': 4,
    '5': 5,
    '6': 6,
    '7': 7,
    '8': 8,
    '9': 9,
    'T': 10,
    'J': 11,
    'Q': 12,
    'K': 13,
    'A': 14,
};

// Suit order for bidding (lower suits < higher suits)
export const SUIT_ORDER: Record<Suit | 'NT', number> = {
    C: 1,
    D: 2,
    H: 3,
    S: 4,
    NT: 5,
};
