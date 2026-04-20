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

describe('room:join', () => {
  it('notifies other room members when a new player joins', async () => {
    const alice = connectClient(server.url);
    const bob = connectClient(server.url);

    // Bob joins first so he can receive the notification
    await waitForEvent(bob, 'connect');
    bob.emit('room:join', { roomId: 'room-join-test' });
    await new Promise((r) => setTimeout(r, 50)); // let bob settle

    // Alice joins the same room
    await waitForEvent(alice, 'connect');

    const bobReceived = waitForEvent<{ socketId: string }>(bob, 'room:player_joined');
    alice.emit('room:join', { roomId: 'room-join-test' });

    const payload = await bobReceived;
    expect(payload.socketId).toBeTruthy();

    disconnectAll(alice, bob);
  });

  it('does NOT send room:player_joined back to the joining player', async () => {
    const alice = connectClient(server.url);

    await waitForEvent(alice, 'connect');

    let selfNotified = false;
    alice.on('room:player_joined', () => { selfNotified = true; });
    alice.emit('room:join', { roomId: 'self-check-room' });

    await new Promise((r) => setTimeout(r, 100));
    expect(selfNotified).toBe(false);

    disconnectAll(alice);
  });
});

describe('room:leave', () => {
  it('notifies remaining members when a player leaves', async () => {
    const alice = connectClient(server.url);
    const bob = connectClient(server.url);

    await Promise.all([waitForEvent(alice, 'connect'), waitForEvent(bob, 'connect')]);

    alice.emit('room:join', { roomId: 'leave-test' });
    bob.emit('room:join', { roomId: 'leave-test' });
    await new Promise((r) => setTimeout(r, 50));

    const bobGotLeft = waitForEvent<{ socketId: string }>(bob, 'room:player_left');
    alice.emit('room:leave', { roomId: 'leave-test' });

    const payload = await bobGotLeft;
    expect(payload.socketId).toBeTruthy();

    disconnectAll(alice, bob);
  });
});

describe('room:seat_changed', () => {
  it('broadcasts seat change to other room members', async () => {
    const alice = connectClient(server.url);
    const bob = connectClient(server.url);

    await Promise.all([waitForEvent(alice, 'connect'), waitForEvent(bob, 'connect')]);

    alice.emit('room:join', { roomId: 'seat-test' });
    bob.emit('room:join', { roomId: 'seat-test' });
    await new Promise((r) => setTimeout(r, 50));

    const bobGotSeat = waitForEvent<{ seat: string; userId: string }>(bob, 'room:seat_changed');
    alice.emit('room:seat_changed', {
      roomId: 'seat-test',
      userId: 'user-alice',
      seat: 'NORTH',
      username: 'alice',
    });

    const payload = await bobGotSeat;
    expect(payload.seat).toBe('NORTH');
    expect(payload.userId).toBe('user-alice');

    disconnectAll(alice, bob);
  });

  it('does NOT echo seat change back to sender', async () => {
    const alice = connectClient(server.url);
    await waitForEvent(alice, 'connect');
    alice.emit('room:join', { roomId: 'no-echo-seat' });

    let aliceGotSeat = false;
    alice.on('room:seat_changed', () => { aliceGotSeat = true; });
    alice.emit('room:seat_changed', { roomId: 'no-echo-seat', userId: 'x', seat: 'SOUTH', username: 'alice' });

    await new Promise((r) => setTimeout(r, 100));
    expect(aliceGotSeat).toBe(false);

    disconnectAll(alice);
  });
});

describe('room:ready_toggle', () => {
  it('broadcasts ready status to other members', async () => {
    const alice = connectClient(server.url);
    const bob = connectClient(server.url);

    await Promise.all([waitForEvent(alice, 'connect'), waitForEvent(bob, 'connect')]);
    alice.emit('room:join', { roomId: 'ready-test' });
    bob.emit('room:join', { roomId: 'ready-test' });
    await new Promise((r) => setTimeout(r, 50));

    const bobGotReady = waitForEvent<{ isReady: boolean; userId: string }>(bob, 'room:player_ready');
    alice.emit('room:ready_toggle', {
      roomId: 'ready-test',
      userId: 'user-alice',
      isReady: true,
      username: 'alice',
    });

    const payload = await bobGotReady;
    expect(payload.isReady).toBe(true);
    expect(payload.userId).toBe('user-alice');

    disconnectAll(alice, bob);
  });
});

describe('room:settings_updated', () => {
  it('broadcasts settings to ALL room members including sender', async () => {
    const alice = connectClient(server.url);
    const bob = connectClient(server.url);

    await Promise.all([waitForEvent(alice, 'connect'), waitForEvent(bob, 'connect')]);
    alice.emit('room:join', { roomId: 'settings-test' });
    bob.emit('room:join', { roomId: 'settings-test' });
    await new Promise((r) => setTimeout(r, 50));

    const aliceGotSettings = waitForEvent<{ settings: any }>(alice, 'room:settings_updated');
    const bobGotSettings = waitForEvent<{ settings: any }>(bob, 'room:settings_updated');

    alice.emit('room:settings_updated', {
      roomId: 'settings-test',
      settings: { timerEnabled: false },
    });

    const [ap, bp] = await Promise.all([aliceGotSettings, bobGotSettings]);
    expect(ap.settings.timerEnabled).toBe(false);
    expect(bp.settings.timerEnabled).toBe(false);

    disconnectAll(alice, bob);
  });
});
