# Module 06 — WebRTC & Voice Chat

> Session 001 | Prerequisite: Module 04

---

## Why Not Just Use WebSocket for Voice?

Voice is audio data — continuous streams of audio samples, 20ms of audio per packet, at ~50 packets/second per player. With 4 players:

```
4 players × 50 packets/sec × 20ms of audio = 200 packets/sec through server
```

If all voice routes through the server, the server becomes a bottleneck and every voice packet adds server-to-client latency (on top of microphone-to-speaker latency).

WebRTC solves this by connecting browsers directly to each other — the server is only involved in the initial handshake.

---

## How WebRTC Works: Three Phases

### Phase 1 — Signaling (server-assisted)

Before two browsers can connect, they need to exchange:
1. **SDP (Session Description Protocol)** — codec capabilities, media formats, network capabilities
2. **ICE Candidates** — list of network addresses (IP:port combinations) where this browser can be reached

Neither browser knows the other's IP address before this exchange. The Socket.io server is used as a relay to pass these messages.

```
Alice's browser                Server              Bob's browser
      │                          │                       │
      │──── voice:offer ─────────▶                       │
      │     { to: bob, sdp: "..." }──── voice:offer ────▶│
      │                          │     { from: alice }   │
      │◀──────────────────────── voice:answer ───────────│
      │     { from: bob, sdp: "..." }                    │
      │──── voice:ice ───────────▶──── voice:ice ───────▶│
      │ (multiple ice candidates │  (multiple ice        │
      │  sent asynchronously)    │   candidates)         │
      │                          │                       │
      │◀═══════════════ DIRECT WebRTC connection ════════│
      │            (no server involvement from here)      │
```

### Phase 2 — ICE Negotiation (direct)

ICE (Interactive Connectivity Establishment) tries multiple paths to connect two peers:
1. Direct connection (same network, ideal)
2. STUN — discovers the public IP/port (works when NAT allows)
3. TURN — relay through a third server (fallback when direct fails)

**DSA connection:** ICE is essentially a **graph traversal** problem. The "graph" is all possible network paths between two browsers, with edges weighted by latency and reliability. ICE tries paths in order of preference, falling back to relays when direct paths fail.

### Phase 3 — Media Flow (direct)

Once connected, audio data flows directly between browsers encrypted with DTLS-SRTP. The server sees none of it.

---

## Full Mesh Topology for 4 Players

With 4 players (N, S, E, W), every player needs a direct voice connection to every other player. This is a **complete graph** (also called a full mesh):

```
    N
   /|\
  / | \
 S  |  E   ← 6 edges = C(4,2) = 6 connections
  \ | /
   \|/
    W
```

Each player maintains **3 simultaneous WebRTC connections**:
- North maintains: N-S, N-E, N-W
- South maintains: N-S, S-E, S-W
- etc.

**DSA connection:** C(N, 2) = N(N-1)/2 connections for N players.
- 4 players: 6 connections
- 8 players: 28 connections
- 16 players: 120 connections

This grows as O(N²), which is why WebRTC full mesh doesn't scale past ~8-10 players. At larger scales, you'd use an SFU (Selective Forwarding Unit) — a media server that receives one stream from each participant and forwards it to all others, reducing per-client connections to 1 inbound + (N-1) outbound.

---

## The JavaScript API

```typescript
// lib/voice/WebRTCManager.ts (simplified)

class WebRTCManager {
    private connections = new Map<string, RTCPeerConnection>();

    async createOffer(peerId: string): Promise<void> {
        const pc = this.getOrCreateConnection(peerId);

        // Generate the SDP offer
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);

        // Send via Socket.io
        this.socket.emit('voice:offer', {
            to: peerId,
            sdp: offer
        });
    }

    async handleOffer(from: string, sdp: RTCSessionDescriptionInit): Promise<void> {
        const pc = this.getOrCreateConnection(from);

        await pc.setRemoteDescription(sdp);
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        this.socket.emit('voice:answer', {
            to: from,
            sdp: answer
        });
    }

    private getOrCreateConnection(peerId: string): RTCPeerConnection {
        if (!this.connections.has(peerId)) {
            const pc = new RTCPeerConnection({
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },  // free STUN
                    { urls: process.env.TURN_URL, ... }         // paid TURN fallback
                ]
            });

            // When ICE finds a candidate, send it to the peer
            pc.onicecandidate = ({ candidate }) => {
                if (candidate) {
                    this.socket.emit('voice:ice_candidate', {
                        to: peerId,
                        candidate
                    });
                }
            };

            this.connections.set(peerId, pc);
        }
        return this.connections.get(peerId)!;
    }
}
```

**DSA connection:** `connections` is a `Map<string, RTCPeerConnection>` — a hash map from peer ID to connection object. Lookup is O(1). When a new player joins, you add an entry; when they leave, you remove it and call `pc.close()`.

---

## STUN vs TURN — When Each Is Needed

```
Scenario 1: Same local network (e.g., two people on the same WiFi)
  → Direct IP:port connection
  → STUN not needed

Scenario 2: Different networks, both behind basic NAT
  → STUN discovers the public IP:port mapping
  → Direct connection works

Scenario 3: Symmetric NAT (corporate firewalls, mobile carriers)
  → STUN fails — the mapping changes per destination
  → TURN relay required (voice routes through TURN server)
```

TURN is expensive: you're paying for the bandwidth of every voice byte that routes through it. About 5-10% of connections need TURN.

The current implementation uses static TURN credentials in `.env`. Issue #18 (not yet implemented) proposes short-lived credentials — generated per session, expiring after a few hours. This is the standard security practice because:
- Static credentials can be extracted from the client-side code
- Short-lived credentials limit the blast radius if leaked

---

## Mute State and Speaking Indicators

Voice state (muted, speaking) is synced via Socket.io — not WebRTC. WebRTC handles the audio stream itself; Socket.io handles the metadata:

```typescript
// When local user mutes
micButton.onclick = () => {
    const track = localStream.getAudioTracks()[0];
    track.enabled = !track.enabled;  // mute/unmute the audio track

    socket.emit('voice:mute_state', {
        roomId,
        isMuted: !track.enabled
    });
};

// Server relays to room
socket.on('voice:mute_state', ({ roomId, isMuted }) => {
    socket.to(roomId).emit('voice:mute_state', {
        playerId: socket.id,
        isMuted
    });
});
```

This way every player's UI shows a mute indicator for each player — even though the audio itself is peer-to-peer.

---

## The React Hook: `useVoiceChat`

```typescript
// lib/hooks/useVoiceChat.ts (simplified)

export function useVoiceChat(roomId: string) {
    const [isMuted, setIsMuted] = useState(false);
    const [peers, setPeers] = useState<Map<string, PeerState>>(new Map());
    const managerRef = useRef<WebRTCManager | null>(null);

    useEffect(() => {
        // Initialize WebRTC manager when component mounts
        managerRef.current = new WebRTCManager(socket);
        return () => {
            // Cleanup: close all connections when component unmounts
            managerRef.current?.closeAll();
        };
    }, []);

    const toggleMute = () => {
        const newMuted = !isMuted;
        setIsMuted(newMuted);
        managerRef.current?.setLocalMute(newMuted);
        socket.emit('voice:mute_state', { roomId, isMuted: newMuted });
    };

    return { isMuted, peers, toggleMute };
}
```

**React concept:** `useRef` stores the `WebRTCManager` instance across re-renders without causing re-renders when it changes. `useState` stores UI state (muted, peer states) that the component should re-render on. The `useEffect` cleanup function closes WebRTC connections when the player navigates away.

---

## Summary

| Concept | What It Means |
|---|---|
| SDP | "Here's what audio formats I support and how to reach me" |
| ICE candidates | List of network addresses to try connecting through |
| STUN | Helps discover your public IP (free, Google provides servers) |
| TURN | Relay server when direct connection fails (costs bandwidth) |
| Full mesh | Every player connects to every other player directly |
| O(N²) connections | Why large voice rooms need an SFU instead |
| Socket.io signaling | Server just relays handshake — not in the media path |

---

**Next:** [Module 07 — Scalability Gaps & Fixes](./07-scalability.md)
