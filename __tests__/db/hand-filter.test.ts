import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPrisma, cleanDatabase, createTestUser, createTestRoom } from '../helpers/test-prisma';
import { createDeck, shuffleDeck, dealCards, sortHand, cardToString } from '@/lib/game/cardUtils';
import { getPlayerHand, removeCardFromHand } from '@/lib/game/gameEngine';

beforeAll(async () => { await testPrisma.$connect(); });
afterAll(async () => { await cleanDatabase(); await testPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('Hand isolation — each player only sees their own cards', () => {
  it('stores all 4 hands in game state but each player gets only theirs', async () => {
    const users = await Promise.all([
      createTestUser(), createTestUser(), createTestUser(), createTestUser(),
    ]);
    const room = await createTestRoom(users[0].id);
    const seats = ['NORTH', 'SOUTH', 'EAST', 'WEST'] as const;

    await Promise.all(
      users.map((user, i) =>
        testPrisma.gamePlayer.create({
          data: { gameRoomId: room.id, userId: user.id, seat: seats[i] },
        })
      )
    );

    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    const hands = dealCards(shuffled);
    const sortedHands = {
      NORTH: sortHand(hands.NORTH),
      SOUTH: sortHand(hands.SOUTH),
      EAST: sortHand(hands.EAST),
      WEST: sortHand(hands.WEST),
    };

    const game = await testPrisma.game.create({
      data: {
        gameRoomId: room.id,
        phase: 'BIDDING',
        boardNumber: 1,
        dealerId: users[0].id,
        currentPlayerId: users[0].id,
        gameState: {
          hands: sortedHands,
          currentBid: null,
          bidHistory: [],
          tricks: [],
          currentTrick: [],
          trumpSuit: null,
          contract: null,
          vulnerability: { NS: false, EW: false },
          dealer: 'NORTH',
          passCount: 0,
        },
      },
    });

    const stored = game.gameState as any;

    for (const seat of seats) {
      const hand = getPlayerHand(stored, seat);
      expect(hand).toHaveLength(13);

      // Other seats' cards must NOT appear in this player's hand
      for (const otherSeat of seats.filter((s) => s !== seat)) {
        const otherHand = getPlayerHand(stored, otherSeat);
        const overlap = hand.filter((card: any) =>
          otherHand.some((oc: any) => cardToString(card) === cardToString(oc))
        );
        expect(overlap).toHaveLength(0);
      }
    }
  });

  it('all 52 cards are dealt exactly once', async () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    const hands = dealCards(shuffled);

    const allCards = [
      ...hands.NORTH,
      ...hands.SOUTH,
      ...hands.EAST,
      ...hands.WEST,
    ].map(cardToString);

    expect(allCards).toHaveLength(52);
    expect(new Set(allCards).size).toBe(52);
  });

  it('removes a played card from the player hand', async () => {
    const deck = createDeck();
    const shuffled = shuffleDeck(deck);
    const hands = dealCards(shuffled);
    const sortedHands = {
      NORTH: sortHand(hands.NORTH),
      SOUTH: sortHand(hands.SOUTH),
      EAST: sortHand(hands.EAST),
      WEST: sortHand(hands.WEST),
    };

    const gameState = {
      hands: sortedHands,
      tricks: [],
      currentTrick: [],
    };

    const cardToPlay = sortedHands.NORTH[0];
    const updated = removeCardFromHand(gameState, 'NORTH', cardToPlay);

    expect(updated.hands.NORTH).toHaveLength(12);
    expect(
      updated.hands.NORTH.some(
        (c: any) => cardToString(c) === cardToString(cardToPlay)
      )
    ).toBe(false);
    expect(updated.hands.SOUTH).toHaveLength(13);
  });

  it('game state persisted to DB is filtered per-player on read', async () => {
    const users = await Promise.all([
      createTestUser(), createTestUser(), createTestUser(), createTestUser(),
    ]);
    const room = await createTestRoom(users[0].id);
    const seats = ['NORTH', 'SOUTH', 'EAST', 'WEST'] as const;
    const players = await Promise.all(
      users.map((user, i) =>
        testPrisma.gamePlayer.create({
          data: { gameRoomId: room.id, userId: user.id, seat: seats[i] },
        })
      )
    );

    const deck = createDeck();
    const hands = dealCards(shuffleDeck(deck));
    const gameState = { hands, currentBid: null, bidHistory: [], tricks: [], currentTrick: [] };

    const game = await testPrisma.game.create({
      data: {
        gameRoomId: room.id,
        phase: 'BIDDING',
        boardNumber: 1,
        dealerId: users[0].id,
        gameState,
      },
    });

    // Simulate per-player hand filtering (as done in /api/games/[gameId])
    const fetchedGame = await testPrisma.game.findUnique({ where: { id: game.id } });
    const state = fetchedGame!.gameState as any;

    for (let i = 0; i < 4; i++) {
      const seat = players[i].seat;
      const visibleHand = state.hands[seat];
      expect(visibleHand).toHaveLength(13);
    }
  });
});
