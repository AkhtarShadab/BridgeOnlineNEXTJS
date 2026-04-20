import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import bcrypt from 'bcryptjs';
import { testPrisma, cleanDatabase } from '../helpers/test-prisma';

beforeAll(async () => {
  await testPrisma.$connect();
});

afterAll(async () => {
  await cleanDatabase();
  await testPrisma.$disconnect();
});

beforeEach(async () => {
  await cleanDatabase();
});

describe('User creation', () => {
  it('creates a user with hashed password', async () => {
    const hash = await bcrypt.hash('password123', 12);
    const user = await testPrisma.user.create({
      data: { email: 'alice@test.com', username: 'alice', passwordHash: hash },
    });

    expect(user.id).toBeTruthy();
    expect(user.email).toBe('alice@test.com');
    expect(user.username).toBe('alice');
    expect(user.passwordHash).not.toBe('password123');
    expect(user.stats).toEqual({ gamesPlayed: 0, gamesWon: 0, totalScore: 0 });
    expect(user.createdAt).toBeInstanceOf(Date);
  });

  it('enforces unique email constraint', async () => {
    const hash = await bcrypt.hash('pass', 4);
    await testPrisma.user.create({
      data: { email: 'dup@test.com', username: 'user1', passwordHash: hash },
    });
    await expect(
      testPrisma.user.create({
        data: { email: 'dup@test.com', username: 'user2', passwordHash: hash },
      })
    ).rejects.toThrow();
  });

  it('enforces unique username constraint', async () => {
    const hash = await bcrypt.hash('pass', 4);
    await testPrisma.user.create({
      data: { email: 'a@test.com', username: 'samename', passwordHash: hash },
    });
    await expect(
      testPrisma.user.create({
        data: { email: 'b@test.com', username: 'samename', passwordHash: hash },
      })
    ).rejects.toThrow();
  });

  it('finds user by email', async () => {
    const hash = await bcrypt.hash('pass', 4);
    await testPrisma.user.create({
      data: { email: 'find@test.com', username: 'findme', passwordHash: hash },
    });

    const found = await testPrisma.user.findUnique({ where: { email: 'find@test.com' } });
    expect(found).not.toBeNull();
    expect(found!.username).toBe('findme');
  });

  it('validates bcrypt password comparison', async () => {
    const hash = await bcrypt.hash('secret123', 12);
    const user = await testPrisma.user.create({
      data: { email: 'bcrypt@test.com', username: 'bcryptuser', passwordHash: hash },
    });

    const valid = await bcrypt.compare('secret123', user.passwordHash);
    const invalid = await bcrypt.compare('wrongpassword', user.passwordHash);
    expect(valid).toBe(true);
    expect(invalid).toBe(false);
  });

  it('updates lastLogin', async () => {
    const hash = await bcrypt.hash('pass', 4);
    const user = await testPrisma.user.create({
      data: { email: 'login@test.com', username: 'loginuser', passwordHash: hash },
    });
    expect(user.lastLogin).toBeNull();

    const now = new Date();
    const updated = await testPrisma.user.update({
      where: { id: user.id },
      data: { lastLogin: now },
    });
    expect(updated.lastLogin).toBeInstanceOf(Date);
  });
});

describe('Friendship model', () => {
  it('creates a pending friend request', async () => {
    const hash = await bcrypt.hash('pass', 4);
    const [alice, bob] = await Promise.all([
      testPrisma.user.create({ data: { email: 'alice2@test.com', username: 'alice2', passwordHash: hash } }),
      testPrisma.user.create({ data: { email: 'bob2@test.com', username: 'bob2', passwordHash: hash } }),
    ]);

    const friendship = await testPrisma.friendship.create({
      data: { requesterId: alice.id, addresseeId: bob.id },
    });

    expect(friendship.status).toBe('PENDING');
    expect(friendship.requesterId).toBe(alice.id);
    expect(friendship.addresseeId).toBe(bob.id);
  });

  it('accepts a friend request', async () => {
    const hash = await bcrypt.hash('pass', 4);
    const [alice, bob] = await Promise.all([
      testPrisma.user.create({ data: { email: 'aaa@test.com', username: 'aaa', passwordHash: hash } }),
      testPrisma.user.create({ data: { email: 'bbb@test.com', username: 'bbb', passwordHash: hash } }),
    ]);

    const friendship = await testPrisma.friendship.create({
      data: { requesterId: alice.id, addresseeId: bob.id },
    });
    const accepted = await testPrisma.friendship.update({
      where: { id: friendship.id },
      data: { status: 'ACCEPTED' },
    });

    expect(accepted.status).toBe('ACCEPTED');
  });

  it('enforces unique requester-addressee pair', async () => {
    const hash = await bcrypt.hash('pass', 4);
    const [alice, bob] = await Promise.all([
      testPrisma.user.create({ data: { email: 'c1@test.com', username: 'c1', passwordHash: hash } }),
      testPrisma.user.create({ data: { email: 'c2@test.com', username: 'c2', passwordHash: hash } }),
    ]);

    await testPrisma.friendship.create({
      data: { requesterId: alice.id, addresseeId: bob.id },
    });
    await expect(
      testPrisma.friendship.create({
        data: { requesterId: alice.id, addresseeId: bob.id },
      })
    ).rejects.toThrow();
  });
});
