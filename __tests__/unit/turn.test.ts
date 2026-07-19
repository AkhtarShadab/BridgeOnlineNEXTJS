import { describe, it, expect } from 'vitest';
import { buildTurnUsername, signTurnCredential, buildIceServers } from '@/lib/voice/turn';

describe('Feature 20 — lib/voice/turn.ts', () => {
    const SECRET = 'super-secret-turn-key';
    const USER = 'user-abc';

    describe('buildTurnUsername', () => {
        it('formats as ${expiry}:${userId} with expiry = now/1000 + ttl', () => {
            const now = 1_700_000_000_000; // ms
            const username = buildTurnUsername(USER, 3600, now);
            const [expiryStr, userId] = username.split(':');
            expect(Number(expiryStr)).toBe(1_700_000_000 + 3600);
            expect(userId).toBe(USER);
        });
    });

    describe('signTurnCredential', () => {
        it('is deterministic — same (secret, username) → same base64', () => {
            const u = buildTurnUsername(USER, 3600, 1_700_000_000_000);
            const a = signTurnCredential(SECRET, u);
            const b = signTurnCredential(SECRET, u);
            expect(a).toBe(b);
        });

        it('different secrets → different credentials', () => {
            const u = buildTurnUsername(USER, 3600, 1_700_000_000_000);
            expect(signTurnCredential('secret-a', u)).not.toBe(signTurnCredential('secret-b', u));
        });

        it('produces base64 output', () => {
            const u = buildTurnUsername(USER, 3600, 1_700_000_000_000);
            const cred = signTurnCredential(SECRET, u);
            // base64 charset
            expect(cred).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
        });
    });

    describe('buildIceServers', () => {
        it('returns empty iceServers when TURN_URL and SECRET are unset', () => {
            const result = buildIceServers({ userId: USER, turnUrl: undefined, secret: undefined });
            expect(result.iceServers).toEqual([]);
            expect(result.configured).toBe(false);
            expect(result.expiresAt).toBe(0);
        });

        it('returns empty when only TURN_URL is set (secret missing)', () => {
            const result = buildIceServers({ userId: USER, turnUrl: 'turn:example.com:3478', secret: undefined });
            expect(result.iceServers).toEqual([]);
            expect(result.configured).toBe(false);
        });

        it('returns empty when only SECRET is set (url missing)', () => {
            const result = buildIceServers({ userId: USER, turnUrl: undefined, secret: SECRET });
            expect(result.iceServers).toEqual([]);
            expect(result.configured).toBe(false);
        });

        it('returns a signed iceServers entry when both are set', () => {
            const now = 1_700_000_000_000;
            const result = buildIceServers({
                userId: USER,
                turnUrl: 'turn:example.com:3478',
                secret: SECRET,
                ttl: 3600,
                nowMs: now,
            });
            expect(result.configured).toBe(true);
            expect(result.iceServers).toHaveLength(1);
            const server = result.iceServers[0];
            expect(server.urls).toBe('turn:example.com:3478');
            expect(server.username).toBe(buildTurnUsername(USER, 3600, now));
            expect(server.credential).toBe(signTurnCredential(SECRET, server.username!));
            expect(result.expiresAt).toBe(Math.floor(now / 1000) + 3600);
        });

        it('does NOT include the secret in the output object', () => {
            const result = buildIceServers({
                userId: USER,
                turnUrl: 'turn:example.com:3478',
                secret: SECRET,
            });
            const json = JSON.stringify(result);
            expect(json).not.toContain(SECRET);
        });

        it('username contains the userId and a future expiry', () => {
            const before = Math.floor(Date.now() / 1000);
            const result = buildIceServers({ userId: USER, turnUrl: 'turn:x', secret: SECRET, ttl: 3600 });
            const username = result.iceServers[0].username!;
            const [expiryStr, userId] = username.split(':');
            expect(userId).toBe(USER);
            expect(Number(expiryStr)).toBeGreaterThan(before + 3500);
        });
    });
});
