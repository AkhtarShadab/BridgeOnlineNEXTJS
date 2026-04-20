import { describe, it, expect } from 'vitest'
import { generateDeck, shuffleDeck, dealCards, sortHand } from '@/lib/game/deck'
import { SUITS, RANKS } from '@/lib/constants/cards'

describe('generateDeck', () => {
  it('produces exactly 52 cards', () => {
    expect(generateDeck()).toHaveLength(52)
  })

  it('contains no duplicates', () => {
    const deck = generateDeck()
    expect(new Set(deck).size).toBe(52)
  })

  it('contains every rank × suit combination', () => {
    const deck = new Set(generateDeck())
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        expect(deck.has(`${rank}${suit}`)).toBe(true)
      }
    }
  })
})

describe('shuffleDeck', () => {
  it('returns 52 cards', () => {
    expect(shuffleDeck(generateDeck())).toHaveLength(52)
  })

  it('contains the same cards as the input', () => {
    const deck = generateDeck()
    const shuffled = shuffleDeck(deck)
    expect(new Set(shuffled)).toEqual(new Set(deck))
  })

  it('does not mutate the original deck', () => {
    const deck = generateDeck()
    const copy = [...deck]
    shuffleDeck(deck)
    expect(deck).toEqual(copy)
  })
})

describe('dealCards', () => {
  it('gives each player exactly 13 cards', () => {
    const hands = dealCards(generateDeck())
    expect(hands.north).toHaveLength(13)
    expect(hands.south).toHaveLength(13)
    expect(hands.east).toHaveLength(13)
    expect(hands.west).toHaveLength(13)
  })

  it('deals all 52 unique cards across the four hands', () => {
    const { north, south, east, west } = dealCards(generateDeck())
    const all = [...north, ...south, ...east, ...west]
    expect(all).toHaveLength(52)
    expect(new Set(all).size).toBe(52)
  })

  it('no card appears in more than one hand', () => {
    const { north, south, east, west } = dealCards(generateDeck())
    const northSet = new Set(north)
    for (const card of [...south, ...east, ...west]) {
      expect(northSet.has(card)).toBe(false)
    }
  })
})

describe('sortHand', () => {
  it('groups cards by suit', () => {
    const { north } = dealCards(generateDeck())
    const sorted = sortHand([...north])
    let lastSuit = sorted[0][1]
    for (const card of sorted) {
      const suit = card[1]
      if (suit !== lastSuit) {
        // Once suit changes it should not reappear
        expect(sorted.filter(c => c[1] === lastSuit).every(c => sorted.indexOf(c) < sorted.indexOf(card))).toBe(true)
        lastSuit = suit
      }
    }
  })

  it('within a suit, orders cards from highest to lowest rank', () => {
    const hand = ['2S', 'AS', 'KS', '5S'] as any[]
    const sorted = sortHand(hand)
    const spades = sorted.filter(c => c[1] === 'S')
    const ranks = spades.map(c => RANKS.indexOf(c[0] as any))
    for (let i = 1; i < ranks.length; i++) {
      expect(ranks[i]).toBeLessThan(ranks[i - 1])
    }
  })
})
