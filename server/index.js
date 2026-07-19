import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { registerSocketHandlers } from '../lib/socket/register-handlers.js';
import { isRedisConfigured, getPubClient, getSubClient, closeRedisClients } from '../lib/redis.ts';
import { InMemoryReconnectManager, RedisReconnectManager } from '../lib/socket/reconnect.ts';
import { isEnabled } from '../lib/features.ts';
import { shouldUseQueue } from '../lib/queue/gameQueue.ts';

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0'; // Listen on all network interfaces
const port = 3000;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(async () => {
    const server = createServer(async (req, res) => {
        try {
            const parsedUrl = parse(req.url, true);
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Error occurred handling', req.url, err);
            res.statusCode = 500;
            res.end('internal server error');
        }
    });

    const io = new SocketIOServer(server, {
        cors: {
            origin: '*', // Allow all origins for local network testing
            methods: ['GET', 'POST'],
        },
    });

    // Make Socket.IO instance globally accessible to Next.js API routes
    // This enables API routes (e.g. /api/rooms/[roomId]/start) to emit events
    global.io = io;

    // Feature 16: Redis adapter for horizontal scaling. When REDIS_URL is set,
    // wire the redis-adapter so io.to(room).emit(...) reaches sockets on all
    // replicas (cross-process broadcast + shared room membership). When unset
    // (local dev), fall back to the in-memory adapter — single-replica only.
    // There is deliberately NO feature flag here: Redis *capability* is the
    // gate (see lib/redis.ts). A flag that disagrees with REDIS_URL would fail
    // silently in two of four states.
    if (isRedisConfigured()) {
        try {
            const [pub, sub] = await Promise.all([getPubClient(), getSubClient()]);
            io.adapter(createAdapter(pub, sub));
            console.log('[Socket.io] Redis adapter enabled → multi-replica ready');
        } catch (err) {
            console.error('[Socket.io] Redis adapter failed, falling back to in-memory:', err.message);
        }
    } else {
        console.log('[Socket.io] No REDIS_URL → in-memory adapter (single-replica dev only)');
    }

    registerSocketHandlers(io);

    // Feature 18: start the Game Worker when the action queue is enabled.
    let gameWorker = null;
    if (shouldUseQueue()) {
        const { startGameWorker } = await import('./gameWorker.ts');
        gameWorker = startGameWorker();
    }

    // Feature 08/17: reconnection grace manager. Uses Redis TTL keys +
    // keyspace notifications when Redis is configured (cross-replica, survives
    // restarts), falls back to the in-memory Map otherwise (Feature 08).
    // Both paths are additionally gated by FEATURE_RECONNECT_GRACE — if the
    // flag is off, no disconnect events are emitted at all.
    let reconnectManager = null;
    if (isEnabled('reconnectGrace')) {
        reconnectManager = isRedisConfigured()
            ? new RedisReconnectManager(getPubClient)
            : new InMemoryReconnectManager();
        await reconnectManager.start(io);
        console.log(`[Server] Reconnect grace: ${isRedisConfigured() ? 'Redis TTL' : 'in-memory'} manager active`);
    } else {
        console.log('[Server] Reconnect grace: disabled (FEATURE_RECONNECT_GRACE=false)');
    }

    const GRACE_MS = 30_000;

    io.on('connection', (socket) => {
        let registeredUserId = null;
        let registeredRoomId = null;
        let registeredGameId = null;
        let registeredSeat = null;
        let registeredUsername = null;

        // Capture user info when they join a room/game
        socket.on('room:join', (data) => {
            if (data?.userId) {
                registeredUserId = data.userId;
                registeredRoomId = data.roomId;
            }
            // Feature 08/17: check for pending reconnect on room:join
            if (reconnectManager && data?.userId) {
                reconnectManager.onReconnect(io, data.userId, data.roomId);
            }
        });
        socket.on('room:seat_changed', (data) => {
            if (data?.userId) registeredUserId = data.userId;
            if (data?.seat) registeredSeat = data.seat;
            if (data?.username) registeredUsername = data.username;
        });
        socket.on('room:ready_toggle', (data) => {
            if (data?.userId) registeredUserId = data.userId;
            if (data?.username) registeredUsername = data.username;
        });
        socket.on('game:join', (data) => {
            if (data?.userId) registeredUserId = data.userId;
            if (data?.roomId) registeredRoomId = data.roomId;
            if (data?.gameId) registeredGameId = data.gameId;
        });

        socket.on('disconnect', () => {
            if (!registeredUserId || !registeredRoomId) return;
            console.log(`[Server] User ${registeredUsername || registeredUserId} disconnected; starting ${GRACE_MS / 1000}s grace`);
            if (reconnectManager) {
                reconnectManager.onDisconnect(io, {
                    userId: registeredUserId,
                    roomId: registeredRoomId,
                    gameId: registeredGameId,
                    seat: registeredSeat,
                    username: registeredUsername,
                    graceEndsAt: Date.now() + GRACE_MS,
                });
            }
        });
    });

    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
        console.log(`> Network access: http://192.168.243.113:${port}`);
        console.log(`> Socket.io server running`);
    });

    // Feature 16/17/18: graceful shutdown — close worker + Socket.io + Redis clients.
    process.on('SIGTERM', async () => {
        console.log('[Server] SIGTERM received, shutting down...');
        if (gameWorker) await gameWorker.close();
        if (reconnectManager) await reconnectManager.stop();
        io.close();
        await closeRedisClients();
        server.close(() => process.exit(0));
    });
});
