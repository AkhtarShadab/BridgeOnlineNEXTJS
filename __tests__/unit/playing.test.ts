import { describe, it, expect } from 'vitest'
import { isValidPlay, determineTrickWinner, getNextPlayer } from '@/lib/game/playing'
import type { Card } from '@/lib/constants/cards'

// ─── isValidPlay ─────────────────────────────────────────────────────────────

describe('isValidPlay', () => {
  it('rejects a card that is not in the hand', () => {
    const hand: Card[] = ['AS', 'KH', '2C']
    const result = isValidPlay('QD', hand, [], 'S')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/not in hand/i)
  })

  it('accepts any card as the opening lead (first card of trick)', () => {
    const hand: Card[] = ['AS', 'KH', '2C']
    expect(isValidPlay('AS', hand, [], 'S').valid).toBe(true)
  })

  it('accepts following the led suit', () => {
    const hand: Card[] = ['KS', '2H']
    const trick = [{ card: 'AS' as Card, player: 'p1' }]
    expect(isValidPlay('KS', hand, trick, 'H').valid).toBe(true)
  })

  it('rejects playing off-suit when the player holds the led suit', () => {
    const hand: Card[] = ['KS', '2H']
    const trick = [{ card: 'AS' as Card, player: 'p1' }]
    const result = isValidPlay('2H', hand, trick, 'H')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/follow suit/i)
  })

  it('accepts any card when void in the led suit', () => {
    const hand: Card[] = ['2H', '3D'] // no spades
    const trick = [{ card: 'AS' as Card, player: 'p1' }]
    expect(isValidPlay('2H', hand, trick, 'C').valid).toBe(true)
    expect(isValidPlay('3D', hand, trick, 'C').valid).toBe(true)
  })

  it('accepts playing a trump when void in led suit', () => {
    const hand: Card[] = ['KH', '2D'] // no spades; trump = hearts
    const trick = [{ card: 'AS' as Card, player: 'p1' }]
    expect(isValidPlay('KH', hand, trick, 'H').valid).toBe(true)
  })
})

// ─── determineTrickWinner ────────────────────────────────────────────────────

describe('determineTrickWinner', () => {
  it('throws on an empty trick', () => {
    expect(() => determineTrickWinner([], 'S')).toThrow()
  })

  it('highest card of led suit wins when no trump played', () => {
    const trick = [
      { card: 'AS' as Card, player: 'p1' },
      { card: 'KS' as Card, player: 'p2' },
      { card: '2S' as Card, player: 'p3' },
      { card: 'QS' as Card, player: 'p4' },
    ]
    expect(determineTrickWinner(trick, 'H')).toBe('p1')
  })

  it('a trump card beats the highest card of led suit', () => {
    const trick = [
      { card: 'AS' as Card, player: 'p1' }, // led suit
      { card: '2H' as Card, player: 'p2' }, // trump
      { card: 'KS' as Card, player: 'p3' },
      { card: 'QS' as Card, player: 'p4' },
    ]
    expect(determineTrickWinner(trick, 'H')).toBe('p2')
  })

  it('highest trump wins when multiple trumps played', () => {
    const trick = [
      { card: 'AS' as Card, player: 'p1' }, // led suit
      { card: '2H' as Card, player: 'p2' }, // low trump
      { card: 'KH' as Card, player: 'p3' }, // high trump
      { card: 'QS' as Card, player: 'p4' },
    ]
    expect(determineTrickWinner(trick, 'H')).toBe('p3')
  })

  it('off-suit non-trump discards do not win', () => {
    const trick = [
      { card: 'KS' as Card, player: 'p1' }, // led suit
      { card: 'AD' as Card, player: 'p2' }, // off-suit, not trump
      { card: '2S' as Card, player: 'p3' },
      { card: 'AC' as Card, player: 'p4' }, // off-suit, not trump
    ]
    expect(determineTrickWinner(trick, 'H')).toBe('p1')
  })

  it('NT: highest card of led suit wins, no trump exists', () => {
    const trick = [
      { card: '9S' as Card, player: 'p1' },
      { card: 'AS' as Card, player: 'p2' },
      { card: '2S' as Card, player: 'p3' },
      { card: 'KS' as Card, player: 'p4' },
    ]
    expect(determineTrickWinner(trick, 'NT')).toBe('p2')
  })

  it('single-card trick: the only player wins', () => {
    expect(determineTrickWinner([{ card: '2C' as Card, player: 'solo' }], 'S')).toBe('solo')
  })
})

// ─── getNextPlayer ───────────────────────────────────────────────────────────

// Bridge clockwise order: North → East → South → West → North

describe('getNextPlayer', () => {
  const seats = {
    north: 'player-N',
    south: 'player-S',
    east: 'player-E',
    west: 'player-W',
  }

  it('north is followed by east (clockwise)', () => {
    expect(getNextPlayer('player-N', seats)).toBe('player-E')
  })

  it('east is followed by south (clockwise)', () => {
    expect(getNextPlayer('player-E', seats)).toBe('player-S')
  })

  it('south is followed by west (clockwise)', () => {
    expect(getNextPlayer('player-S', seats)).toBe('player-W')
  })

  it('west wraps back to north (clockwise)', () => {
    expect(getNextPlayer('player-W', seats)).toBe('player-N')
  })

  it('throws if the player is not found in seats', () => {
    expect(() => getNextPlayer('unknown-player', seats)).toThrow()
  })
})
