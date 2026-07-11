/**
 * Feature 17 (#16 gap) — Reconnection grace manager.
 *
 * Replaces Feature 08's in-memory `disconnectTimers` Map with a Redis-backed
 * TTL key when Redis is configured, so grace state survives restarts and works
 * across replicas. Falls back to the in-memory Map when Redis is not available
 * (dev mode), preserving Feature 08's behavior.
 *
 * Redis path:
 *   - On disconnect: SET game:{gameId}:disconnected:{userId} <info-json> EX 30
 *   - On reconnect:  DEL the key, emit player_reconnected
 *   - On timeout:    keyspace notification on key expiry → emit disconnect_timeout
 *
 * In-memory path (Feature 08, unchanged):
 *   - On disconnect: setTimeout(30s) → emit disconnect_timeout
 *   - On reconnect:  clearTimeout, emit player_reconnected
 *
 * Keyspace notifications are at-most-once: if the subscriber is down when the
 * expiry fires, the timeout event is lost. Mitigation: the client already
 * receives `graceEndsAt` in the `player_disconnected` payload and can check
 * `Date.now() > graceEndsAt` as a fallback (Feature 08).
 */

import type { Server as SocketIOServer } from 'socket.io';

export interface DisconnectInfo {
    userId: string;
    roomId: string;
    gameId?: string | null;
    seat?: string | null;
    username?: string | null;
    graceEndsAt: number;
}

export interface ReconnectManager {
    /** Called when a socket disconnects. Starts the grace timer. */
    onDisconnect(io: SocketIOServer, info: DisconnectInfo): void;
    /** Called when a socket joins a room. Clears the grace timer if pending. Returns true if a reconnect was matched. */
    onReconnect(io: SocketIOServer, userId: string, roomId?: string): boolean | Promise<boolean>;
    /** Start listening for timeout events (Redis keyspace notifications). */
    start(io: SocketIOServer): void | Promise<void>;
    /** Stop and clean up. */
    stop(): void | Promise<void>;
}

const GRACE_MS = 30_000;

/* ────────────────────────────────────────────────────────────────────── */
/*  In-memory manager (Feature 08 fallback, unchanged)                   */
/* ────────────────────────────────────────────────────────────────────── */

export class InMemoryReconnectManager implements ReconnectManager {
    private timers = new Map<string, DisconnectInfo & { timeout: ReturnType<typeof setTimeout> }>();

    onDisconnect(io: SocketIOServer, info: DisconnectInfo): void {
        const { userId, roomId } = info;
        // Clear any existing timer for this user
        const existing = this.timers.get(userId);
        if (existing) clearTimeout(existing.timeout);

        const timeout = setTimeout(() => {
            this.timers.delete(userId);
            io.to(`room-${roomId}`).emit('game:disconnect_timeout', {
                userId,
                seat: info.seat,
            });
        }, GRACE_MS);

        this.timers.set(userId, { ...info, timeout });

        io.to(`room-${roomId}`).emit('game:player_disconnected', {
            userId,
            seat: info.seat,
            username: info.username,
            graceEndsAt: info.graceEndsAt,
        });
    }

    async onReconnect(io: SocketIOServer, userId: string, _roomId?: string): Promise<boolean> {
        const pending = this.timers.get(userId);
        if (!pending) return false;
        clearTimeout(pending.timeout);
        this.timers.delete(userId);
        io.to(`room-${pending.roomId}`).emit('game:player_reconnected', {
            userId,
            seat: pending.seat,
            username: pending.username,
        });
        return true;
    }

    start(_io: SocketIOServer): void {
        // No setup needed — timers are set on disconnect.
    }

    stop(): void {
        for (const { timeout } of this.timers.values()) clearTimeout(timeout);
        this.timers.clear();
    }
}

/* ────────────────────────────────────────────────────────────────────── */
/*  Redis manager — TTL keys + keyspace notifications                    */
/* ────────────────────────────────────────────────────────────────────── */

export class RedisReconnectManager implements ReconnectManager {
    private subscriber: any = null;
    private io: SocketIOServer | null = null;
    // NOTE: an explicit field + assignment, NOT a `private` constructor
    // parameter property. The custom server loads this file through Node's
    // native strip-only TypeScript loader, which rejects parameter properties
    // (ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX) and would crash server startup.
    private getRedisClient: () => Promise<any>;

    constructor(getRedisClient: () => Promise<any>) {
        this.getRedisClient = getRedisClient;
    }

    private key(userId: string): string {
        return `game:disconnected:${userId}`;
    }

    async onDisconnect(io: SocketIOServer, info: DisconnectInfo): Promise<void> {
        const client = await this.getRedisClient();
        const { userId, roomId } = info;
        await client.set(this.key(userId), JSON.stringify(info), { EX: 30 });
        io.to(`room-${roomId}`).emit('game:player_disconnected', {
            userId,
            seat: info.seat,
            username: info.username,
            graceEndsAt: info.graceEndsAt,
        });
    }

    async onReconnect(io: SocketIOServer, userId: string, _roomId?: string): Promise<boolean> {
        const client = await this.getRedisClient();
        const raw = await client.get(this.key(userId));
        if (!raw) return false;
        const info = JSON.parse(raw) as DisconnectInfo;
        await client.del(this.key(userId));
        io.to(`room-${info.roomId}`).emit('game:player_reconnected', {
            userId,
            seat: info.seat,
            username: info.username,
        });
        return true;
    }

    async start(io: SocketIOServer): Promise<void> {
        this.io = io;
        const client = await this.getRedisClient();
        // Enable keyspace notifications for expired events. redis@4 uses
        // sendCommand for CONFIG (config is a reserved word in JS).
        await client.sendCommand(['CONFIG', 'SET', 'notify-keyspace-events', 'Ex']);
        // Subscribe to the expired-event channel for DB 0. Use a duplicate
        // client so subscribe traffic doesn't block the main client.
        this.subscriber = client.duplicate();
        await this.subscriber.connect();
        await this.subscriber.subscribe('__keyevent@0__:expired', (key: string) => {
            this.handleKeyExpiry(key);
        });
    }

    private handleKeyExpiry(key: string): void {
        // Key format: game:disconnected:{userId}
        if (!key.startsWith('game:disconnected:') || !this.io) return;
        const userId = key.slice('game:disconnected:'.length);
        // The key value is gone (expired), so we can't read the roomId/seat.
        // We broadcast to all rooms — the clients that have this user will
        // recognize the userId. This is a known trade-off of keyspace
        // notifications (the value is deleted before the notification fires).
        // In practice the room is small (4 players) so the fan-out is cheap.
        this.io.emit('game:disconnect_timeout', { userId });
    }

    async stop(): Promise<void> {
        if (this.subscriber) {
            await this.subscriber.unsubscribe('__keyevent@0__:expired').catch(() => {});
            await this.subscriber.quit().catch(() => {});
            this.subscriber = null;
        }
    }
}
