import { Socket } from "socket.io-client";

export class VoiceManager {
    private socket: Socket;
    private localStream: MediaStream | null = null;
    private connections = new Map<string, RTCPeerConnection>();
    private roomId: string | null = null;
    private myUserId: string;

    private audioContext: AudioContext | null = null;
    private checkAudioLevelRef: number | null = null;
    private isCurrentlySpeaking = false;

    public onStreamAdded?: (userId: string, stream: MediaStream) => void;
    public onStreamRemoved?: (userId: string) => void;
    public onUserMuted?: (userId: string, isMuted: boolean) => void;
    public onUserSpeaking?: (userId: string, isSpeaking: boolean) => void;
    public onError?: (error: string) => void;

    private iceServers = [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
    ];

    constructor(socket: Socket, userId: string) {
        this.socket = socket;
        this.myUserId = userId;

        // Feature 20: dynamic TURN credentials fetched from
        // /api/voice/turn-credentials (HMAC-signed, short-lived). The static
        // NEXT_PUBLIC_TURN_* env path is kept as a fallback for backwards
        // compatibility but is deprecated — the dynamic route is preferred
        // because it never ships TURN_SECRET to the client.
        this.refreshTurnCredentials().catch((e) => {
            console.warn('[VoiceManager] TURN credential fetch failed:', e);
        });

        // Legacy static TURN from env (deprecated, kept for compat)
        if (process.env.NEXT_PUBLIC_TURN_URL) {
            this.iceServers.push({
                urls: process.env.NEXT_PUBLIC_TURN_URL,
                username: process.env.NEXT_PUBLIC_TURN_USERNAME || "",
                credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || ""
            } as any);
        }

        this.setupSocketListeners();
    }

    /**
     * Feature 20: fetch short-lived TURN credentials from the server and merge
     * them into `iceServers`. Idempotent — safe to call repeatedly to refresh
     * before expiry. The static STUN entries are kept; only the dynamic TURN
     * entry is replaced.
     */
    public async refreshTurnCredentials(): Promise<void> {
        try {
            const res = await fetch('/api/voice/turn-credentials');
            if (!res.ok) return;
            const data = await res.json();
            if (!data.iceServers || data.iceServers.length === 0) return;
            // Replace any prior dynamic TURN entry; keep STUN.
            this.iceServers = [
                { urls: "stun:stun.l.google.com:19302" },
                { urls: "stun:stun1.l.google.com:19302" },
                ...data.iceServers,
            ];
        } catch {
            // Network error or route unavailable — keep current iceServers.
        }
    }

    private setupSocketListeners() {
        // We receive offer
        this.socket.on("voice:offer", async (data) => {
            if (data.targetUserId !== this.myUserId) return;
            await this.handleOffer(data.fromUserId, data.sdp);
        });

        // We receive answer
        this.socket.on("voice:answer", async (data) => {
            if (data.targetUserId !== this.myUserId) return;
            await this.handleAnswer(data.fromUserId, data.sdp);
        });

        // We receive ICE candidate
        this.socket.on("voice:ice_candidate", async (data) => {
            if (data.targetUserId !== this.myUserId) return;
            await this.handleIceCandidate(data.fromUserId, data.candidate);
        });

        // Peer muted/unmuted
        this.socket.on("voice:user_muted", (data) => {
            if (data.userId !== this.myUserId && this.onUserMuted) {
                this.onUserMuted(data.userId, data.muted);
            }
        });

        // Peer speaking status changed
        this.socket.on("voice:speaking", (data) => {
            if (data.userId !== this.myUserId && this.onUserSpeaking) {
                this.onUserSpeaking(data.userId, data.isSpeaking);
            }
        });

        // Peer left explicitly
        this.socket.on("voice:user_left", (data) => {
            if (data.userId !== this.myUserId) {
                this.removePeer(data.userId);
            }
        });

        // To handle socket disconnections appropriately
        this.socket.on("room:player_left", (data) => {
            // Also clean up if a player disconnects from the room completely
            if (data.userId && data.userId !== this.myUserId) {
                this.removePeer(data.userId);
            }
        });
    }

    public async initializeAndJoin(roomId: string, peersInRoom: string[]): Promise<boolean> {
        if (this.localStream) return true; // Guard against double initialization
        this.roomId = roomId;

        if (process.env.NEXT_PUBLIC_DISABLE_VOICE === 'true') {
            console.log("Voice system disabled via NEXT_PUBLIC_DISABLE_VOICE");
            return false;
        }

        // Browsers only expose mediaDevices in a secure context (HTTPS or localhost).
        // Plain HTTP on a public IP (e.g. http://15.x.x.x) throws if we call getUserMedia.
        const mediaDevices = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
        if (!mediaDevices?.getUserMedia) {
            const msg =
                typeof window !== "undefined" && !window.isSecureContext
                    ? "Voice needs HTTPS (or localhost). Open the site over https:// or disable voice until TLS is set up."
                    : "Microphone API unavailable in this browser.";
            console.warn("[Voice]", msg);
            if (this.onError) this.onError(msg);
            return false;
        }

        try {
            this.localStream = await mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                },
                video: false
            });
        } catch (err) {
            console.error("Microphone access denied:", err);
            if (this.onError) this.onError("Microphone access denied. Please check your permissions.");
            return false;
        }

        // Send local stream to UI immediately
        if (this.onStreamAdded && this.localStream) {
            this.onStreamAdded(this.myUserId, this.localStream);
        }

        this.setupLocalAudioDetection();

        // Iterate through existing peers and initialize connections
        for (const peerId of peersInRoom) {
            if (peerId !== this.myUserId) {
                await this.initiateCall(peerId);
            }
        }
        return true;
    }

    private setupLocalAudioDetection() {
        if (!this.localStream) return;
        try {
            const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
            this.audioContext = audioCtx;

            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyser.minDecibels = -70;

            const source = audioCtx.createMediaStreamSource(this.localStream);
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);

            const checkAudioLevel = () => {
                if (!this.localStream) return;
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) {
                    sum += dataArray[i];
                }
                const average = sum / dataArray.length;
                const isSpeaking = average > 10;

                if (isSpeaking !== this.isCurrentlySpeaking) {
                    this.isCurrentlySpeaking = isSpeaking;
                    if (this.roomId) {
                        this.socket.emit("voice:speaking", {
                            roomId: this.roomId,
                            userId: this.myUserId,
                            isSpeaking
                        });
                    }
                    if (this.onUserSpeaking) {
                        this.onUserSpeaking(this.myUserId, isSpeaking);
                    }
                }
                this.checkAudioLevelRef = requestAnimationFrame(checkAudioLevel);
            };

            checkAudioLevel();
        } catch (e) {
            console.error("Failed to setup local audio detection", e);
        }
    }

    private createPeerConnection(targetUserId: string): RTCPeerConnection {
        if (this.connections.has(targetUserId)) {
            // clean up existing connection if it exists
            this.removePeer(targetUserId);
        }

        const pc = new RTCPeerConnection({ iceServers: this.iceServers });
        this.connections.set(targetUserId, pc);

        pc.onicecandidate = (event) => {
            if (event.candidate && this.roomId) {
                this.socket.emit("voice:ice_candidate", {
                    targetUserId,
                    fromUserId: this.myUserId,
                    roomId: this.roomId,
                    candidate: event.candidate,
                });
            }
        };

        pc.ontrack = (event) => {
            if (this.onStreamAdded) {
                this.onStreamAdded(targetUserId, event.streams[0]);
            }
        };

        pc.onconnectionstatechange = () => {
            console.log(`Connection state with ${targetUserId}: ${pc.connectionState}`);
            if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this.removePeer(targetUserId);
            }
        };

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => {
                pc.addTrack(track, this.localStream!);
            });
        }

        return pc;
    }

    public async initiateCall(targetUserId: string) {
        if (!this.roomId) return;
        const pc = this.createPeerConnection(targetUserId);

        try {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);

            this.socket.emit("voice:offer", {
                targetUserId,
                fromUserId: this.myUserId,
                roomId: this.roomId,
                sdp: offer
            });
        } catch (e) {
            console.error("Error creating offer:", e);
        }
    }

    private async handleOffer(fromUserId: string, sdp: RTCSessionDescriptionInit) {
        if (!this.roomId) return;
        const pc = this.createPeerConnection(fromUserId);

        try {
            // Polite peer: if both sides initiated simultaneously, rollback our
            // own offer before accepting the remote one to avoid "wrong state" error.
            if (pc.signalingState !== "stable") {
                await pc.setLocalDescription({ type: "rollback" });
            }
            await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);

            this.socket.emit("voice:answer", {
                targetUserId: fromUserId,
                fromUserId: this.myUserId,
                roomId: this.roomId,
                sdp: answer
            });
        } catch (e) {
            console.error("Error handling offer:", e);
        }
    }

    private async handleAnswer(fromUserId: string, sdp: RTCSessionDescriptionInit) {
        const pc = this.connections.get(fromUserId);
        if (pc) {
            try {
                await pc.setRemoteDescription(new RTCSessionDescription(sdp));
            } catch (e) {
                console.error("Error setting remote description for answer:", e);
            }
        }
    }

    private async handleIceCandidate(fromUserId: string, candidate: RTCIceCandidateInit) {
        const pc = this.connections.get(fromUserId);
        if (pc) {
            try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
                console.error("Error adding ice candidate:", e);
            }
        }
    }

    public toggleMute(isMuted: boolean) {
        if (this.localStream) {
            this.localStream.getAudioTracks().forEach(track => {
                track.enabled = !isMuted;
            });

            if (this.roomId) {
                this.socket.emit("voice:toggle_mute", {
                    roomId: this.roomId,
                    userId: this.myUserId,
                    muted: isMuted
                });
            }
        }
    }

    public removePeer(userId: string) {
        const pc = this.connections.get(userId);
        if (pc) {
            pc.close();
            this.connections.delete(userId);
        }
        if (this.onStreamRemoved) {
            this.onStreamRemoved(userId);
        }
    }

    public disconnect() {
        if (this.roomId) {
            this.socket.emit("voice:leave", {
                roomId: this.roomId,
                userId: this.myUserId
            });
        }

        this.connections.forEach(pc => pc.close());
        this.connections.clear();

        if (this.localStream) {
            this.localStream.getTracks().forEach(track => track.stop());
            this.localStream = null;
        }

        if (this.checkAudioLevelRef !== null) {
            cancelAnimationFrame(this.checkAudioLevelRef);
            this.checkAudioLevelRef = null;
        }
        if (this.audioContext && this.audioContext.state !== "closed") {
            this.audioContext.close();
            this.audioContext = null;
        }
        this.isCurrentlySpeaking = false;

        // Clean up listeners
        this.socket.off("voice:offer");
        this.socket.off("voice:answer");
        this.socket.off("voice:ice_candidate");
        this.socket.off("voice:user_muted");
        this.socket.off("voice:user_left");
        this.socket.off("voice:speaking");
    }
}
