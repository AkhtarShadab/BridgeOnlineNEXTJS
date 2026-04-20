import { describe, it, expect } from 'vitest'
import {
  isBidHigher,
  validateBid,
  isBiddingComplete,
  determineContract,
  type Bid,
  type BidSuit,
  type BidLevel,
} from '@/lib/game/biddingEngine'

// ─── helpers ────────────────────────────────────────────────────────────────

function makeBid(player: string, level: BidLevel, suit: BidSuit): Bid {
  return { player: player as any, level, suit, type: 'BID' }
}

function makePass(player: string): Bid {
  return { player: player as any, type: 'PASS' }
}

function makeDouble(player: string): Bid {
  return { player: player as any, type: 'DOUBLE' }
}

function makeRedouble(player: string): Bid {
  return { player: player as any, type: 'REDOUBLE' }
}

// Basic game state builder
function gameState(overrides: {
  bidHistory?: Bid[]
  currentBid?: { level: BidLevel; suit: BidSuit } | null
  doubled?: boolean
  redoubled?: boolean
}) {
  return {
    bidHistory: overrides.bidHistory ?? [],
    currentBid: overrides.currentBid ?? null,
    doubled: overrides.doubled ?? false,
    redoubled: overrides.redoubled ?? false,
  }
}

// ─── isBidHigher ─────────────────────────────────────────────────────────────

describe('isBidHigher', () => {
  it('is always valid when there is no current bid', () => {
    expect(isBidHigher({ level: 1, suit: 'C' }, null)).toBe(true)
  })

  it('higher level beats lower level regardless of suit', () => {
    expect(isBidHigher({ level: 2, suit: 'C' }, { level: 1, suit: 'NT' })).toBe(true)
  })

  it('lower level is invalid', () => {
    expect(isBidHigher({ level: 1, suit: 'NT' }, { level: 2, suit: 'C' })).toBe(false)
  })

  it('same level: higher suit wins (suit order C < D < H < S < NT)', () => {
    expect(isBidHigher({ level: 1, suit: 'D' }, { level: 1, suit: 'C' })).toBe(true)
    expect(isBidHigher({ level: 1, suit: 'H' }, { level: 1, suit: 'D' })).toBe(true)
    expect(isBidHigher({ level: 1, suit: 'S' }, { level: 1, suit: 'H' })).toBe(true)
    expect(isBidHigher({ level: 1, suit: 'NT' }, { level: 1, suit: 'S' })).toBe(true)
  })

  it('same level and same suit is not higher', () => {
    expect(isBidHigher({ level: 2, suit: 'H' }, { level: 2, suit: 'H' })).toBe(false)
  })

  it('lower suit at same level is invalid', () => {
    expect(isBidHigher({ level: 3, suit: 'C' }, { level: 3, suit: 'D' })).toBe(false)
  })

  it('7NT is the highest possible bid', () => {
    expect(isBidHigher({ level: 7, suit: 'NT' }, { level: 7, suit: 'S' })).toBe(true)
    expect(isBidHigher({ level: 6, suit: 'NT' }, { level: 7, suit: 'C' })).toBe(false)
  })
})

// ─── validateBid ─────────────────────────────────────────────────────────────

describe('validateBid — turn order', () => {
  it('rejects a bid when it is not the player\'s turn', () => {
    const result = validateBid(makeBid('EAST', 1, 'C'), gameState({}), 'NORTH')
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/turn/i)
  })
})

describe('validateBid — BID', () => {
  it('accepts a valid opening bid', () => {
    const result = validateBid(makeBid('NORTH', 1, 'C'), gameState({}), 'NORTH')
    expect(result.valid).toBe(true)
  })

  it('rejects a bid lower than the current bid', () => {
    const state = gameState({ currentBid: { level: 2, suit: 'H' } })
    const result = validateBid(makeBid('NORTH', 1, 'S'), state, 'NORTH')
    expect(result.valid).toBe(false)
  })

  it('rejects a bid equal to the current bid', () => {
    const state = gameState({ currentBid: { level: 2, suit: 'H' } })
    const result = validateBid(makeBid('NORTH', 2, 'H'), state, 'NORTH')
    expect(result.valid).toBe(false)
  })

  it('accepts a bid that beats the current bid by suit', () => {
    const state = gameState({ currentBid: { level: 2, suit: 'H' } })
    const result = validateBid(makeBid('NORTH', 2, 'S'), state, 'NORTH')
    expect(result.valid).toBe(true)
  })

  it('rejects a bid with missing level or suit', () => {
    const bid: Bid = { player: 'NORTH' as any, type: 'BID' } // no level/suit
    const result = validateBid(bid, gameState({}), 'NORTH')
    expect(result.valid).toBe(false)
  })
})

describe('validateBid — PASS', () => {
  it('PASS is always valid regardless of game state', () => {
    expect(validateBid(makePass('NORTH'), gameState({}), 'NORTH').valid).toBe(true)
    expect(validateBid(makePass('NORTH'), gameState({ currentBid: { level: 7, suit: 'NT' } }), 'NORTH').valid).toBe(true)
  })
})

describe('validateBid — DOUBLE', () => {
  it('rejects double when there is no current bid', () => {
    const result = validateBid(makeDouble('EAST'), gameState({}), 'EAST')
    expect(result.valid).toBe(false)
  })

  it('rejects double when the last action is not a bid (e.g. after a pass)', () => {
    const history = [makeBid('NORTH', 1, 'S'), makePass('EAST')]
    const result = validateBid(
      makeDouble('SOUTH'),
      gameState({ bidHistory: history, currentBid: { level: 1, suit: 'S' } }),
      'SOUTH'
    )
    expect(result.valid).toBe(false)
  })

  it('rejects double of own partner\'s bid', () => {
    // NORTH and SOUTH are partners
    const history = [makeBid('NORTH', 1, 'S')]
    const result = validateBid(
      makeDouble('SOUTH'),
      gameState({ bidHistory: history, currentBid: { level: 1, suit: 'S' } }),
      'SOUTH'
    )
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/opponent/i)
  })

  it('accepts double of opponent\'s bid', () => {
    // NORTH bids, EAST (opponent) doubles
    const history = [makeBid('NORTH', 1, 'S')]
    const result = validateBid(
      makeDouble('EAST'),
      gameState({ bidHistory: history, currentBid: { level: 1, suit: 'S' } }),
      'EAST'
    )
    expect(result.valid).toBe(true)
  })

  it('rejects double when already doubled', () => {
    const history = [makeBid('NORTH', 1, 'S')]
    const result = validateBid(
      makeDouble('EAST'),
      gameState({ bidHistory: history, currentBid: { level: 1, suit: 'S' }, doubled: true }),
      'EAST'
    )
    expect(result.valid).toBe(false)
  })
})

describe('validateBid — REDOUBLE', () => {
  it('rejects redouble when not doubled', () => {
    const result = validateBid(makeRedouble('NORTH'), gameState({}), 'NORTH')
    expect(result.valid).toBe(false)
  })

  it('rejects redouble when already redoubled', () => {
    const result = validateBid(
      makeRedouble('NORTH'),
      gameState({ doubled: true, redoubled: true }),
      'NORTH'
    )
    expect(result.valid).toBe(false)
  })

  it('accepts redouble when bid is doubled', () => {
    const result = validateBid(
      makeRedouble('NORTH'),
      gameState({ doubled: true }),
      'NORTH'
    )
    expect(result.valid).toBe(true)
  })
})

// ─── isBiddingComplete ───────────────────────────────────────────────────────

describe('isBiddingComplete', () => {
  it('returns false with fewer than 4 actions', () => {
    expect(isBiddingComplete([makeBid('NORTH', 1, 'C'), makePass('EAST'), makePass('SOUTH')])).toBe(false)
  })

  it('returns false for 4 passes with no bid (passed-out board)', () => {
    const history = ['NORTH', 'EAST', 'SOUTH', 'WEST'].map(makePass)
    expect(isBiddingComplete(history)).toBe(false)
  })

  it('returns false when only 2 passes follow a bid', () => {
    const history = [
      makeBid('NORTH', 1, 'S'),
      makePass('EAST'),
      makePass('SOUTH'),
    ]
    expect(isBiddingComplete(history)).toBe(false)
  })

  it('returns true for bid followed by 3 consecutive passes', () => {
    const history = [
      makeBid('NORTH', 1, 'S'),
      makePass('EAST'),
      makePass('SOUTH'),
      makePass('WEST'),
    ]
    expect(isBiddingComplete(history)).toBe(true)
  })

  it('returns true for longer auction ending in 3 passes', () => {
    const history = [
      makeBid('NORTH', 1, 'C'),
      makeBid('EAST', 1, 'H'),
      makeBid('SOUTH', 2, 'C'),
      makePass('WEST'),
      makePass('NORTH'),
      makePass('EAST'),
    ]
    expect(isBiddingComplete(history)).toBe(true)
  })

  it('returns false when last action is not a pass', () => {
    const history = [
      makeBid('NORTH', 1, 'S'),
      makePass('EAST'),
      makePass('SOUTH'),
      makeBid('WEST', 2, 'H'),
    ]
    expect(isBiddingComplete(history)).toBe(false)
  })
})

// ─── determineContract ───────────────────────────────────────────────────────

describe('determineContract', () => {
  it('returns null for incomplete bidding', () => {
    expect(determineContract([makeBid('NORTH', 1, 'S'), makePass('EAST')])).toBeNull()
  })

  it('returns the last bid as the contract level and suit', () => {
    const history = [
      makeBid('NORTH', 1, 'S'),
      makeBid('EAST', 2, 'H'),
      makePass('SOUTH'),
      makePass('WEST'),
      makePass('NORTH'),
    ]
    const contract = determineContract(history)
    expect(contract).not.toBeNull()
    expect(contract!.level).toBe(2)
    expect(contract!.suit).toBe('H')
  })

  it('declarer is the first of the partnership to bid the contract suit', () => {
    // NORTH bids 1S first, SOUTH bids 2S later → declarer should be NORTH
    const history = [
      makeBid('NORTH', 1, 'S'),
      makePass('EAST'),
      makeBid('SOUTH', 2, 'S'),
      makePass('WEST'),
      makePass('NORTH'),
      makePass('EAST'),
    ]
    const contract = determineContract(history)
    expect(contract!.declarer).toBe('NORTH')
  })

  it('declarer is the bidder when only one partner bid the suit', () => {
    const history = [
      makeBid('EAST', 1, 'H'),
      makePass('SOUTH'),
      makePass('WEST'),
      makePass('NORTH'),
    ]
    const contract = determineContract(history)
    expect(contract!.declarer).toBe('EAST')
  })

  it('sets doubled flag when a double follows the last bid', () => {
    const history = [
      makeBid('NORTH', 1, 'S'),
      makeDouble('EAST'),
      makePass('SOUTH'),
      makePass('WEST'),
      makePass('NORTH'),
    ]
    const contract = determineContract(history)
    expect(contract!.doubled).toBe(true)
    expect(contract!.redoubled).toBe(false)
  })

  it('sets redoubled flag when a redouble follows the double', () => {
    const history = [
      makeBid('NORTH', 1, 'S'),
      makeDouble('EAST'),
      makeRedouble('SOUTH'),
      makePass('WEST'),
      makePass('NORTH'),
      makePass('EAST'),
    ]
    const contract = determineContract(history)
    expect(contract!.redoubled).toBe(true)
  })
})
