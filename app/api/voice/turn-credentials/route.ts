import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { buildIceServers } from '@/lib/voice/turn';

/**
 * GET /api/voice/turn-credentials
 * Returns short-lived HMAC-signed TURN credentials for WebRTC voice.
 *
 * The static TURN_SECRET lives only in server env — it is never exposed to the
 * client. The client caches the `iceServers` + `expiresAt` and refreshes before
 * expiry (5min margin in useVoiceChat).
 *
 * When TURN is unconfigured (TURN_URL/TURN_SECRET unset), returns
 * `{ iceServers: [], configured: false }` — voice falls back to STUN/host
 * candidates (LAN/local only). This is the graceful dev fallback.
 *
 * No NEXT_PUBLIC_TURN_SECRET exists; a CI grep guard should fail if it ever
 * appears (public-repo secret leakage).
 */
export async function GET() {
    const session = await auth();
    if (!session?.user?.id) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { iceServers, expiresAt, configured } = buildIceServers({
        userId: session.user.id,
    });

    return NextResponse.json({ iceServers, expiresAt, configured });
}
