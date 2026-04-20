import { describe, it, expect } from 'vitest'
import {
  createDeck,
  shuffleDeck,
  dealCards,
  sortHand,
  cardToString,
  stringToCard,
  getRankValue,
  type Card,
  type Suit,
  type Rank,
} from '@/lib/game/cardUtils'

describe('createDeck', () => {
  it('produces exactly 52 cards', () => {
    expect(createDeck()).toHaveLength(52)
  })

  it('contains no duplicate rank+suit pairs', () => {
    const deck = createDeck()
    const keys = deck.map(c => `${c.rank}${c.suit}`)
    expect(new Set(keys).size).toBe(52)
  })

  it('contains all 4 suits', () => {
    const suits = new Set(createDeck().map(c => c.suit))
    expect(suits).toEqual(new Set(['S', 'H', 'D', 'C']))
  })
})

describe('shuffleDeck', () => {
  it('returns 52 cards', () => {
    expect(shuffleDeck(createDeck())).toHaveLength(52)
  })

  it('does not mutate the original deck', () => {
    const deck = createDeck()
    const original = deck.map(c => ({ ...c }))
    shuffleDeck(deck)
    expect(deck).toEqual(original)
  })

  it('contains the same cards as the input', () => {
    const deck = createDeck()
    const shuffled = shuffleDeck(deck)
    const toKey = (c: Card) => `${c.rank}${c.suit}`
    expect(new Set(shuffled.map(toKey))).toEqual(new Set(deck.map(toKey)))
  })
})

describe('dealCards', () => {
  it('throws if deck does not have 52 cards', () => {
    expect(() => dealCards(createDeck().slice(0, 51))).toThrow()
  })

  it('gives each seat exactly 13 cards', () => {
    const deck = shuffleDeck(createDeck())
    const hands = dealCards(deck)
    expect(hands.NORTH).toHaveLength(13)
    expect(hands.SOUTH).toHaveLength(13)
    expect(hands.EAST).toHaveLength(13)
    expect(hands.WEST).toHaveLength(13)
  })

  it('deals all 52 unique cards with no card appearing twice', () => {
    const hands = dealCards(shuffleDeck(createDeck()))
    const all = [...hands.NORTH, ...hands.SOUTH, ...hands.EAST, ...hands.WEST]
    const keys = all.map(c => `${c.rank}${c.suit}`)
    expect(keys).toHaveLength(52)
    expect(new Set(keys).size).toBe(52)
  })
})

describe('sortHand', () => {
  it('does not mutate the original array', () => {
    const hand: Card[] = [{ suit: 'S', rank: '2' }, { suit: 'H', rank: 'A' }]
    const copy = [...hand]
    sortHand(hand)
    expect(hand).toEqual(copy)
  })

  it('sorts spades before hearts before diamonds before clubs', () => {
    const hand: Card[] = [
      { suit: 'C', rank: 'A' },
      { suit: 'D', rank: 'K' },
      { suit: 'H', rank: 'Q' },
      { suit: 'S', rank: 'J' },
    ]
    const sorted = sortHand(hand)
    expect(sorted.map(c => c.suit)).toEqual(['S', 'H', 'D', 'C'])
  })

  it('within a suit sorts ranks highest to lowest', () => {
    const hand: Card[] = [
      { suit: 'S', rank: '2' },
      { suit: 'S', rank: 'A' },
      { suit: 'S', rank: 'K' },
      { suit: 'S', rank: '5' },
    ]
    const sorted = sortHand(hand)
    expect(sorted.map(c => c.rank)).toEqual(['A', 'K', '5', '2'])
  })
})

describe('cardToString', () => {
  it('converts Ace of Spades to "AS"', () => {
    expect(cardToString({ suit: 'S', rank: 'A' })).toBe('AS')
  })

  it('converts Ten of Hearts to "TH"', () => {
    expect(cardToString({ suit: 'H', rank: 'T' })).toBe('TH')
  })

  it('converts 2 of Clubs to "2C"', () => {
    expect(cardToString({ suit: 'C', rank: '2' })).toBe('2C')
  })
})

describe('stringToCard', () => {
  it('parses "AS" to { rank: "A", suit: "S" }', () => {
    expect(stringToCard('AS')).toEqual({ rank: 'A', suit: 'S' })
  })

  it('parses "TH" to { rank: "T", suit: "H" }', () => {
    expect(stringToCard('TH')).toEqual({ rank: 'T', suit: 'H' })
  })

  it('parses "2C" to { rank: "2", suit: "C" }', () => {
    expect(stringToCard('2C')).toEqual({ rank: '2', suit: 'C' })
  })

  it('throws on wrong length', () => {
    expect(() => stringToCard('ACE')).toThrow()
    expect(() => stringToCard('A')).toThrow()
  })

  it('throws on invalid rank', () => {
    expect(() => stringToCard('1S')).toThrow()
  })

  it('throws on invalid suit', () => {
    expect(() => stringToCard('AX')).toThrow()
  })

  it('roundtrips: cardToString → stringToCard', () => {
    const card: Card = { suit: 'D', rank: 'K' }
    expect(stringToCard(cardToString(card))).toEqual(card)
  })
})

describe('getRankValue', () => {
  it('Ace is 14 (highest)', () => {
    expect(getRankValue('A')).toBe(14)
  })

  it('2 is 2 (lowest)', () => {
    expect(getRankValue('2')).toBe(2)
  })

  it('Ten is 10', () => {
    expect(getRankValue('T')).toBe(10)
  })

  it('King (13) beats Queen (12) beats Jack (11)', () => {
    expect(getRankValue('K')).toBeGreaterThan(getRankValue('Q'))
    expect(getRankValue('Q')).toBeGreaterThan(getRankValue('J'))
  })
})
