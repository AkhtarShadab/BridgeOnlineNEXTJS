import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createClient, type RedisClientType } from 'redis';

/**
 * Feature 16 — the Redis adapter lets two Socket.io servers on different ports
 * broadcast to each other's rooms. Without the adapter, a client connected to
 * server B would never see an event emitted via `io.to('room-X').emit(...)` on
 * server A. This is the cross-replica guarantee that unblocks k8s `replicas: 2+`.
 *
 * Requires a running Redis (docker compose -f docker-compose.test.yml up -d
 * test-redis). Skips gracefully when Redis is unreachable so `npm run
 * test:socket` doesn't fail in environments without Docker.
 */

const REDIS_URL = process.env.REDIS_URL_TEST ?? 'redis://localhost:6380';

let redisReachable = false;
let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;

beforeAll(async () => {
  // Fail fast (2s) when Redis isn't running so the hook doesn't time out.
  try {
    pubClient = createClient({
      url: REDIS_URL,
      socket: { connectTimeout: 2000 },
    }) as RedisClientType;
    await pubClient.connect();
    subClient = createClient({
      url: REDIS_URL,
      socket: { connectTimeout: 2000 },
    }) as RedisClientType;
    await subClient.connect();
    redisReachable = true;
  } catch {
    redisReachable = false;
    // Null out half-connected clients so afterAll doesn't hang on quit().
    await Promise.all([
      pubClient?.disconnect().catch(() => {}),
      subClient?.disconnect().catch(() => {}),
    ]);
    pubClient = null;
    subClient = null;
  }
});

afterAll(async () => {
  // disconnect() (not quit()) is safe on any state — connected or not.
  await Promise.all([
    pubClient?.disconnect().catch(() => {}),
    subClient?.disconnect().catch(() => {}),
  ]);
});

function createAdapterServer(): Promise<{ io: SocketIOServer; httpServer: HTTPServer; url: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const httpServer = createServer();
    const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });
    // Wire the Redis adapter — both servers share the same Redis pub/sub bus.
    io.adapter(createAdapter(pubClient!, subClient!));
    httpServer.listen(0, () => {
      const addr = httpServer.address() as { port: number };
      resolve({
        io,
        httpServer,
        url: `http://localhost:${addr.port}`,
        close: () =>
          new Promise<void>((res, rej) => {
            io.disconnectSockets(true);
            io.close();
            httpServer.close((err) => (err ? rej(err) : res()));
          }),
      });
    });
  });
}

function waitForEvent<T = unknown>(socket: ClientSocket, event: string, timeout = 3000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for "${event}" on ${socket.id ?? '(pending)'}`)),
      timeout,
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

describe('Feature 16 — Redis adapter cross-replica broadcast', () => {
  it('an event emitted on server A reaches a room member on server B', async () => {
    if (!redisReachable) {
      console.log('[redis-adapter] Redis not reachable — skipping (start with: docker compose -f docker-compose.test.yml up -d test-redis)');
      return;
    }

    const serverA = await createAdapterServer();
    const serverB = await createAdapterServer();
    try {
      // Alice connects to server A, joins room-X.
      const alice = ioc(serverA.url, { transports: ['websocket'] });
      await waitForEvent(alice, 'connect');
      alice.emit('room:join', { roomId: 'room-X' });

      // Bob connects to server B (different process!), joins the same room.
      const bob = ioc(serverB.url, { transports: ['websocket'] });
      await waitForEvent(bob, 'connect');
      bob.emit('room:join', { roomId: 'room-X' });

      // Give the adapter a moment to propagate room membership via Redis.
      await new Promise((r) => setTimeout(r, 100));

      // Server A emits to room-X. Without the adapter, Bob (on server B) would
      // never receive this. With the adapter, Redis pub/sub fans it out.
      const bobGot = waitForEvent<{ msg: string }>(bob, 'cross-replica-ping');
      serverA.io.to('room-X').emit('cross-replica-ping', { msg: 'hello from A' });

      const payload = await bobGot;
      expect(payload.msg).toBe('hello from A');

      alice.disconnect();
      bob.disconnect();
    } finally {
      await Promise.all([serverA.close(), serverB.close()]);
    }
  });

  it('does NOT leak events to rooms nobody on the other server joined', async () => {
    if (!redisReachable) return;

    const serverA = await createAdapterServer();
    const serverB = await createAdapterServer();
    try {
      const alice = ioc(serverA.url, { transports: ['websocket'] });
      await waitForEvent(alice, 'connect');
      alice.emit('room:join', { roomId: 'room-X' });

      const bob = ioc(serverB.url, { transports: ['websocket'] });
      await waitForEvent(bob, 'connect');
      bob.emit('room:join', { roomId: 'room-OTHER' }); // different room

      await new Promise((r) => setTimeout(r, 100));

      // Bob should NOT receive the room-X event.
      let received = false;
      bob.on('cross-replica-ping', () => { received = true; });
      serverA.io.to('room-X').emit('cross-replica-ping', { msg: 'scoped' });
      await new Promise((r) => setTimeout(r, 150));

      expect(received).toBe(false);

      alice.disconnect();
      bob.disconnect();
    } finally {
      await Promise.all([serverA.close(), serverB.close()]);
    }
  });
});
