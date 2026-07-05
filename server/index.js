import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { registerSocketHandlers } from '../lib/socket/register-handlers.js';
import { isRedisConfigured, getPubClient, getSubClient, closeRedisClients } from '../lib/redis.ts';

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

    // Feature 08: reconnection / disconnect handling
    // Track per-user disconnect timeouts so we can cancel them on reconnect.
    const disconnectTimers = new Map(); // userId -> { timeout, roomId, gameId, seat, username, graceEndsAt }
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

            const graceEndsAt = Date.now() + GRACE_MS;
            const userInfo = {
                timeout: setTimeout(() => {
                    console.log(`[Server] Grace expired for user ${registeredUserId}`);
                    disconnectTimers.delete(registeredUserId);
                    io.to(`room-${registeredRoomId}`).emit('game:disconnect_timeout', {
                        userId: registeredUserId,
                        seat: registeredSeat,
                    });
                }, GRACE_MS),
                roomId: registeredRoomId,
                gameId: registeredGameId,
                seat: registeredSeat,
                username: registeredUsername,
                graceEndsAt,
            };
            disconnectTimers.set(registeredUserId, userInfo);

            io.to(`room-${registeredRoomId}`).emit('game:player_disconnected', {
                userId: registeredUserId,
                seat: registeredSeat,
                username: registeredUsername,
                graceEndsAt,
            });
        });
    });

    // Listen for socket rejoins to clear disconnect timers
    io.on('connection', (socket) => {
        socket.on('room:join', (data) => {
            if (!data?.userId) return;
            const pending = disconnectTimers.get(data.userId);
            if (pending) {
                clearTimeout(pending.timeout);
                disconnectTimers.delete(data.userId);
                io.to(`room-${pending.roomId}`).emit('game:player_reconnected', {
                    userId: data.userId,
                    seat: pending.seat,
                    username: pending.username,
                });
                console.log(`[Server] User ${data.userId} reconnected within grace window`);
            }
        });
    });

    server.listen(port, () => {
        console.log(`> Ready on http://localhost:${port}`);
        console.log(`> Network access: http://192.168.243.113:${port}`);
        console.log(`> Socket.io server running`);
    });

    // Feature 16: graceful shutdown — close Socket.io + Redis clients so the
    // process exits cleanly on SIGTERM (k8s pod rotation, docker stop).
    process.on('SIGTERM', async () => {
        console.log('[Server] SIGTERM received, shutting down...');
        io.close();
        await closeRedisClients();
        server.close(() => process.exit(0));
    });
});
