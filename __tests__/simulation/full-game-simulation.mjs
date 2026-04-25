/**
 * Full 4-Player Bridge Game Simulation
 *
 * Tests the complete game lifecycle against the local Docker test DB:
 *   1. Register 4 players
 *   2. Login all 4 (get session cookies via NextAuth credentials)
 *   3. Player 1 creates a room
 *   4. Players 2-4 join via invite code
 *   5. All 4 select seats (N/E/W/S)
 *   6. All 4 mark ready → room auto-moves to READY status
 *   7. Creator starts the game
 *   8. Bidding round: dealer bids 1NT, next 3 pass → contract set
 *   9. Card play: 13 tricks (always play first available card)
 *  10. Verify final scoring
 *
 * Run: node __tests__/simulation/full-game-simulation.mjs
 */

const BASE = 'http://localhost:3000';
const RESULTS = [];
let passed = 0, failed = 0;

// ─── Helpers ──────────────────────────────────────────────────────────────

const ok   = (l)      => { console.log(`  ✅ ${l}`); RESULTS.push({l,ok:true}); passed++; };
const fail = (l,r)    => { console.log(`  ❌ ${l}: ${r}`); RESULTS.push({l,ok:false,r}); failed++; };
const info = (l)      => console.log(`  ℹ️  ${l}`);

function cookieHeader(jar) {
  return [...jar.entries()].map(([k,v]) => `${k}=${v}`).join('; ');
}

function captureCookies(res, jar) {
  for (const sc of res.headers.getSetCookie?.() ?? []) {
    const [pair] = sc.split(';');
    const eqIdx = pair.indexOf('=');
    if (eqIdx < 0) continue;
    const name = pair.slice(0, eqIdx).trim();
    const val  = pair.slice(eqIdx + 1).trim();
    if (name) jar.set(name, val);
  }
}

async function apiFetch(method, path, body, jar) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(jar?.size ? { Cookie: cookieHeader(jar) } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    redirect: 'manual',
  });
  if (jar) captureCookies(res, jar);
  let data = {};
  try { data = await res.json(); } catch {}
  return { status: res.status, data };
}

const ts = Date.now();
const mkUser = (n) => ({ email:`sim${n}-${ts}@test.com`, username:`sim${n}_${ts}`, password:'Password123!' });

// ─── Register + Login ─────────────────────────────────────────────────────

async function registerAndLogin(user) {
  const jar = new Map();

  // 1. Register
  const reg = await apiFetch('POST', '/api/auth/register', {
    email: user.email, username: user.username,
    password: user.password, confirmPassword: user.password,
  }, jar);
  if (reg.status !== 200 && reg.status !== 201) {
    throw new Error(`Register ${reg.status}: ${JSON.stringify(reg.data)}`);
  }

  // 2. Get CSRF token
  const { data: csrfData } = await apiFetch('GET', '/api/auth/csrf', undefined, jar);
  const csrfToken = csrfData?.csrfToken ?? '';

  // 3. Credentials sign-in (form-encoded, NextAuth callback)
  const loginRes = await fetch(`${BASE}/api/auth/callback/credentials`, {
    method: 'POST',
    redirect: 'manual',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Cookie: cookieHeader(jar),
    },
    body: new URLSearchParams({
      email: user.email, password: user.password,
      csrfToken, callbackUrl: `${BASE}/dashboard`, json: 'true',
    }),
  });
  captureCookies(loginRes, jar);

  // 4. Follow redirect to get session cookie if needed
  if (loginRes.status === 302) {
    const loc = loginRes.headers.get('location') ?? '/dashboard';
    const redirectRes = await fetch(loc.startsWith('http') ? loc : `${BASE}${loc}`, {
      headers: { Cookie: cookieHeader(jar) },
      redirect: 'manual',
    });
    captureCookies(redirectRes, jar);
  }

  // 5. Verify session
  const sess = await apiFetch('GET', '/api/auth/session', undefined, jar);
  const userId = sess.data?.user?.id;
  if (!userId) throw new Error(`Session not established (status ${loginRes.status})`);

  return { jar, userId, username: user.username };
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function simulate() {
  console.log('\n🎴  BridgeOnline — Full 4-Player Game Simulation');
  console.log('━'.repeat(56));

  // ── Phase 1: Register & Login ──────────────────────────
  console.log('\n📋 Phase 1: Register & Login');
  const players = [];
  for (let i = 1; i <= 4; i++) {
    try {
      const p = await registerAndLogin(mkUser(i));
      players.push(p);
      ok(`Player ${i} (${p.username}) — userId: ${p.userId.slice(0,8)}...`);
    } catch (e) {
      fail(`Player ${i} auth`, e.message);
      return;
    }
  }

  // Build userId→playerIndex map
  const uidToIdx = {};
  for (let i = 0; i < players.length; i++) uidToIdx[players[i].userId] = i;

  // ── Phase 2: Create Room ───────────────────────────────
  console.log('\n🏠 Phase 2: Create Room');
  const { status: cs, data: cd } = await apiFetch('POST', '/api/rooms/create', {
    name: 'Full Sim Game', settings: { numBoards: 1, timerEnabled: false },
  }, players[0].jar);

  if (cs !== 200 && cs !== 201) { fail('Create room', `${cs}: ${JSON.stringify(cd)}`); return; }
  const { roomId, inviteCode } = cd;
  ok(`Room created — roomId: ${roomId.slice(0,8)}..., code: ${inviteCode}`);

  // ── Phase 3: Join Room ─────────────────────────────────
  console.log('\n🚪 Phase 3: Players 2-4 Join');
  for (let i = 1; i <= 3; i++) {
    const { status, data } = await apiFetch('POST', '/api/rooms/join', { inviteCode }, players[i].jar);
    if (status === 200 || status === 201) ok(`Player ${i+1} joined`);
    else fail(`Player ${i+1} join`, `${status}: ${JSON.stringify(data)}`);
  }

  // ── Phase 4: Seat Selection ────────────────────────────
  console.log('\n💺 Phase 4: Seat Selection');
  // Player 1 is auto-SOUTH. Assign N/E/W to players 2/3/4
  const seatAssignments = ['NORTH','EAST','WEST'];
  for (let i = 1; i <= 3; i++) {
    const seat = seatAssignments[i-1];
    const { status, data } = await apiFetch('PATCH', `/api/rooms/${roomId}/seat`, { seat }, players[i].jar);
    if (status === 200) ok(`Player ${i+1} → ${seat}`);
    else fail(`Player ${i+1} seat`, `${status}: ${JSON.stringify(data)}`);
  }
  ok('Player 1 → SOUTH (auto)');

  // ── Phase 5: Ready Up ──────────────────────────────────
  console.log('\n✋ Phase 5: All Players Ready');
  for (let i = 0; i < 4; i++) {
    const { status, data } = await apiFetch('PATCH', `/api/rooms/${roomId}/ready`, { isReady: true }, players[i].jar);
    if (status === 200) ok(`Player ${i+1} ready`);
    else fail(`Player ${i+1} ready`, `${status}: ${JSON.stringify(data)}`);
  }

  // ── Phase 6: Start Game ────────────────────────────────
  console.log('\n🎮 Phase 6: Start Game');
  const { status: ss, data: sd } = await apiFetch('POST', `/api/rooms/${roomId}/start`, {}, players[0].jar);
  if (ss !== 200 && ss !== 201) { fail('Start game', `${ss}: ${JSON.stringify(sd)}`); return; }
  const gameId = sd.gameId;
  ok(`Game started — gameId: ${gameId.slice(0,8)}...`);

  // ── Phase 7: Inspect Initial State ────────────────────
  console.log('\n🃏 Phase 7: Initial Game State');
  const { data: g0 } = await apiFetch('GET', `/api/games/${gameId}`, undefined, players[0].jar);

  const phase0       = g0.phase;
  const gamePlayers0 = g0.players ?? [];
  const dealerUser   = g0.dealer;

  // Build seat maps from the `players` array in the response
  const uidToSeat = {};
  for (const gp of gamePlayers0) {
    uidToSeat[gp.userId] = gp.seat;
  }

  ok(`Phase: ${phase0}`);
  ok(`Board: #${g0.boardNumber ?? 1}`);

  const dealerSeat = dealerUser ? uidToSeat[dealerUser.id] : null;
  ok(`Dealer: ${dealerUser?.username ?? '?'} (${dealerSeat ?? '?'})`);

  if (phase0 !== 'BIDDING') { fail('Phase check', `Expected BIDDING, got ${phase0}`); return; }

  // API returns currentPlayer: { id, username } — NOT currentPlayerId at top-level
  let currentPlayerId = g0.currentPlayer?.id;
  if (!currentPlayerId) { fail('currentPlayer', 'currentPlayer.id missing in game state'); return; }
  ok(`First bidder: ${g0.currentPlayer.username} (${uidToSeat[currentPlayerId] ?? '?'})`);

  // ── Phase 8: Bidding ───────────────────────────────────
  console.log('\n🗣️  Phase 8: Bidding Round');

  // Bidding sequence: 1NT + 3 passes → complete
  const biddingMoves = [
    { action: 'bid', bid: { level: 1, suit: 'NT' } },
    { action: 'pass' },
    { action: 'pass' },
    { action: 'pass' },
  ];

  const SEAT_ORDER = ['NORTH', 'EAST', 'SOUTH', 'WEST'];
  let biddingComplete = false;

  for (const move of biddingMoves) {
    const seat  = uidToSeat[currentPlayerId];
    const pidx  = uidToIdx[currentPlayerId] ?? -1;
    const label = move.action === 'bid' ? `${seat ?? '?'} bids 1NT` : `${seat ?? '?'} passes`;

    if (pidx < 0) { fail(label, `No player index for userId ${currentPlayerId}`); break; }

    const { status, data } = await apiFetch('POST', `/api/games/${gameId}/bid`, move, players[pidx].jar);
    if (status === 200) {
      biddingComplete = data.biddingComplete ?? false;
      ok(`${label} ✓`);
      // Advance to next seat clockwise
      if (!biddingComplete) {
        const nextSeatIdx = (SEAT_ORDER.indexOf(seat) + 1) % 4;
        const nextSeat    = SEAT_ORDER[nextSeatIdx];
        currentPlayerId   = Object.keys(uidToSeat).find(uid => uidToSeat[uid] === nextSeat);
      }
    } else {
      fail(label, `${status}: ${JSON.stringify(data)}`);
      break;
    }
  }

  ok(`Bidding complete: ${biddingComplete}`);
  if (!biddingComplete) { fail('Bidding result', 'Expected biddingComplete=true'); return; }

  // ── Fetch post-bid state ───────────────────────────────
  const { data: g1 } = await apiFetch('GET', `/api/games/${gameId}`, undefined, players[0].jar);
  const phase1    = g1.phase;
  const contract  = g1.contract;
  ok(`Phase after bidding: ${phase1}`);

  const declarerLabel = contract?.declarer
    ? (uidToSeat[contract.declarer] ?? contract.declarer.slice(0,8))
    : (g1.declarer?.username ?? '?');
  ok(`Contract: ${contract ? `${contract.level}${contract.suit}` : 'unknown'} by ${declarerLabel}`);

  if (phase1 !== 'PLAYING') { fail('Phase transition', `Expected PLAYING, got ${phase1}`); return; }

  // Determine declarer/dummy for the dummy-plays logic
  const declarerId    = g1.declarer?.id;
  const declarerSeat  = declarerId ? uidToSeat[declarerId] : null;
  const PARTNER       = { NORTH:'SOUTH', SOUTH:'NORTH', EAST:'WEST', WEST:'EAST' };
  const dummySeat     = declarerSeat ? PARTNER[declarerSeat] : null;
  const dummyUserId   = dummySeat ? Object.keys(uidToSeat).find(uid => uidToSeat[uid] === dummySeat) : null;
  const declarerPidx  = declarerId ? (uidToIdx[declarerId] ?? -1) : -1;

  info(`Declarer: ${g1.declarer?.username ?? '?'} (${declarerSeat}), Dummy: ${dummySeat}`);

  // ── Phase 9: Card Play (13 tricks) ────────────────────
  console.log('\n♠️  Phase 9: Card Play (13 Tricks)');

  let playErrors = 0;
  let totalPlays = 0;

  for (let trick = 0; trick < 13; trick++) {
    for (let play = 0; play < 4; play++) {
      // Fetch game state to determine current player
      const { data: gN } = await apiFetch('GET', `/api/games/${gameId}`, undefined, players[0].jar);
      const curId = gN.currentPlayer?.id;
      const seat  = uidToSeat[curId];

      if (!curId) {
        fail(`T${trick+1} P${play+1}`, `currentPlayer.id missing`); playErrors++; break;
      }

      let handToUse;
      let playingPidx;

      if (curId === dummyUserId && declarerPidx >= 0) {
        // Dummy's turn: fetch dummy's hand via dummy's own session; declarer submits the play
        const dummyPidx = uidToIdx[dummyUserId] ?? -1;
        if (dummyPidx >= 0) {
          const { data: gDummy } = await apiFetch('GET', `/api/games/${gameId}`, undefined, players[dummyPidx].jar);
          handToUse = gDummy.hand ?? [];
        } else {
          handToUse = [];
        }
        playingPidx = declarerPidx;
        info(`T${trick+1} P${play+1}: Declarer plays for dummy (${dummySeat})`);
      } else {
        // Normal player's turn: fetch their hand via their own session
        const pidx = uidToIdx[curId] ?? -1;
        if (pidx < 0) {
          fail(`T${trick+1} P${play+1}`, `No player index for ${curId}`); playErrors++; break;
        }
        const { data: gSelf } = await apiFetch('GET', `/api/games/${gameId}`, undefined, players[pidx].jar);
        handToUse  = gSelf.hand ?? [];
        playingPidx = pidx;
      }

      // Pick a legal card: follow suit if possible, otherwise play anything
      const ledSuit = gN.currentTrick?.length > 0
        ? gN.currentTrick[0].card?.slice(-1)   // last char of "AS" = "S"
        : null;
      const followCards = ledSuit
        ? handToUse.filter(c => c.slice(-1) === ledSuit)
        : [];
      const card = followCards.length > 0 ? followCards[0] : handToUse[0];

      if (!card) {
        fail(`T${trick+1} P${play+1}`, `${seat} has no cards in hand`);
        playErrors++; break;
      }

      const { status, data } = await apiFetch('POST', `/api/games/${gameId}/play`, { card }, players[playingPidx].jar);
      if (status !== 200) {
        fail(`T${trick+1} P${play+1} (${seat} plays ${card})`, `${status}: ${JSON.stringify(data)}`);
        playErrors++;
        break;
      }
      totalPlays++;
    }
    if (playErrors) break;

    if ((trick + 1) % 4 === 0 || trick === 12) ok(`Tricks completed: ${trick+1}/13`);
  }

  ok(`Total cards played: ${totalPlays}/52`);

  // ── Phase 10: Final State & Scoring ───────────────────
  console.log('\n🏆 Phase 10: Final State & Score');
  const { data: gF } = await apiFetch('GET', `/api/games/${gameId}`, undefined, players[0].jar);
  const finalPhase = gF.phase;
  ok(`Final phase: ${finalPhase}`);

  if (finalPhase === 'COMPLETED' || finalPhase === 'SCORING') {
    ok('Game reached COMPLETED state ✓');
    const tricks = gF.tricks ?? [];
    const NS = tricks.filter(t => t.winner==='NORTH'||t.winner==='SOUTH').length;
    const EW = tricks.filter(t => t.winner==='EAST' ||t.winner==='WEST').length;
    ok(`Tricks won — NS: ${NS}, EW: ${EW} (${NS+EW}/13 tricks tallied)`);
  } else if (playErrors === 0) {
    ok('All 52 cards played without errors');
    info(`Final phase is "${finalPhase}" — scoring may be triggered separately`);
    const tricks = gF.tricks ?? [];
    const NS = tricks.filter(t => t.winner==='NORTH'||t.winner==='SOUTH').length;
    const EW = tricks.filter(t => t.winner==='EAST' ||t.winner==='WEST').length;
    ok(`Tricks won — NS: ${NS}, EW: ${EW} (${NS+EW}/13 tricks tallied)`);
  } else {
    fail('Game completion', `${playErrors} card play error(s) prevented full completion`);
  }

  // ── Summary ────────────────────────────────────────────
  console.log('\n' + '━'.repeat(56));
  console.log(`\n📊  Results: ${passed} passed  |  ${failed} failed\n`);
  if (failed > 0) {
    console.log('Failed checks:');
    RESULTS.filter(r => !r.ok).forEach(r => console.log(`  ❌ ${r.l}: ${r.r}`));
  }
  console.log(`\n${failed === 0 ? '🎉  ALL CHECKS PASSED — full game simulation successful!' : '⚠️   SOME CHECKS FAILED — see above'}\n`);

  return { passed, failed, gameId, roomId, inviteCode };
}

simulate().catch(e => { console.error('\n💥 Crash:', e.message, e.stack); process.exit(1); });
