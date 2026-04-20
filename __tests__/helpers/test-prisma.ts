import { PrismaClient } from '@prisma/client';

export const testPrisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL ?? 'postgresql://test:test@localhost:5433/bridgeonline_test?schema=public',
    },
  },
  log: [],
});

export async function cleanDatabase() {
  await testPrisma.$transaction([
    testPrisma.gameResult.deleteMany(),
    testPrisma.gameMove.deleteMany(),
    testPrisma.roomInvitation.deleteMany(),
  ]);
  await testPrisma.$transaction([
    testPrisma.gamePlayer.deleteMany(),
    testPrisma.game.deleteMany(),
  ]);
  await testPrisma.$transaction([
    testPrisma.gameRoom.deleteMany(),
    testPrisma.friendship.deleteMany(),
  ]);
  await testPrisma.user.deleteMany();
}

export async function createTestUser(overrides: {
  email?: string;
  username?: string;
  passwordHash?: string;
} = {}) {
  return testPrisma.user.create({
    data: {
      email: overrides.email ?? `user-${Date.now()}-${Math.random().toString(36).slice(2)}@test.com`,
      username: overrides.username ?? `user_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      passwordHash: overrides.passwordHash ?? '$2b$12$test.hash.placeholder.value.here',
    },
  });
}

export async function createTestRoom(creatorId: string, overrides: {
  name?: string;
  inviteCode?: string;
} = {}) {
  return testPrisma.gameRoom.create({
    data: {
      name: overrides.name ?? `Test Room ${Date.now()}`,
      inviteCode: overrides.inviteCode ?? `TST${Date.now().toString(36).toUpperCase().slice(-5)}`,
      creatorId,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    },
  });
}
