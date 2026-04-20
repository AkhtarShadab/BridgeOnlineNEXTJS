import { describe, it, expect } from 'vitest'
import { calculateScore, type ContractScoring } from '@/lib/game/scoring'

// ─── helpers ────────────────────────────────────────────────────────────────

function score(
  level: number,
  suit: ContractScoring['suit'],
  tricksWon: number,
  declarer: 'NS' | 'EW' = 'NS',
  vul = false,
  doubled = false,
  redoubled = false
) {
  return calculateScore(
    { level, suit, doubled, redoubled },
    tricksWon,
    declarer,
    { NS: vul, EW: false }
  )
}

// ─── Partscore contracts ──────────────────────────────────────────────────────

describe('partscore bonuses (trick score < 100)', () => {
  it('1NT made exactly: 40 trick + 50 partscore = 90', () => {
    const r = score(1, 'NT', 7)
    expect(r.scoreNS).toBe(90)
    expect(r.breakdown.trickScore).toBe(40)
    expect(r.breakdown.gameBonus).toBe(50)
  })

  it('2♣ made exactly: 40 trick + 50 partscore = 90', () => {
    const r = score(2, 'C', 8)
    expect(r.scoreNS).toBe(90)
  })

  it('1♠ made exactly: 30 trick + 50 partscore = 80', () => {
    const r = score(1, 'S', 7)
    expect(r.scoreNS).toBe(80)
  })
})

// ─── Game contracts ───────────────────────────────────────────────────────────

describe('game bonuses (trick score ≥ 100)', () => {
  it('3NT made: 100 trick + 300 (not vul) = 400', () => {
    const r = score(3, 'NT', 9)
    expect(r.scoreNS).toBe(400)
    expect(r.breakdown.trickScore).toBe(100)
    expect(r.breakdown.gameBonus).toBe(300)
  })

  it('3NT made vulnerable: 100 + 500 = 600', () => {
    expect(score(3, 'NT', 9, 'NS', true).scoreNS).toBe(600)
  })

  it('4♠ made: 120 + 300 = 420', () => {
    expect(score(4, 'S', 10).scoreNS).toBe(420)
  })

  it('4♠ made vulnerable: 120 + 500 = 620', () => {
    expect(score(4, 'S', 10, 'NS', true).scoreNS).toBe(620)
  })

  it('5♣ made: 100 + 300 = 400', () => {
    expect(score(5, 'C', 11).scoreNS).toBe(400)
  })
})

// ─── Slam bonuses ────────────────────────────────────────────────────────────

describe('small slam bonus (level 6)', () => {
  it('6♠ not vul: 180 + 300 + 500 = 980', () => {
    const r = score(6, 'S', 12)
    expect(r.scoreNS).toBe(980)
    expect(r.breakdown.slamBonus).toBe(500)
  })

  it('6♠ vulnerable: 180 + 500 + 750 = 1430', () => {
    const r = score(6, 'S', 12, 'NS', true)
    expect(r.scoreNS).toBe(1430)
    expect(r.breakdown.slamBonus).toBe(750)
  })
})

describe('grand slam bonus (level 7)', () => {
  it('7NT not vul: 220 + 300 + 1000 = 1520', () => {
    const r = score(7, 'NT', 13)
    expect(r.scoreNS).toBe(1520)
    expect(r.breakdown.slamBonus).toBe(1000)
  })

  it('7NT vulnerable: 220 + 500 + 1500 = 2220', () => {
    const r = score(7, 'NT', 13, 'NS', true)
    expect(r.scoreNS).toBe(2220)
    expect(r.breakdown.slamBonus).toBe(1500)
  })
})

// ─── Overtricks ──────────────────────────────────────────────────────────────

describe('overtrick scoring', () => {
  it('1♠ +1 overtrick (not doubled): +30', () => {
    const r = score(1, 'S', 8)
    expect(r.breakdown.overtricks).toBe(30)
    expect(r.scoreNS).toBe(80 + 30) // partscore 80 base + 30 overtrick
  })

  it('1♣ +1 overtrick (not doubled): +20 (minor)', () => {
    const r = score(1, 'C', 8)
    expect(r.breakdown.overtricks).toBe(20)
  })

  it('2♠ doubled +1 overtrick (not vul): +100', () => {
    const r = score(2, 'S', 9, 'NS', false, true)
    expect(r.breakdown.overtricks).toBe(100)
  })

  it('2♠ doubled +1 overtrick (vul): +200', () => {
    const r = score(2, 'S', 9, 'NS', true, true)
    expect(r.breakdown.overtricks).toBe(200)
  })
})

// ─── Doubled/Redoubled made ───────────────────────────────────────────────────

describe('doubled contracts made', () => {
  it('3NT doubled made: trick score ×2 = 200, +50 insult bonus, +300 game = 550', () => {
    const r = score(3, 'NT', 9, 'NS', false, true)
    expect(r.breakdown.trickScore).toBe(200)
    expect(r.breakdown.doubleBonus).toBe(50)
    expect(r.breakdown.gameBonus).toBe(300)
    expect(r.scoreNS).toBe(550)
  })

  it('1♣ doubled made: tick score ×2 = 40 (< 100 → partscore), +50 insult = 140', () => {
    const r = score(1, 'C', 7, 'NS', false, true)
    expect(r.breakdown.trickScore).toBe(40)
    expect(r.breakdown.gameBonus).toBe(50)
    expect(r.breakdown.doubleBonus).toBe(50)
    expect(r.scoreNS).toBe(140)
  })
})

// ─── Undertricks (not doubled) ───────────────────────────────────────────────

describe('undertrick penalties — undoubled', () => {
  it('down 1 not vul: -50', () => {
    expect(score(1, 'S', 6).scoreNS).toBe(-50)
  })

  it('down 2 not vul: -100', () => {
    expect(score(1, 'S', 5).scoreNS).toBe(-100)
  })

  it('down 1 vulnerable: -100', () => {
    expect(score(1, 'S', 6, 'NS', true).scoreNS).toBe(-100)
  })

  it('down 3 vulnerable: -300', () => {
    expect(score(1, 'S', 4, 'NS', true).scoreNS).toBe(-300)
  })
})

// ─── Undertricks (doubled) ────────────────────────────────────────────────────

describe('undertrick penalties — doubled (not vul)', () => {
  it('down 1: -100', () => {
    expect(score(1, 'S', 6, 'NS', false, true).scoreNS).toBe(-100)
  })

  it('down 2: -300', () => {
    expect(score(1, 'S', 5, 'NS', false, true).scoreNS).toBe(-300)
  })

  it('down 3: -500', () => {
    expect(score(1, 'S', 4, 'NS', false, true).scoreNS).toBe(-500)
  })

  it('down 4: -800', () => {
    expect(score(1, 'S', 3, 'NS', false, true).scoreNS).toBe(-800)
  })
})

describe('undertrick penalties — doubled (vul)', () => {
  it('down 1: -200', () => {
    expect(score(1, 'S', 6, 'NS', true, true).scoreNS).toBe(-200)
  })

  it('down 2: -500', () => {
    expect(score(1, 'S', 5, 'NS', true, true).scoreNS).toBe(-500)
  })

  it('down 3: -800', () => {
    expect(score(1, 'S', 4, 'NS', true, true).scoreNS).toBe(-800)
  })
})

// ─── EW declarer ─────────────────────────────────────────────────────────────

describe('score assigned to correct side', () => {
  it('EW declarer: score appears in scoreEW, scoreNS is 0', () => {
    const r = calculateScore(
      { level: 4, suit: 'S', doubled: false, redoubled: false },
      10,
      'EW',
      { NS: false, EW: false }
    )
    expect(r.scoreEW).toBe(420)
    expect(r.scoreNS).toBe(0)
  })

  it('EW declarer undertrick: penalty in scoreEW as negative', () => {
    const r = calculateScore(
      { level: 4, suit: 'S', doubled: false, redoubled: false },
      9,
      'EW',
      { NS: false, EW: false }
    )
    expect(r.scoreEW).toBe(-50)
    expect(r.scoreNS).toBe(0)
  })
})

// ─── NT trick score formula ───────────────────────────────────────────────────

describe('NT trick score formula (40 first + 30 each)', () => {
  it('1NT = 40', () => {
    expect(score(1, 'NT', 7).breakdown.trickScore).toBe(40)
  })

  it('2NT = 70', () => {
    expect(score(2, 'NT', 8).breakdown.trickScore).toBe(70)
  })

  it('3NT = 100', () => {
    expect(score(3, 'NT', 9).breakdown.trickScore).toBe(100)
  })
})
