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

async function joinRoom(clients: ReturnType<typeof connectClient>[], roomId: string) {
  for (const c of clients) {
    await waitForEvent(c, 'connect');
    c.emit('room:join', { roomId });
  }
  await new Promise((r) => setTimeout(r, 80));
}

describe('game:join', () => {
  it('allows a client to subscribe to both room and game channels', async () => {
    const alice = connectClient(server.url);
    await waitForEvent(alice, 'connect');

    alice.emit('game:join', { gameId: 'game-abc', roomId: 'room-abc' });
    await new Promise((r) => setTimeout(r, 50));

    // Verify by having a second client emit to game channel and alice receives
    const bob = connectClient(server.url);
    await waitForEvent(bob, 'connect');
    bob.emit('room:join', { roomId: 'room-abc' });
    await new Promise((r) => setTimeout(r, 50));

    const aliceGot = waitForEvent<{ socketId: string }>(alice, 'game:bid_made');
    bob.emit('game:make_bid', { roomId: 'room-abc', bid: { level: 1, suit: 'NT' } });

    const payload = await aliceGot;
    expect(payload).toBeTruthy();

    disconnectAll(alice, bob);
  });
});

describe('game:make_bid', () => {
  it('broadcasts bid to all room members including sender', async () => {
    const [alice, bob] = [connectClient(server.url), connectClient(server.url)];
    await joinRoom([alice, bob], 'bid-room');

    const aliceGot = waitForEvent<{ socketId: string; bid: any }>(alice, 'game:bid_made');
    const bobGot = waitForEvent<{ socketId: string; bid: any }>(bob, 'game:bid_made');

    alice.emit('game:make_bid', { roomId: 'bid-room', bid: { level: 2, suit: 'HEARTS' } });

    const [ap, bp] = await Promise.all([aliceGot, bobGot]);
    expect(ap.bid).toEqual({ level: 2, suit: 'HEARTS' });
    expect(bp.bid).toEqual({ level: 2, suit: 'HEARTS' });
    expect(ap.socketId).toBe(alice.id);

    disconnectAll(alice, bob);
  });

  it('includes the sender socketId in bid payload', async () => {
    const [alice, bob] = [connectClient(server.url), connectClient(server.url)];
    await joinRoom([alice, bob], 'bid-id-room');

    const bobGot = waitForEvent<{ socketId: string }>(bob, 'game:bid_made');
    alice.emit('game:make_bid', { roomId: 'bid-id-room', bid: { level: 1, suit: 'SPADES' } });

    const payload = await bobGot;
    expect(payload.socketId).toBe(alice.id);

    disconnectAll(alice, bob);
  });
});

describe('game:play_card', () => {
  it('broadcasts card play to all room members', async () => {
    const [alice, bob, carol, dave] = [
      connectClient(server.url), connectClient(server.url),
      connectClient(server.url), connectClient(server.url),
    ];
    await joinRoom([alice, bob, carol, dave], 'play-room');

    const receives = [bob, carol, dave].map((c) =>
      waitForEvent<{ socketId: string; card: string }>(c, 'game:card_played')
    );
    alice.emit('game:play_card', { roomId: 'play-room', card: 'AS' });

    const results = await Promise.all(receives);
    results.forEach((r) => {
      expect(r.card).toBe('AS');
      expect(r.socketId).toBe(alice.id);
    });

    disconnectAll(alice, bob, carol, dave);
  });

  it('4 players each play a card in sequence', async () => {
    const clients = [
      connectClient(server.url), connectClient(server.url),
      connectClient(server.url), connectClient(server.url),
    ];
    await joinRoom(clients, 'sequence-room');

    const cards = ['AS', 'KH', '2C', '7D'];
    const received: string[] = [];

    // All listen for played cards
    clients.forEach((c) => {
      c.on('game:card_played', ({ card }: { card: string }) => received.push(card));
    });

    for (let i = 0; i < 4; i++) {
      clients[i].emit('game:play_card', { roomId: 'sequence-room', card: cards[i] });
      await new Promise((r) => setTimeout(r, 30));
    }

    await new Promise((r) => setTimeout(r, 100));
    // Each of the 4 broadcasts is received by all 4 clients = 16 events total
    expect(received.length).toBe(16);

    disconnectAll(...clients);
  });
});
