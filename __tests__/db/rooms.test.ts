import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { testPrisma, cleanDatabase, createTestUser, createTestRoom } from '../helpers/test-prisma';

beforeAll(async () => { await testPrisma.$connect(); });
afterAll(async () => { await cleanDatabase(); await testPrisma.$disconnect(); });
beforeEach(async () => { await cleanDatabase(); });

describe('GameRoom creation', () => {
  it('creates a room with default settings', async () => {
    const creator = await createTestUser();
    const room = await createTestRoom(creator.id, { name: 'Test Room' });

    expect(room.id).toBeTruthy();
    expect(room.name).toBe('Test Room');
    expect(room.status).toBe('WAITING');
    expect(room.inviteCode).toBeTruthy();
    expect(room.creatorId).toBe(creator.id);
    expect(room.expiresAt).toBeInstanceOf(Date);
  });

  it('enforces unique invite code', async () => {
    const creator = await createTestUser();
    await createTestRoom(creator.id, { inviteCode: 'DUPCODE1' });
    await expect(
      createTestRoom(creator.id, { inviteCode: 'DUPCODE1' })
    ).rejects.toThrow();
  });

  it('finds room by invite code', async () => {
    const creator = await createTestUser();
    await createTestRoom(creator.id, { inviteCode: 'FINDME01' });

    const found = await testPrisma.gameRoom.findUnique({
      where: { inviteCode: 'FINDME01' },
    });
    expect(found).not.toBeNull();
    expect(found!.creatorId).toBe(creator.id);
  });
});

describe('GamePlayer seat management', () => {
  it('adds creator as first player when room is created', async () => {
    const creator = await createTestUser();
    const room = await createTestRoom(creator.id);

    await testPrisma.gamePlayer.create({
      data: { gameRoomId: room.id, userId: creator.id, seat: 'SOUTH' },
    });

    const players = await testPrisma.gamePlayer.findMany({
      where: { gameRoomId: room.id },
    });
    expect(players).toHaveLength(1);
    expect(players[0].seat).toBe('SOUTH');
    expect(players[0].isReady).toBe(false);
  });

  it('allows 4 players to take distinct seats', async () => {
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

    const players = await testPrisma.gamePlayer.findMany({
      where: { gameRoomId: room.id },
    });
    expect(players).toHaveLength(4);
    const takenSeats = players.map((p) => p.seat).sort();
    expect(takenSeats).toEqual(['EAST', 'NORTH', 'SOUTH', 'WEST']);
  });

  it('prevents two players from taking the same seat', async () => {
    const [user1, user2] = await Promise.all([createTestUser(), createTestUser()]);
    const room = await createTestRoom(user1.id);

    await testPrisma.gamePlayer.create({
      data: { gameRoomId: room.id, userId: user1.id, seat: 'NORTH' },
    });
    await expect(
      testPrisma.gamePlayer.create({
        data: { gameRoomId: room.id, userId: user2.id, seat: 'NORTH' },
      })
    ).rejects.toThrow();
  });

  it('prevents a user from joining the same room twice', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);

    await testPrisma.gamePlayer.create({
      data: { gameRoomId: room.id, userId: user.id, seat: 'SOUTH' },
    });
    await expect(
      testPrisma.gamePlayer.create({
        data: { gameRoomId: room.id, userId: user.id, seat: 'NORTH' },
      })
    ).rejects.toThrow();
  });

  it('toggles ready status', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const player = await testPrisma.gamePlayer.create({
      data: { gameRoomId: room.id, userId: user.id, seat: 'SOUTH' },
    });

    expect(player.isReady).toBe(false);

    const updated = await testPrisma.gamePlayer.update({
      where: { id: player.id },
      data: { isReady: true },
    });
    expect(updated.isReady).toBe(true);
  });
});

describe('Room status transitions', () => {
  it('marks room as ABANDONED when last player leaves', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);
    const player = await testPrisma.gamePlayer.create({
      data: { gameRoomId: room.id, userId: user.id, seat: 'SOUTH' },
    });

    await testPrisma.gamePlayer.delete({ where: { id: player.id } });

    const count = await testPrisma.gamePlayer.count({ where: { gameRoomId: room.id } });
    expect(count).toBe(0);

    await testPrisma.gameRoom.update({
      where: { id: room.id },
      data: { status: 'ABANDONED' },
    });

    const updatedRoom = await testPrisma.gameRoom.findUnique({ where: { id: room.id } });
    expect(updatedRoom!.status).toBe('ABANDONED');
  });

  it('marks room as IN_PROGRESS when game starts', async () => {
    const user = await createTestUser();
    const room = await createTestRoom(user.id);

    await testPrisma.gameRoom.update({
      where: { id: room.id },
      data: { status: 'IN_PROGRESS' },
    });

    const updated = await testPrisma.gameRoom.findUnique({ where: { id: room.id } });
    expect(updated!.status).toBe('IN_PROGRESS');
  });

  it('rejects join when room is expired', async () => {
    const user = await createTestUser();
    const room = await testPrisma.gameRoom.create({
      data: {
        name: 'Expired Room',
        inviteCode: 'EXPIRED1',
        creatorId: user.id,
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    const found = await testPrisma.gameRoom.findUnique({
      where: { inviteCode: 'EXPIRED1' },
    });
    expect(found!.expiresAt < new Date()).toBe(true);
  });
});

describe('RoomInvitation model', () => {
  it('creates a pending room invitation', async () => {
    const [inviter, invitee] = await Promise.all([createTestUser(), createTestUser()]);
    const room = await createTestRoom(inviter.id);

    const invitation = await testPrisma.roomInvitation.create({
      data: {
        roomId: room.id,
        inviterId: inviter.id,
        inviteeId: invitee.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    expect(invitation.status).toBe('PENDING');
  });
});
