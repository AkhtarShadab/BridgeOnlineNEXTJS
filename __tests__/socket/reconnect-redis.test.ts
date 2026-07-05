import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer, type Server as HTTPServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import { createClient, type RedisClientType } from 'redis';
import { RedisReconnectManager } from '../../lib/socket/reconnect';

/**
 * Feature 17 (#16 gap) — reconnection grace via Redis TTL keys.
 * A player disconnects from server A; the grace key is set in Redis. The same
 * user reconnects to server B (a different replica) and the grace key is
 * cleared + player_reconnected is emitted to the room. Feature 08's in-memory
 * Map could not do this cross-replica.
 *
 * Requires: docker compose -f docker-compose.test.yml up -d test-redis.
 * Skips gracefully when Redis is unreachable.
 */

const REDIS_URL = process.env.REDIS_URL_TEST ?? 'redis://localhost:6380';
const GRACE_MS = 30_000;

let redisReachable = false;
let pubClient: RedisClientType | null = null;
let subClient: RedisClientType | null = null;
let probeClient: RedisClientType | null = null;

beforeAll(async () => {
    try {
        probeClient = createClient({ url: REDIS_URL, socket: { connectTimeout: 2000 } }) as RedisClientType;
        await probeClient.connect();
        redisReachable = true;
    } catch {
        redisReachable = false;
    }
});

afterAll(async () => {
    for (const c of [pubClient, subClient, probeClient]) {
        if (c && c.isOpen) await c.quit().catch(() => {});
    }
});

function waitForEvent<T = unknown>(socket: ClientSocket, event: string, timeout = 3000): Promise<T> {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error(`Timed out waiting for "${event}"`)),
            timeout,
        );
        socket.once(event, (data: T) => {
            clearTimeout(timer);
            resolve(data);
        });
    });
}

async function makeClient(): Promise<RedisClientType> {
    const c = createClient({ url: REDIS_URL, socket: { connectTimeout: 2000 } }) as RedisClientType;
    await c.connect();
    return c;
}

describe('Feature 17 — Redis reconnection grace (cross-replica)', () => {
    it('disconnect sets a Redis TTL key; reconnect on another server clears it', async () => {
        if (!redisReachable || !probeClient) {
            console.log('[reconnect-redis] Redis not reachable — skipping');
            return;
        }

        pubClient = await makeClient();
        subClient = await makeClient();

        // Two Socket.io servers, both with Redis adapter + the same RedisReconnectManager.
        const manager = new RedisReconnectManager(async () => probeClient!);

        const setupServer = async (): Promise<{
            io: SocketIOServer;
            httpServer: HTTPServer;
            url: string;
            close: () => Promise<void>;
        }> => {
            return new Promise(async (resolve) => {
                const httpServer = createServer();
                const io = new SocketIOServer(httpServer, { cors: { origin: '*' } });
                io.adapter(createAdapter(pubClient!, subClient!));
                io.on('connection', (socket) => {
                    socket.on('room:join', ({ roomId }: { roomId: string }) => {
                        socket.join(`room-${roomId}`);
                        // Check for reconnect
                        manager.onReconnect(io, (socket.handshake.query as any)?.userId ?? '');
                    });
                });
                await manager.start(io);
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
        };

        const serverA = await setupServer();
        const serverB = await setupServer();

        try {
            // Alice connects to server A, joins room-X with userId.
            const alice = ioc(serverA.url, {
                transports: ['websocket'],
                query: { userId: 'user-alice' },
            });
            await waitForEvent(alice, 'connect');
            alice.emit('room:join', { roomId: 'room-X', userId: 'user-alice' });
            await new Promise((r) => setTimeout(r, 80));

            // Bob connects to server B, joins room-X (so he can observe reconnect events).
            const bob = ioc(serverB.url, {
                transports: ['websocket'],
                query: { userId: 'user-bob' },
            });
            await waitForEvent(bob, 'connect');
            bob.emit('room:join', { roomId: 'room-X', userId: 'user-bob' });
            await new Promise((r) => setTimeout(r, 80));

            // Alice disconnects from server A → manager sets Redis TTL key.
            await manager.onDisconnect(serverA.io, {
                userId: 'user-alice',
                roomId: 'room-X',
                seat: 'NORTH',
                username: 'Alice',
                graceEndsAt: Date.now() + GRACE_MS,
            });

            // Verify the Redis key exists.
            const key = 'game:disconnected:user-alice';
            const raw = await probeClient.get(key);
            expect(raw).toBeTruthy();
            expect(JSON.parse(raw!).userId).toBe('user-alice');

            // Bob should have received player_disconnected.
            const disconnectPayload = await waitForEvent<{ userId: string }>(bob, 'game:player_disconnected');
            expect(disconnectPayload.userId).toBe('user-alice');

            // Alice reconnects to server B (different replica!). Her room:join
            // triggers manager.onReconnect on server B, which DELs the key and
            // emits player_reconnected to the room.
            const alice2 = ioc(serverB.url, {
                transports: ['websocket'],
                query: { userId: 'user-alice' },
            });
            await waitForEvent(alice2, 'connect');
            alice2.emit('room:join', { roomId: 'room-X', userId: 'user-alice' });

            // Bob receives player_reconnected (via server B's manager).
            const reconnectPayload = await waitForEvent<{ userId: string }>(bob, 'game:player_reconnected');
            expect(reconnectPayload.userId).toBe('user-alice');

            // Redis key is gone (DEL on reconnect).
            expect(await probeClient.get(key)).toBeNull();

            alice.disconnect();
            alice2.disconnect();
            bob.disconnect();
        } finally {
            await manager.stop();
            await Promise.all([serverA.close(), serverB.close()]);
        }
    });
});
