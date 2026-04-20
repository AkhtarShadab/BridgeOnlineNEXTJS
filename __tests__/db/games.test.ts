import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPrisma, cleanDatabase, createTestUser, createTestRoom } from '../helpers/test-prisma';
import {
  calculateVulnerability,
  getDealerForBoard,
  getNextPlayer,
} from '@/lib/game/gameEngine';

beforeAll(async () => { await testPrisma.$connect(); });
afterAll(async () => { await cleanDatabase(); await testPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

async function seed4PlayerRoom() {
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
  return { users, room };
}

describe('Game initialization', () => {
  it('creates a game record with BIDDING phase', async () => {
    const { users, room } = await seed4PlayerRoom();

    const game = await testPrisma.game.create({
      data: {
        gameRoomId: room.id,
        phase: 'BIDDING',
        boardNumber: 1,
        dealerId: users[0].id,
        currentPlayerId: users[0].id,
        gameState: {
          hands: { NORTH: [], SOUTH: [], EAST: [], WEST: [] },
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

    expect(game.id).toBeTruthy();
    expect(game.phase).toBe('BIDDING');
    expect(game.boardNumber).toBe(1);
    expect(game.dealerId).toBe(users[0].id);
  });

  it('links game players to game record', async () => {
    const { users, room } = await seed4PlayerRoom();

    const game = await testPrisma.game.create({
      data: {
        gameRoomId: room.id,
        phase: 'BIDDING',
        boardNumber: 1,
        dealerId: users[0].id,
        gameState: {},
      },
    });

    await testPrisma.gamePlayer.updateMany({
      where: { gameRoomId: room.id },
      data: { gameId: game.id },
    });

    const players = await testPrisma.gamePlayer.findMany({
      where: { gameId: game.id },
    });
    expect(players).toHaveLength(4);
  });

  it('updates room status to IN_PROGRESS when game starts', async () => {
    const { users, room } = await seed4PlayerRoom();

    await testPrisma.game.create({
      data: {
        gameRoomId: room.id,
        phase: 'BIDDING',
        boardNumber: 1,
        dealerId: users[0].id,
        gameState: {},
      },
    });

    await testPrisma.gameRoom.update({
      where: { id: room.id },
      data: { status: 'IN_PROGRESS' },
    });

    const updated = await testPrisma.gameRoom.findUnique({ where: { id: room.id } });
    expect(updated!.status).toBe('IN_PROGRESS');
  });
});

describe('GameMove recording', () => {
  it('records a bid move with sequence number', async () => {
    const { users, room } = await seed4PlayerRoom();
    const game = await testPrisma.game.create({
      data: {
        gameRoomId: room.id,
        phase: 'BIDDING',
        boardNumber: 1,
        dealerId: users[0].id,
        gameState: {},
      },
    });

    const move = await testPrisma.gameMove.create({
      data: {
        gameId: game.id,
        playerId: users[0].id,
        moveType: 'BID',
        moveData: { level: 1, suit: 'NT' },
        sequenceNumber: 1,
      },
    });

    expect(move.moveType).toBe('BID');
    expect(move.sequenceNumber).toBe(1);
  });

  it('enforces unique sequence number per game', async () => {
    const { users, room } = await seed4PlayerRoom();
    const game = await testPrisma.game.create({
      data: {
        gameRoomId: room.id,
        phase: 'BIDDING',
        boardNumber: 1,
        dealerId: users[0].id,
        gameState: {},
      },
    });

    await testPrisma.gameMove.create({
      data: {
        gameId: game.id,
        playerId: users[0].id,
        moveType: 'PASS',
        moveData: {},
        sequenceNumber: 1,
      },
    });
    await expect(
      testPrisma.gameMove.create({
        data: {
          gameId: game.id,
          playerId: users[1].id,
          moveType: 'PASS',
          moveData: {},
          sequenceNumber: 1,
        },
      })
    ).rejects.toThrow();
  });

  it('fetches moves in sequence order', async () => {
    const { users, room } = await seed4PlayerRoom();
    const game = await testPrisma.game.create({
      data: {
        gameRoomId: room.id,
        phase: 'BIDDING',
        boardNumber: 1,
        dealerId: users[0].id,
        gameState: {},
      },
    });

    await testPrisma.gameMove.createMany({
      data: [
        { gameId: game.id, playerId: users[0].id, moveType: 'BID', moveData: { level: 1, suit: 'NT' }, sequenceNumber: 1 },
        { gameId: game.id, playerId: users[1].id, moveType: 'PASS', moveData: {}, sequenceNumber: 2 },
        { gameId: game.id, playerId: users[2].id, moveType: 'PASS', moveData: {}, sequenceNumber: 3 },
      ],
    });

    const moves = await testPrisma.gameMove.findMany({
      where: { gameId: game.id },
      orderBy: { sequenceNumber: 'asc' },
    });
    expect(moves).toHaveLength(3);
    expect(moves[0].moveType).toBe('BID');
    expect(moves[1].moveType).toBe('PASS');
    expect(moves[2].sequenceNumber).toBe(3);
  });
});

describe('GameResult persistence', () => {
  it('saves a completed game result', async () => {
    const { users, room } = await seed4PlayerRoom();
    const game = await testPrisma.game.create({
      data: {
        gameRoomId: room.id,
        phase: 'COMPLETED',
        boardNumber: 1,
        dealerId: users[0].id,
        gameState: {},
      },
    });

    const result = await testPrisma.gameResult.create({
      data: {
        gameId: game.id,
        winningTeam: 'NS',
        contractTricks: 3,
        contractSuit: 'NT',
        tricksWon: 10,
        scoreNS: 400,
        scoreEW: 0,
        detailedScoring: { trickScore: 300, gameBonus: 300 },
      },
    });

    expect(result.winningTeam).toBe('NS');
    expect(result.scoreNS).toBe(400);
  });
});

describe('Game engine pure functions (via DB config)', () => {
  it('calculates vulnerability correctly for boards 1-4', () => {
    expect(calculateVulnerability(1)).toEqual({ NS: false, EW: false });
    expect(calculateVulnerability(2)).toEqual({ NS: true, EW: false });
    expect(calculateVulnerability(3)).toEqual({ NS: false, EW: true });
    expect(calculateVulnerability(4)).toEqual({ NS: true, EW: true });
    expect(calculateVulnerability(5)).toEqual({ NS: false, EW: false }); // wraps
  });

  it('assigns dealer by board number', () => {
    expect(getDealerForBoard(1)).toBe('NORTH');
    expect(getDealerForBoard(2)).toBe('EAST');
    expect(getDealerForBoard(3)).toBe('SOUTH');
    expect(getDealerForBoard(4)).toBe('WEST');
    expect(getDealerForBoard(5)).toBe('NORTH'); // wraps
  });

  it('returns next player in clockwise order', () => {
    expect(getNextPlayer('NORTH')).toBe('EAST');
    expect(getNextPlayer('EAST')).toBe('SOUTH');
    expect(getNextPlayer('SOUTH')).toBe('WEST');
    expect(getNextPlayer('WEST')).toBe('NORTH');
  });
});
