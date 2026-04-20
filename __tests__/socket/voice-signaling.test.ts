import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestServer,
  connectClient,
  waitForEvent,
  disconnectAll,
  type TestSocketServer,
} from '../helpers/socket-server';

let server: TestSocketServer;

beforeAll(async () => {
  server = await createTestServer();
});

afterAll(async () => {
  await server.close();
});

async function twoClientsInRoom(roomId: string) {
  const alice = connectClient(server.url);
  const bob = connectClient(server.url);
  await Promise.all([waitForEvent(alice, 'connect'), waitForEvent(bob, 'connect')]);
  alice.emit('room:join', { roomId });
  bob.emit('room:join', { roomId });
  await new Promise((r) => setTimeout(r, 60));
  return { alice, bob };
}

describe('WebRTC signaling relay', () => {
  it('relays voice:offer to other room members (not sender)', async () => {
    const { alice, bob } = await twoClientsInRoom('voice-offer-room');

    const bobGotOffer = waitForEvent<{ sdp: string; userId: string }>(bob, 'voice:offer');
    alice.emit('voice:offer', {
      roomId: 'voice-offer-room',
      sdp: 'offer-sdp-string',
      userId: 'alice-id',
    });

    const payload = await bobGotOffer;
    expect(payload.sdp).toBe('offer-sdp-string');
    expect(payload.userId).toBe('alice-id');

    disconnectAll(alice, bob);
  });

  it('does NOT echo voice:offer back to sender', async () => {
    const { alice, bob } = await twoClientsInRoom('offer-no-echo');

    let aliceGotOffer = false;
    alice.on('voice:offer', () => { aliceGotOffer = true; });
    alice.emit('voice:offer', { roomId: 'offer-no-echo', sdp: 'x', userId: 'alice' });

    await new Promise((r) => setTimeout(r, 100));
    expect(aliceGotOffer).toBe(false);

    disconnectAll(alice, bob);
  });

  it('relays voice:answer back to offering peer', async () => {
    const { alice, bob } = await twoClientsInRoom('voice-answer-room');

    const aliceGotAnswer = waitForEvent<{ sdp: string }>(alice, 'voice:answer');
    bob.emit('voice:answer', {
      roomId: 'voice-answer-room',
      sdp: 'answer-sdp-string',
      userId: 'bob-id',
    });

    const payload = await aliceGotAnswer;
    expect(payload.sdp).toBe('answer-sdp-string');

    disconnectAll(alice, bob);
  });

  it('relays ICE candidates in both directions', async () => {
    const { alice, bob } = await twoClientsInRoom('ice-room');

    const bobGotIce = waitForEvent<{ candidate: string }>(bob, 'voice:ice_candidate');
    alice.emit('voice:ice_candidate', {
      roomId: 'ice-room',
      candidate: 'candidate:1234',
    });

    const payload = await bobGotIce;
    expect(payload.candidate).toBe('candidate:1234');

    disconnectAll(alice, bob);
  });

  it('completes full offer → answer → ICE signaling sequence', async () => {
    const { alice, bob } = await twoClientsInRoom('full-signaling-room');

    // Step 1: Alice offers
    const bobGotOffer = waitForEvent<{ sdp: string }>(bob, 'voice:offer');
    alice.emit('voice:offer', { roomId: 'full-signaling-room', sdp: 'offer-sdp', userId: 'alice' });
    await bobGotOffer;

    // Step 2: Bob answers
    const aliceGotAnswer = waitForEvent<{ sdp: string }>(alice, 'voice:answer');
    bob.emit('voice:answer', { roomId: 'full-signaling-room', sdp: 'answer-sdp', userId: 'bob' });
    await aliceGotAnswer;

    // Step 3: ICE exchange
    const aliceGotIce = waitForEvent<{ candidate: string }>(alice, 'voice:ice_candidate');
    const bobGotIce = waitForEvent<{ candidate: string }>(bob, 'voice:ice_candidate');

    bob.emit('voice:ice_candidate', { roomId: 'full-signaling-room', candidate: 'bob-ice' });
    alice.emit('voice:ice_candidate', { roomId: 'full-signaling-room', candidate: 'alice-ice' });

    const [ai, bi] = await Promise.all([aliceGotIce, bobGotIce]);
    expect(ai.candidate).toBe('bob-ice');
    expect(bi.candidate).toBe('alice-ice');

    disconnectAll(alice, bob);
  });

  it('broadcasts voice:user_muted to room (not sender)', async () => {
    const { alice, bob } = await twoClientsInRoom('mute-room');

    const bobGotMute = waitForEvent<{ muted: boolean; userId: string }>(bob, 'voice:user_muted');
    alice.emit('voice:toggle_mute', { roomId: 'mute-room', muted: true, userId: 'alice' });

    const payload = await bobGotMute;
    expect(payload.muted).toBe(true);

    disconnectAll(alice, bob);
  });

  it('broadcasts voice:speaking indicator', async () => {
    const { alice, bob } = await twoClientsInRoom('speaking-room');

    const bobGotSpeaking = waitForEvent<{ speaking: boolean }>(bob, 'voice:speaking');
    alice.emit('voice:speaking', { roomId: 'speaking-room', speaking: true, userId: 'alice' });

    const payload = await bobGotSpeaking;
    expect(payload.speaking).toBe(true);

    disconnectAll(alice, bob);
  });

  it('broadcasts voice:user_left when player leaves voice', async () => {
    const { alice, bob } = await twoClientsInRoom('voice-leave-room');

    const bobGotLeft = waitForEvent<{ userId: string }>(bob, 'voice:user_left');
    alice.emit('voice:leave', { roomId: 'voice-leave-room', userId: 'alice' });

    const payload = await bobGotLeft;
    expect(payload.userId).toBe('alice');

    disconnectAll(alice, bob);
  });
});
