/**
 * Feature 20 — Dynamic TURN credential signing (server-side only).
 *
 * Generates short-lived HMAC-SHA1-signed credentials for the TURN server so the
 * static TURN_SECRET is never shipped to the client. Compatible with coturn's
 * `static-auth-secret` mode and Metered.ca's HMAC scheme.
 *
 * Canonical TURN credential format:
 *   username  = `${expiryUnixSeconds}:${userId}`
 *   credential = HMAC-SHA1(TURN_SECRET, username) → base64
 *
 * The route (app/api/voice/turn-credentials/route.ts) calls `buildIceServers`
 * per request and returns the result to the client. The client caches the
 * `iceServers` + `expiresAt` and refreshes before expiry (5min margin).
 *
 * When TURN is unconfigured (TURN_URL or TURN_SECRET unset), returns empty
 * `iceServers` — voice falls back to host/srflx candidates (LAN/local only).
 * This is the graceful dev fallback.
 */

import { createHmac } from 'crypto';

export interface IceServer {
    urls: string;
    username?: string;
    credential?: string;
}

export interface BuildIceServersResult {
    iceServers: IceServer[];
    expiresAt: number; // unix seconds; 0 when unconfigured
    configured: boolean;
}

/** Build the TURN username: `${expiry}:${userId}`. */
export function buildTurnUsername(userId: string, ttlSeconds: number, nowMs: number = Date.now()): string {
    const expiry = Math.floor(nowMs / 1000) + ttlSeconds;
    return `${expiry}:${userId}`;
}

/** Sign the username with the secret using HMAC-SHA1 → base64. Deterministic. */
export function signTurnCredential(secret: string, username: string): string {
    return createHmac('sha1', secret).update(username).digest('base64');
}

/**
 * Build the `iceServers` array for `RTCPeerConnection`. Returns empty when
 * TURN_URL or TURN_SECRET is unset (graceful fallback). The static STUN
 * servers are NOT included here — the client manager already has STUN; this
 * function only provides the dynamic TURN entry.
 */
export function buildIceServers(opts: {
    turnUrl?: string;
    secret?: string;
    userId: string;
    ttl?: number;
    nowMs?: number;
}): BuildIceServersResult {
    const turnUrl = opts.turnUrl ?? process.env.TURN_URL;
    const secret = opts.secret ?? process.env.TURN_SECRET;
    if (!turnUrl || !secret) {
        return { iceServers: [], expiresAt: 0, configured: false };
    }
    const ttl = opts.ttl ?? Number(process.env.TURN_TTL ?? 3600);
    const username = buildTurnUsername(opts.userId, ttl, opts.nowMs);
    const credential = signTurnCredential(secret, username);
    const expiresAt = Math.floor((opts.nowMs ?? Date.now()) / 1000) + ttl;
    return {
        iceServers: [{ urls: turnUrl, username, credential }],
        expiresAt,
        configured: true,
    };
}
