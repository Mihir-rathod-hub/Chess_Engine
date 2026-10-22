import assert from 'assert';
import { buildApp } from './src/app.js';
import { connectionRegistry } from './src/websocket/registry/ConnectionRegistry.js';
import { gameManager } from './src/game/GameManager.js';
import { friendRoomManager } from './src/game/FriendRoomManager.js';
import { handleParsedMessage } from './src/websocket/handlers/messageRouter.js';

async function runFriendRoomTests() {
  console.log('🧪 Starting Strategic Chess Play with Friends Test Suite...\n');

  const app = buildApp();
  let passed = 0;
  let failed = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`  ✅ PASS: ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ FAIL: ${name}`);
      console.error(`     Error: ${err.message}`);
      failed++;
    }
  }

  function createMockSocket(name) {
    const socket = {
      name,
      readyState: 1, // OPEN
      sentFrames: [],
      send: (data) => {
        socket.sentFrames.push(JSON.parse(data));
      },
      getLastSent: () => socket.sentFrames[socket.sentFrames.length - 1] || null,
      clear: () => { socket.sentFrames = []; }
    };
    return socket;
  }

  // 1. Code Normalization & URL parsing
  await test('1: Room code normalization handles plain codes, prefixes, URLs, and casing', async () => {
    assert.strictEqual(friendRoomManager.normalizeCode('strat-5528'), 'STRAT-5528');
    assert.strictEqual(friendRoomManager.normalizeCode('  5528  '), 'STRAT-5528');
    assert.strictEqual(friendRoomManager.normalizeCode('https://strategicchess.app/play?room=STRAT-9842'), 'STRAT-9842');
    assert.strictEqual(friendRoomManager.normalizeCode('http://localhost:5173/play?room=8821'), 'STRAT-8821');
    assert.strictEqual(friendRoomManager.normalizeCode(''), '');
    assert.strictEqual(friendRoomManager.normalizeCode(null), '');
  });

  // 2. Room Code Generation
  await test('2: Generated room codes match canonical format and are collision-free', async () => {
    const code1 = friendRoomManager.generateRoomCode();
    const code2 = friendRoomManager.generateRoomCode();
    assert.match(code1, /^STRAT-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    assert.match(code2, /^STRAT-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    assert.notStrictEqual(code1, code2);
  });

  // 3. Room Creation via FriendRoomManager
  await test('3: User creates a friend room and receives valid room record', async () => {
    friendRoomManager.clear();
    const creatorId = 'user_host_1';
    const room = await friendRoomManager.createRoom(creatorId, {
      timeControl: '10min',
      creatorProfile: { id: creatorId, name: 'Ansh' }
    });

    assert.ok(room.roomCode.startsWith('STRAT-'));
    assert.strictEqual(room.creatorId, creatorId);
    assert.strictEqual(room.status, 'waiting');
    assert.strictEqual(room.joinedPlayerId, null);
    assert.ok(room.expiresAt > Date.now());

    // Can fetch room by code
    const fetched = await friendRoomManager.getRoom(room.roomCode);
    assert.strictEqual(fetched.id, room.id);
    assert.strictEqual(fetched.roomCode, room.roomCode);
  });

  // 4. Joining Room
  await test('4: Second user joins valid room and creator receives notification', async () => {
    const creatorId = 'user_host_2';
    const guestId = 'user_guest_2';

    const socketHost = createMockSocket('HostSocket');
    connectionRegistry.register(creatorId, 'conn_h2', socketHost);

    const room = await friendRoomManager.createRoom(creatorId, {
      creatorProfile: { id: creatorId, name: 'Grandmaster' }
    });

    const joinRes = await friendRoomManager.joinRoom(guestId, room.roomCode, {
      id: guestId,
      name: 'Challenger'
    });

    assert.strictEqual(joinRes.role, 'joiner');
    assert.strictEqual(joinRes.room.joinedPlayerId, guestId);
    assert.strictEqual(joinRes.room.status, 'ready');

    // Host must have received friend.player_joined notification
    const hostMsg = socketHost.getLastSent();
    assert.ok(hostMsg, 'Host received notification');
    assert.strictEqual(hostMsg.type, 'friend.player_joined');
    assert.strictEqual(hostMsg.payload.roomCode, room.roomCode);
    assert.strictEqual(hostMsg.payload.player.id, guestId);

    connectionRegistry.unregister(creatorId, 'conn_h2');
  });

  // 5. Creator cannot join their own room
  await test('5: Creator is rejected if trying to join own room from same account', async () => {
    const creatorId = 'user_host_self';
    const room = await friendRoomManager.createRoom(creatorId);

    await assert.rejects(
      async () => {
        await friendRoomManager.joinRoom(creatorId, room.roomCode);
      },
      /cannot join your own/i
    );
  });

  // 6. Third player cannot join full room
  await test('6: Third player is rejected when attempting to join a full room', async () => {
    const creatorId = 'user_host_full';
    const guestId1 = 'user_guest_full_1';
    const guestId2 = 'user_guest_full_2';

    const room = await friendRoomManager.createRoom(creatorId);
    await friendRoomManager.joinRoom(guestId1, room.roomCode);

    await assert.rejects(
      async () => {
        await friendRoomManager.joinRoom(guestId2, room.roomCode);
      },
      /already full/i
    );
  });

  // 7. Nonexistent code rejection
  await test('7: Joining nonexistent code throws clear not found error', async () => {
    await assert.rejects(
      async () => {
        await friendRoomManager.joinRoom('user_random', 'STRAT-9999');
      },
      /not found/i
    );
  });

  // 8. Starting game requires both players
  await test('8: Cannot start game when only creator is present', async () => {
    const creatorId = 'user_host_alone';
    const room = await friendRoomManager.createRoom(creatorId);

    await assert.rejects(
      async () => {
        await friendRoomManager.startGame(creatorId, room.roomCode);
      },
      /Waiting for your friend to join/i
    );
  });

  // 9. Start game initializes GameRoom and broadcasts game.matched to both players
  await test('9: Starting game assigns opposite colors, initializes 1 GameRoom, and notifies both players', async () => {
    const creatorId = 'user_host_game';
    const guestId = 'user_guest_game';

    const socketHost = createMockSocket('HostSocket');
    const socketGuest = createMockSocket('GuestSocket');
    connectionRegistry.register(creatorId, 'conn_hg', socketHost);
    connectionRegistry.register(guestId, 'conn_gg', socketGuest);

    const room = await friendRoomManager.createRoom(creatorId, {
      creatorProfile: { id: creatorId, name: 'Host Player' },
      timeControl: '10min'
    });

    await friendRoomManager.joinRoom(guestId, room.roomCode, {
      id: guestId,
      name: 'Guest Player'
    });

    const startResult = await friendRoomManager.startGame(creatorId, room.roomCode);
    assert.strictEqual(startResult.success, true);
    assert.ok(startResult.gameId);

    // Verify GameRoom exists in gameManager
    const game = gameManager.getRoom(startResult.gameId);
    assert.ok(game, 'GameRoom instantiated in GameManager');
    assert.strictEqual(game.gameType, 'friendly');
    assert.strictEqual(game.status, 'in_progress');

    // Verify White and Black receive opposite colors and matching gameId
    const hostFrame = socketHost.sentFrames.find((f) => f.type === 'game.matched');
    const guestFrame = socketGuest.sentFrames.find((f) => f.type === 'game.matched');

    assert.ok(hostFrame, 'Host received game.matched');
    assert.ok(guestFrame, 'Guest received game.matched');
    assert.strictEqual(hostFrame.payload.gameId, startResult.gameId);
    assert.strictEqual(guestFrame.payload.gameId, startResult.gameId);

    assert.notStrictEqual(hostFrame.payload.assignedColor, guestFrame.payload.assignedColor);
    assert.ok(['w', 'b'].includes(hostFrame.payload.assignedColor));
    assert.ok(['w', 'b'].includes(guestFrame.payload.assignedColor));

    connectionRegistry.unregister(creatorId, 'conn_hg');
    connectionRegistry.unregister(guestId, 'conn_gg');
  });

  // 10. WebSocket Router integration: friend.create, friend.join, friend.start
  await test('10: WebSocket Router handles friend.create, friend.join, and friend.start end-to-end', async () => {
    const userA = 'user_ws_a';
    const userB = 'user_ws_b';
    const socketA = createMockSocket('WsSocketA');
    const socketB = createMockSocket('WsSocketB');

    connectionRegistry.register(userA, 'conn_ws_a', socketA);
    connectionRegistry.register(userB, 'conn_ws_b', socketB);

    // User A creates room via WS
    await handleParsedMessage(
      { userId: userA, connectionId: 'conn_ws_a', profile: { name: 'Player A' } },
      Buffer.from(JSON.stringify({
        type: 'friend.create',
        requestId: 'req_fc_1',
        payload: { timeControl: '10min' }
      })),
      socketA,
      app.log
    );

    const createMsg = socketA.getLastSent();
    assert.strictEqual(createMsg.type, 'friend.created');
    assert.strictEqual(createMsg.requestId, 'req_fc_1');
    const roomCode = createMsg.payload.roomCode;
    assert.ok(roomCode);

    // User B joins room via WS
    await handleParsedMessage(
      { userId: userB, connectionId: 'conn_ws_b', profile: { name: 'Player B' } },
      Buffer.from(JSON.stringify({
        type: 'friend.join',
        requestId: 'req_fj_1',
        payload: { roomCode }
      })),
      socketB,
      app.log
    );

    const joinMsg = socketB.getLastSent();
    assert.strictEqual(joinMsg.type, 'friend.joined');
    assert.strictEqual(joinMsg.requestId, 'req_fj_1');
    assert.strictEqual(joinMsg.payload.roomCode, roomCode);

    // User A starts room via WS
    await handleParsedMessage(
      { userId: userA, connectionId: 'conn_ws_a' },
      Buffer.from(JSON.stringify({
        type: 'friend.start',
        requestId: 'req_fs_1',
        payload: { roomCode }
      })),
      socketA,
      app.log
    );

    const startMsgA = socketA.sentFrames.find((f) => f.type === 'game.matched');
    const startMsgB = socketB.sentFrames.find((f) => f.type === 'game.matched');
    assert.ok(startMsgA, 'User A received game.matched');
    assert.ok(startMsgB, 'User B received game.matched');
    assert.strictEqual(startMsgA.payload.roomCode, roomCode);
    assert.strictEqual(startMsgB.payload.roomCode, roomCode);

    connectionRegistry.unregister(userA, 'conn_ws_a');
    connectionRegistry.unregister(userB, 'conn_ws_b');
  });

  // 11. Rate limiting prevents code brute-forcing
  await test('11: Rapid failed attempts trigger rate-limit throttling', async () => {
    const testIp = 'ip_brute_test';
    const userId = 'user_brute_test';

    // 8 failed lookups
    for (let i = 0; i < 8; i++) {
      try {
        await friendRoomManager.joinRoom(userId, `STRAT-FAIL-${i}`, null, testIp);
      } catch (_) {}
    }

    // 9th attempt must be rejected by rate-limiter
    await assert.rejects(
      async () => {
        await friendRoomManager.joinRoom(userId, 'STRAT-FAIL-9', null, testIp);
      },
      /Too many incorrect room attempts/i
    );
  });

  console.log(`\n📊 FRIEND ROOMS TEST RESULTS SUMMARY:`);
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    throw new Error(`${failed} tests failed!`);
  }
  console.log('✨ All Play with Friends backend tests passed successfully!\n');
}

runFriendRoomTests().catch((err) => {
  console.error('Test suite execution failed:', err);
  process.exit(1);
});
