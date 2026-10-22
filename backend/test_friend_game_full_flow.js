import assert from 'assert';
import { buildApp } from './src/app.js';
import { connectionRegistry } from './src/websocket/registry/ConnectionRegistry.js';
import { gameManager } from './src/game/GameManager.js';
import { friendRoomManager } from './src/game/FriendRoomManager.js';
import { handleParsedMessage } from './src/websocket/handlers/messageRouter.js';

async function runFriendGameFullFlowIntegrationTest() {
  console.log('🧪 Starting Play with Friends Full-Flow End-to-End Integration Test...\n');

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
      if (err.stack) console.error(err.stack);
      failed++;
    }
  }

  function createMockSocket(name) {
    const socket = {
      name,
      readyState: 1,
      sentFrames: [],
      send: (data) => {
        const parsed = JSON.parse(data);
        socket.sentFrames.push(parsed);
      },
      getLastSent: () => socket.sentFrames[socket.sentFrames.length - 1] || null,
      findSentByType: (type) => socket.sentFrames.filter(f => f.type === type),
      clear: () => { socket.sentFrames = []; }
    };
    return socket;
  }

  // Define players
  const userA = 'user_friend_alice';
  const connA = 'conn_friend_alice_1';
  const socketA = createMockSocket('Alice (Creator)');

  const userB = 'user_friend_bob';
  const connB = 'conn_friend_bob_1';
  const socketB = createMockSocket('Bob (Joiner)');

  const userC = 'user_friend_charlie_intruder';
  const connC = 'conn_friend_charlie_1';
  const socketC = createMockSocket('Charlie (Intruder)');

  connectionRegistry.register(userA, connA, socketA);
  connectionRegistry.register(userB, connB, socketB);
  connectionRegistry.register(userC, connC, socketC);

  let roomCode = null;
  let gameId = null;
  let whiteUser = null;
  let blackUser = null;
  let whiteSocket = null;
  let blackSocket = null;

  // 1. Alice creates friend room
  await test('Step 1: Alice creates friend room via WebSocket', async () => {
    socketA.clear();
    await handleParsedMessage(
      { userId: userA, connectionId: connA },
      Buffer.from(JSON.stringify({
        type: 'friend.create',
        requestId: 'req_create_1',
        payload: { timeControl: '10min' }
      })),
      socketA,
      app.log
    );

    const frame = socketA.getLastSent();
    assert.ok(frame, 'Alice received response frame');
    assert.strictEqual(frame.type, 'friend.created');
    assert.strictEqual(frame.requestId, 'req_create_1');
    assert.ok(frame.payload.roomCode, 'Room code was generated');
    assert.match(frame.payload.roomCode, /^STRAT-[2-9A-HJ-NP-Z]{4}$/);
    assert.strictEqual(frame.payload.status, 'waiting');
    roomCode = frame.payload.roomCode;
  });

  // 2. Bob joins friend room using the code
  await test('Step 2: Bob joins friend room and Alice gets notified', async () => {
    socketA.clear();
    socketB.clear();

    await handleParsedMessage(
      { userId: userB, connectionId: connB },
      Buffer.from(JSON.stringify({
        type: 'friend.join',
        requestId: 'req_join_1',
        payload: { roomCode }
      })),
      socketB,
      app.log
    );

    // Bob receives join confirmation
    const bobFrame = socketB.getLastSent();
    assert.ok(bobFrame, 'Bob received confirmation');
    assert.strictEqual(bobFrame.type, 'friend.joined');
    assert.strictEqual(bobFrame.payload.roomCode, roomCode);
    assert.strictEqual(bobFrame.payload.status, 'ready');

    // Alice receives friend.player_joined broadcast
    const aliceJoinedFrames = socketA.findSentByType('friend.player_joined');
    assert.strictEqual(aliceJoinedFrames.length, 1, 'Alice notified that Bob joined');
    assert.strictEqual(aliceJoinedFrames[0].payload.player.id, userB);
  });

  // 3. Alice starts the game -> Both receive game.matched with opposite colors
  await test('Step 3: Alice starts game; both receive game.matched with opposite colors', async () => {
    socketA.clear();
    socketB.clear();

    await handleParsedMessage(
      { userId: userA, connectionId: connA },
      Buffer.from(JSON.stringify({
        type: 'friend.start',
        requestId: 'req_start_1',
        payload: { roomCode }
      })),
      socketA,
      app.log
    );

    const matchFrameA = socketA.findSentByType('game.matched')[0];
    const matchFrameB = socketB.findSentByType('game.matched')[0];

    assert.ok(matchFrameA, 'Alice received game.matched');
    assert.ok(matchFrameB, 'Bob received game.matched');

    assert.strictEqual(matchFrameA.payload.gameId, matchFrameB.payload.gameId, 'Same gameId assigned to both');
    gameId = matchFrameA.payload.gameId;

    // Verify opposite colors
    const colorA = matchFrameA.payload.assignedColor;
    const colorB = matchFrameB.payload.assignedColor;
    assert.ok((colorA === 'w' && colorB === 'b') || (colorA === 'b' && colorB === 'w'), `Colors must be opposite w and b (got ${colorA}, ${colorB})`);

    if (colorA === 'w') {
      whiteUser = userA;
      whiteSocket = socketA;
      blackUser = userB;
      blackSocket = socketB;
    } else {
      whiteUser = userB;
      whiteSocket = socketB;
      blackUser = userA;
      blackSocket = socketA;
    }

    // Verify initial FEN
    assert.strictEqual(matchFrameA.payload.state.fen, 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1');
  });

  // 4. White makes legal first move e2 -> e4
  await test('Step 4: White plays legal move e2 to e4, both receive broadcast', async () => {
    whiteSocket.clear();
    blackSocket.clear();

    const whiteConn = whiteUser === userA ? connA : connB;

    await handleParsedMessage(
      { userId: whiteUser, connectionId: whiteConn },
      Buffer.from(JSON.stringify({
        type: 'game.move',
        requestId: 'req_move_1',
        payload: {
          gameId,
          from: 'e2',
          to: 'e4'
        }
      })),
      whiteSocket,
      app.log
    );

    // Both players should receive game.move broadcast from the room
    const whiteMoveFrame = whiteSocket.findSentByType('game.move')[0];
    const blackMoveFrame = blackSocket.findSentByType('game.move')[0];

    assert.ok(whiteMoveFrame, 'White received move result');
    assert.ok(blackMoveFrame, 'Black received move broadcast');

    assert.strictEqual(blackMoveFrame.payload.move.san, 'e4');
    assert.strictEqual(blackMoveFrame.payload.state.turn, 'b');
    assert.strictEqual(blackMoveFrame.payload.move.playerColor, 'w');
  });

  // 5. White tries to move again out of turn -> Server rejects
  await test('Step 5: White tries to play out of turn, server rejects with error', async () => {
    whiteSocket.clear();
    const whiteConn = whiteUser === userA ? connA : connB;

    await handleParsedMessage(
      { userId: whiteUser, connectionId: whiteConn },
      Buffer.from(JSON.stringify({
        type: 'game.move',
        requestId: 'req_move_illegal_turn',
        payload: {
          gameId,
          from: 'd2',
          to: 'd4'
        }
      })),
      whiteSocket,
      app.log
    );

    const errorFrame = whiteSocket.findSentByType('system.error')[0];
    assert.ok(errorFrame, 'White received system.error frame for out-of-turn move');
    assert.ok(errorFrame.error.message.includes('turn') || errorFrame.error.code.includes('MOVE') || errorFrame.error.code.includes('INVALID'));
  });

  // 6. Black plays legal move e7 -> e5
  await test('Step 6: Black plays legal move e7 to e5, turn returns to White', async () => {
    whiteSocket.clear();
    blackSocket.clear();

    const blackConn = blackUser === userA ? connA : connB;

    await handleParsedMessage(
      { userId: blackUser, connectionId: blackConn },
      Buffer.from(JSON.stringify({
        type: 'game.move',
        requestId: 'req_move_2',
        payload: {
          gameId,
          from: 'e7',
          to: 'e5'
        }
      })),
      blackSocket,
      app.log
    );

    const whiteMoveFrame = whiteSocket.findSentByType('game.move')[0];
    const blackMoveFrame = blackSocket.findSentByType('game.move')[0];

    assert.ok(whiteMoveFrame, 'White received Black move broadcast');
    assert.ok(blackMoveFrame, 'Black received move result');

    assert.strictEqual(whiteMoveFrame.payload.move.san, 'e5');
    assert.strictEqual(whiteMoveFrame.payload.state.turn, 'w');
  });

  // 7. Unauthorized third party (Charlie) tries to submit move -> Server rejects
  await test('Step 7: Unauthorized outsider (Charlie) attempts move, server rejects', async () => {
    socketC.clear();

    await handleParsedMessage(
      { userId: userC, connectionId: connC },
      Buffer.from(JSON.stringify({
        type: 'game.move',
        requestId: 'req_move_intruder',
        payload: {
          gameId,
          from: 'g1',
          to: 'f3'
        }
      })),
      socketC,
      app.log
    );

    const errorFrame = socketC.findSentByType('system.error')[0];
    assert.ok(errorFrame, 'Intruder received system.error frame');
    assert.ok(errorFrame.error.code.includes('PLAYER') || errorFrame.error.code.includes('INVALID') || errorFrame.error.message.includes('player'));
  });

  // 8. Disconnect and Reconnect synchronization
  await test('Step 8: Player disconnects and reconnects, successfully syncing state', async () => {
    // Simulate Bob disconnecting
    await gameManager.handlePlayerDisconnect(userB);

    // Alice receives player disconnected status
    const aliceDisconnectFrames = socketA.findSentByType('game.player_disconnected');
    assert.ok(aliceDisconnectFrames.length > 0, 'Alice notified of Bob disconnect');

    // Bob reconnects with new socket & connection
    const newConnB = 'conn_friend_bob_reconnected';
    const newSocketB = createMockSocket('Bob (Reconnected)');
    connectionRegistry.register(userB, newConnB, newSocketB);

    // Bob sends reconnect request
    await handleParsedMessage(
      { userId: userB, connectionId: newConnB },
      Buffer.from(JSON.stringify({
        type: 'game.reconnect',
        requestId: 'req_reconnect_1',
        payload: { gameId }
      })),
      newSocketB,
      app.log
    );

    const reconnectedFrame = newSocketB.findSentByType('game.reconnected')[0];
    assert.ok(reconnectedFrame, 'Bob received game.reconnected');
    assert.strictEqual(reconnectedFrame.payload.gameId, gameId);
    assert.strictEqual(reconnectedFrame.payload.state.turn, 'w');
    assert.strictEqual(reconnectedFrame.payload.moveHistory.length, 2, 'History has both moves e4, e5');

    // Clean up
    connectionRegistry.unregister(userA, connA);
    connectionRegistry.unregister(userB, connB);
    connectionRegistry.unregister(userB, newConnB);
    connectionRegistry.unregister(userC, connC);
  });

  console.log('\n📊 PLAY WITH FRIENDS FULL FLOW TEST SUMMARY:');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    throw new Error(`${failed} test(s) failed.`);
  } else {
    console.log('✨ Full-Flow End-to-End Integration Test Passed Flawlessly!\n');
  }
}

runFriendGameFullFlowIntegrationTest().catch((err) => {
  console.error('Fatal Test Suite Error:', err);
  process.exit(1);
});
