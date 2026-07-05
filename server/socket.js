/**
 * Feature 19 — Standalone Socket.io entry (socket service).
 *
 * Hosts only the Socket.io server: real-time room/game/voice signaling +
 * broadcast fan-out + the Redis-TTL reconnection grace (Feature 17). No
 * Next.js, no Game Worker. This is what the client `NEXT_PUBLIC_SOCKET_URL`
 * points at in the production split.
 *
 *   node server/socket.js   (or: npm run start:socket)
 */

import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { registerSocketHandlers } from '../lib/socket/register-handlers.js';
import { isRedisConfigured, getPubClient, getSubClient, closeRedisClients } from '../lib/redis.ts';
import { InMemoryReconnectManager, RedisReconnectManager } from '../lib/socket/reconnect.ts';
import { isEnabled } from '../lib/features.ts';

const port = Number(process.env.PORT_SOCKET ?? 3001);

const httpServer = createServer();
const io = new SocketIOServer(httpServer, {
    cors: { origin: process.env.SOCKET_CORS_ORIGIN ?? '*', methods: ['GET', 'POST'] },
});

// Make the io instance globally accessible so any co-located API routes could
// emit (in the split topology they're in a different process, but this keeps
// the contract consistent with the all-in-one dev entry).
global.io = io;

if (isRedisConfigured()) {
    try {
        const [pub, sub] = await Promise.all([getPubClient(), getSubClient()]);
        io.adapter(createAdapter(pub, sub));
        console.log('[socket] Redis adapter enabled → multi-replica ready');
    } catch (err) {
        console.error('[socket] Redis adapter failed, falling back to in-memory:', err.message);
    }
} else {
    console.log('[socket] No REDIS_URL → in-memory adapter (single-replica only)');
}

registerSocketHandlers(io);

// Feature 08/17: reconnection grace manager.
let reconnectManager = null;
if (isEnabled('reconnectGrace')) {
    reconnectManager = isRedisConfigured()
        ? new RedisReconnectManager(getPubClient)
        : new InMemoryReconnectManager();
    await reconnectManager.start(io);
    console.log(`[socket] Reconnect grace: ${isRedisConfigured() ? 'Redis TTL' : 'in-memory'} manager active`);
}

const GRACE_MS = 30_000;

io.on('connection', (socket) => {
    let registeredUserId = null;
    let registeredRoomId = null;
    let registeredGameId = null;
    let registeredSeat = null;
    let registeredUsername = null;

    socket.on('room:join', (data) => {
        if (data?.userId) {
            registeredUserId = data.userId;
            registeredRoomId = data.roomId;
        }
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
        console.log(`[socket] User ${registeredUsername || registeredUserId} disconnected; starting ${GRACE_MS / 1000}s grace`);
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

httpServer.listen(port, () => {
    console.log(`[socket] Socket.io listening on :${port}`);
});

process.on('SIGTERM', async () => {
    console.log('[socket] SIGTERM received, shutting down...');
    if (reconnectManager) await reconnectManager.stop();
    io.close();
    await closeRedisClients();
    httpServer.close(() => process.exit(0));
});
