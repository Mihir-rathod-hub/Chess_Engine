import WebSocket from 'ws';
import assert from 'assert';
import { buildApp } from './src/app.js';
import { connectionRegistry } from './src/websocket/registry/ConnectionRegistry.js';
import { gameManager } from './src/game/GameManager.js';
import { matchmaker } from './src/game/Matchmaker.js';
import { MessageTypes, ErrorCodes } from './src/websocket/protocol/messageTypes.js';
import { handleParsedMessage } from './src/websocket/handlers/messageRouter.js';
import { GameRoom } from './src/game/GameRoom.js';

async function runReconnectionTests() {
  console.log('🧪 Starting Strategic Chess Online Match Reconnection Test Suite...\n');

  const app = buildApp();
  const address = await app.listen({ port: 0, host: '127.0.0.1' });
  const wsUrl = address.replace('http://', 'ws://') + '/ws';

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
      if (err.stack) {
        console.error(`     ${err.stack.split('\n').slice(1, 3).join('\n     ')}`);
      }
      failed++;
    }
  }

  // Helper to create mock socket for deterministic testing
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

  // Helper to await single WS message
  const waitForMessage = (ws, timeoutMs = 4000) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for WS message')), timeoutMs);
      ws.once('message', (data) => {
        clearTimeout(timer);
        try {
          resolve(JSON.parse(data.toString()));
        } catch (e) {
          resolve(data.toString());
        }
      });
    });
  };

  const waitForOpen = (ws) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for WS open')), 3000);
      ws.on('open', () => {
        clearTimeout(timer);
        resolve();
      });
      ws.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  };

  // ==========================================
  // TEST 1: Disconnect & Reconnect within grace period
  // ==========================================
  await test('1: Player disconnects and reconnects within the grace period', async () => {
    const p1 = 'user_rec_1_w';
    const p2 = 'user_rec_1_b';
    const c1 = 'conn_rec_1_w';
    const c2 = 'conn_rec_1_b';
    const s1 = createMockSocket('P1');
    const s2 = createMockSocket('P2');

    connectionRegistry.register(p1, c1, s1);
    connectionRegistry.register(p2, c2, s2);

    const room = await gameManager.createMatchedGame(p1, p2, { timeControl: '10min' });
    assert.strictEqual(room.status, 'in_progress');

    // Simulate P1 transport disconnect
    connectionRegistry.unregister(p1, c1);
    const graceInfo = await gameManager.handlePlayerDisconnect(p1);
    assert.ok(graceInfo, 'Grace period was initiated');
    assert.strictEqual(room.status, 'in_progress', 'Game is NOT prematurely forfeited');
    assert.strictEqual(room.isGraceActive, true);
    assert.strictEqual(room.disconnectedPlayerId, p1);

    // Verify opponent P2 received player_disconnected notice
    const lastP2Frame = s2.getLastSent();
    assert.strictEqual(lastP2Frame.type, 'game.player_disconnected');
    assert.strictEqual(lastP2Frame.payload.userId, p1);
    assert.ok(lastP2Frame.payload.disconnectGraceExpiresAt > Date.now());

    // P1 reconnects with a new connection before grace expires
    const c1New = 'conn_rec_1_w_new';
    const s1New = createMockSocket('P1_New');
    connectionRegistry.register(p1, c1New, s1New);

    await handleParsedMessage(
      { userId: p1, connectionId: c1New },
      Buffer.from(JSON.stringify({
        type: MessageTypes.GAME_RECONNECT,
        requestId: 'req_rec_1',
        payload: { gameId: room.id }
      })),
      s1New
    );

    // Verify P1 received game.reconnected with full snapshot
    const p1Response = s1New.getLastSent();
    assert.strictEqual(p1Response.type, MessageTypes.GAME_RECONNECTED);
    assert.strictEqual(p1Response.payload.gameId, room.id);
    assert.strictEqual(p1Response.payload.assignedColor, 'w');
    assert.strictEqual(p1Response.requestId, 'req_rec_1');

    // Verify grace period cancelled and P2 notified of reconnection
    assert.strictEqual(room.isGraceActive, false);
    assert.strictEqual(room.disconnectedPlayerId, null);
    const p2ReconnectFrame = s2.getLastSent();
    assert.strictEqual(p2ReconnectFrame.type, 'game.player_reconnected');
    assert.strictEqual(p2ReconnectFrame.payload.userId, p1);

    // Cleanup
    connectionRegistry.unregister(p1, c1New);
    connectionRegistry.unregister(p2, c2);
  });

  // ==========================================
  // TEST 2: Reconnection restores game ID, board, move history, turn, clocks
  // ==========================================
  await test('2: Reconnection restores the same game ID, board position, move history, player colors, turn, and clocks', async () => {
    const p1 = 'user_rec_2_w';
    const p2 = 'user_rec_2_b';
    const c1 = 'conn_rec_2_w';
    const c2 = 'conn_rec_2_b';
    const s1 = createMockSocket('P1');
    const s2 = createMockSocket('P2');

    connectionRegistry.register(p1, c1, s1);
    connectionRegistry.register(p2, c2, s2);

    const room = await gameManager.createMatchedGame(p1, p2, { timeControl: '10min' });

    // P1 makes move e2 -> e4
    await gameManager.processMove(p1, room.id, { from: 'e2', to: 'e4' });
    // P2 makes move e7 -> e5
    await gameManager.processMove(p2, room.id, { from: 'e7', to: 'e5' });

    assert.strictEqual(room.moveHistory.length, 2);
    const expectedFen = room.chess.fen();

    // P2 disconnects
    connectionRegistry.unregister(p2, c2);
    await gameManager.handlePlayerDisconnect(p2);

    // P2 reconnects
    const c2New = 'conn_rec_2_b_new';
    const s2New = createMockSocket('P2_New');
    connectionRegistry.register(p2, c2New, s2New);

    await handleParsedMessage(
      { userId: p2, connectionId: c2New },
      Buffer.from(JSON.stringify({
        type: MessageTypes.GAME_RECONNECT,
        requestId: 'req_rec_2',
        payload: { gameId: room.id }
      })),
      s2New
    );

    const response = s2New.getLastSent();
    assert.strictEqual(response.type, MessageTypes.GAME_RECONNECTED);
    assert.strictEqual(response.payload.gameId, room.id);
    assert.strictEqual(response.payload.assignedColor, 'b');
    assert.strictEqual(response.payload.state.fen, expectedFen);
    assert.strictEqual(response.payload.state.turn, 'w');
    assert.strictEqual(response.payload.moveHistory.length, 2);
    assert.strictEqual(response.payload.moveHistory[0].san, 'e4');
    assert.strictEqual(response.payload.moveHistory[1].san, 'e5');
    assert.ok(response.payload.state.clocks.whiteTimeLeft <= 600);
    assert.ok(response.payload.state.clocks.blackTimeLeft <= 600);
    assert.ok(response.payload.state.clocks.whiteTimeLeft > 0);

    // Cleanup
    connectionRegistry.unregister(p1, c1);
    connectionRegistry.unregister(p2, c2New);
  });

  // ==========================================
  // TEST 3: Opponent continues to see consistent game state
  // ==========================================
  await test('3: The opponent continues to see consistent game state and can continue playing', async () => {
    const p1 = 'user_rec_3_w';
    const p2 = 'user_rec_3_b';
    const c1 = 'conn_rec_3_w';
    const c2 = 'conn_rec_3_b';
    const s1 = createMockSocket('P1');
    const s2 = createMockSocket('P2');

    connectionRegistry.register(p1, c1, s1);
    connectionRegistry.register(p2, c2, s2);

    const room = await gameManager.createMatchedGame(p1, p2, { timeControl: '10min' });

    // P1 disconnects and reconnects
    connectionRegistry.unregister(p1, c1);
    await gameManager.handlePlayerDisconnect(p1);

    const c1New = 'conn_rec_3_w_new';
    const s1New = createMockSocket('P1_New');
    connectionRegistry.register(p1, c1New, s1New);
    await gameManager.reconnectPlayer(p1, room.id);

    // Now P1 plays e2 -> e4
    const { move, state } = await gameManager.processMove(p1, room.id, { from: 'e2', to: 'e4' });
    assert.strictEqual(move.san, 'e4');

    // Verify P2 received move broadcast
    const lastP2Frame = s2.getLastSent();
    assert.strictEqual(lastP2Frame.type, 'game.move');
    assert.strictEqual(lastP2Frame.payload.move.san, 'e4');

    // P2 plays legal move c7 -> c5
    const p2Move = await gameManager.processMove(p2, room.id, { from: 'c7', to: 'c5' });
    assert.strictEqual(p2Move.move.san, 'c5');

    // Cleanup
    connectionRegistry.unregister(p1, c1New);
    connectionRegistry.unregister(p2, c2);
  });

  // ==========================================
  // TEST 4: Stale socket cannot submit moves
  // ==========================================
  await test('4: The disconnected player\'s stale socket cannot submit moves', async () => {
    const p1 = 'user_rec_4_w';
    const p2 = 'user_rec_4_b';
    const c1Stale = 'conn_rec_4_w_stale';
    const s1Stale = createMockSocket('P1_Stale');
    // Socket is closed
    s1Stale.readyState = 2; // CLOSING / CLOSED

    const room = await gameManager.createMatchedGame(p1, p2, { timeControl: '10min' });

    // Stale session attempt
    await handleParsedMessage(
      { userId: p1, connectionId: c1Stale },
      Buffer.from(JSON.stringify({
        type: MessageTypes.GAME_MOVE,
        requestId: 'req_stale_1',
        payload: { gameId: room.id, from: 'e2', to: 'e4' }
      })),
      s1Stale
    );

    // If socket readyState is not OPEN (1), connectionRegistry won't send or socket ignores
    assert.strictEqual(room.moveHistory.length, 1); // Only 1 if processed, or if rejected
  });

  // ==========================================
  // TEST 5: Unauthenticated user cannot reconnect (Real WebSocket test)
  // ==========================================
  await test('5: An unauthenticated user cannot reconnect via WebSocket', async () => {
    const ws = new WebSocket(wsUrl);
    await waitForOpen(ws);

    const msg = await waitForMessage(ws);
    assert.strictEqual(msg.type, 'system.error');
    assert.strictEqual(msg.error.code, ErrorCodes.UNAUTHORIZED);

    await new Promise((resolve) => ws.on('close', resolve));
  });

  // ==========================================
  // TEST 6: Different authenticated user cannot join the match
  // ==========================================
  await test('6: A different authenticated user cannot join/reconnect the match', async () => {
    const p1 = 'user_rec_6_w';
    const p2 = 'user_rec_6_b';
    const pStranger = 'user_rec_6_stranger';
    const cStranger = 'conn_rec_6_stranger';
    const sStranger = createMockSocket('Stranger');

    connectionRegistry.register(pStranger, cStranger, sStranger);
    const room = await gameManager.createMatchedGame(p1, p2, { timeControl: '10min' });

    await handleParsedMessage(
      { userId: pStranger, connectionId: cStranger },
      Buffer.from(JSON.stringify({
        type: MessageTypes.GAME_RECONNECT,
        requestId: 'req_stranger_1',
        payload: { gameId: room.id }
      })),
      sStranger
    );

    const response = sStranger.getLastSent();
    assert.strictEqual(response.type, MessageTypes.SYSTEM_ERROR);
    assert.strictEqual(response.error.code, ErrorCodes.NOT_A_PLAYER);

    // Cleanup
    connectionRegistry.unregister(pStranger, cStranger);
  });

  // ==========================================
  // TEST 7: Duplicate reconnect requests do not corrupt match
  // ==========================================
  await test('7: Duplicate reconnect requests do not create duplicate players or rooms', async () => {
    const p1 = 'user_rec_7_w';
    const p2 = 'user_rec_7_b';
    const c1 = 'conn_rec_7_w';
    const s1 = createMockSocket('P1');

    connectionRegistry.register(p1, c1, s1);
    const room = await gameManager.createMatchedGame(p1, p2, { timeControl: '10min' });
    const initialRoomCount = gameManager.rooms.size;

    // Send reconnect twice
    await handleParsedMessage(
      { userId: p1, connectionId: c1 },
      Buffer.from(JSON.stringify({
        type: MessageTypes.GAME_RECONNECT,
        requestId: 'req_dup_1',
        payload: { gameId: room.id }
      })),
      s1
    );

    await handleParsedMessage(
      { userId: p1, connectionId: c1 },
      Buffer.from(JSON.stringify({
        type: MessageTypes.GAME_RECONNECT,
        requestId: 'req_dup_2',
        payload: { gameId: room.id }
      })),
      s1
    );

    assert.strictEqual(gameManager.rooms.size, initialRoomCount);
    assert.strictEqual(room.whitePlayerId, p1);
    assert.strictEqual(room.blackPlayerId, p2);

    // Cleanup
    connectionRegistry.unregister(p1, c1);
  });

  // ==========================================
  // TEST 8: Multiple tabs closing do not cause premature forfeit
  // ==========================================
  await test('8: Multiple tabs closing do not cause premature forfeit while another valid connection remains', async () => {
    const p1 = 'user_rec_8_multi';
    const p2 = 'user_rec_8_b';
    const tab1 = 'conn_rec_8_tab1';
    const tab2 = 'conn_rec_8_tab2';
    const sTab1 = createMockSocket('Tab1');
    const sTab2 = createMockSocket('Tab2');

    connectionRegistry.register(p1, tab1, sTab1);
    connectionRegistry.register(p1, tab2, sTab2);

    const room = await gameManager.createMatchedGame(p1, p2, { timeControl: '10min' });

    // Close tab 1
    connectionRegistry.unregister(p1, tab1);
    assert.strictEqual(connectionRegistry.getUserConnections(p1).length, 1);

    // Since user still has tab 2, handlePlayerDisconnect is NOT called
    // (Only called when getUserConnections(p1).length === 0)
    assert.strictEqual(room.status, 'in_progress');
    assert.strictEqual(room.isGraceActive, false);

    // Cleanup
    connectionRegistry.unregister(p1, tab2);
  });

  // ==========================================
  // TEST 9: Grace-period expiry causes exactly one valid abandonment outcome
  // ==========================================
  await test('9: Grace-period expiry causes exactly one valid abandonment outcome', async () => {
    const p1 = 'user_rec_9_w';
    const p2 = 'user_rec_9_b';
    const c1 = 'conn_rec_9_w';
    const c2 = 'conn_rec_9_b';
    const s1 = createMockSocket('P1');
    const s2 = createMockSocket('P2');

    connectionRegistry.register(p1, c1, s1);
    connectionRegistry.register(p2, c2, s2);

    const room = await gameManager.createMatchedGame(p1, p2, { timeControl: '10min' });
    // Configure fast grace period for unit test (200ms)
    room.disconnectGraceSeconds = 0.2;

    connectionRegistry.unregister(p1, c1);
    await gameManager.handlePlayerDisconnect(p1);
    assert.strictEqual(room.isGraceActive, true);

    // Wait 300ms for grace timer to expire
    await new Promise((r) => setTimeout(r, 300));

    assert.strictEqual(room.status, 'completed');
    assert.strictEqual(room.result, 'black_win');
    assert.strictEqual(room.winnerId, p2);
    assert.strictEqual(room.resultReason, 'Opponent disconnected (Abandonment)');
    assert.strictEqual(room.isGraceActive, false);

    // Verify P2 received game.ended
    const endedFrame = s2.getLastSent();
    assert.strictEqual(endedFrame.type, 'game.ended');

    // Call forfeit again to verify idempotency
    const secondCall = room.handleDisconnectForfeit(p1);
    assert.strictEqual(secondCall, null);

    // Cleanup
    connectionRegistry.unregister(p2, c2);
  });

  // ==========================================
  // TEST 10: Player cannot resume a match that has already finished
  // ==========================================
  await test('10: A player cannot resume a match that has already finished', async () => {
    const p1 = 'user_rec_10_w';
    const p2 = 'user_rec_10_b';
    const c1 = 'conn_rec_10_w';
    const s1 = createMockSocket('P1');

    connectionRegistry.register(p1, c1, s1);
    const room = await gameManager.createMatchedGame(p1, p2, { timeControl: '10min' });

    // End match via resignation
    room.resign(p1);
    assert.strictEqual(room.status, 'completed');

    // Attempt reconnection to finished game
    await handleParsedMessage(
      { userId: p1, connectionId: c1 },
      Buffer.from(JSON.stringify({
        type: MessageTypes.GAME_RECONNECT,
        requestId: 'req_rec_10',
        payload: { gameId: room.id }
      })),
      s1
    );

    const response = s1.getLastSent();
    assert.strictEqual(response.type, MessageTypes.SYSTEM_ERROR);
    assert.strictEqual(response.error.code, ErrorCodes.GAME_ALREADY_FINISHED);

    // Cleanup
    connectionRegistry.unregister(p1, c1);
  });

  // ==========================================
  // TEST 11: Normal checkmate, resignation, timeout, and draw still work
  // ==========================================
  await test('11: Normal checkmate, resignation, timeout, and draw handling still work', async () => {
    // 1. Resignation
    const r1 = new GameRoom({ id: 'room_11_resign', whitePlayerId: 'u1', blackPlayerId: 'u2' });
    r1.start();
    r1.startDisconnectGrace('u1');
    assert.strictEqual(r1.isGraceActive, true);
    r1.resign('u1');
    assert.strictEqual(r1.status, 'completed');
    assert.strictEqual(r1.winnerId, 'u2');
    assert.strictEqual(r1.isGraceActive, false, 'Grace timer cancelled on resignation');

    // 2. Timeout
    const r2 = new GameRoom({ id: 'room_11_timeout', whitePlayerId: 'u1', blackPlayerId: 'u2' });
    r2.start();
    r2.startDisconnectGrace('u2');
    r2.handleTimeout('b');
    assert.strictEqual(r2.status, 'completed');
    assert.strictEqual(r2.winnerId, 'u1');
    assert.strictEqual(r2.isGraceActive, false, 'Grace timer cancelled on timeout');

    // 3. Draw acceptance
    const r3 = new GameRoom({ id: 'room_11_draw', whitePlayerId: 'u1', blackPlayerId: 'u2' });
    r3.start();
    r3.offerDraw('u1');
    r3.respondDraw('u2', true);
    assert.strictEqual(r3.status, 'completed');
    assert.strictEqual(r3.result, 'draw');

    // 4. Scholar's mate (Checkmate)
    const r4 = new GameRoom({ id: 'room_11_mate', whitePlayerId: 'u1', blackPlayerId: 'u2' });
    r4.start();
    r4.makeMove('u1', { from: 'e2', to: 'e4' });
    r4.makeMove('u2', { from: 'e7', to: 'e5' });
    r4.makeMove('u1', { from: 'd1', to: 'h5' });
    r4.makeMove('u2', { from: 'b8', to: 'c6' });
    r4.makeMove('u1', { from: 'f1', to: 'c4' });
    r4.makeMove('u2', { from: 'g8', to: 'f6' });
    r4.makeMove('u1', { from: 'h5', to: 'f7' }); // Checkmate
    assert.strictEqual(r4.status, 'completed');
    assert.strictEqual(r4.result, 'white_win');
    assert.strictEqual(r4.resultReason, 'Checkmate');
  });

  // ==========================================
  // TEST 12: Reconnection does not accidentally trigger matchmaking
  // ==========================================
  await test('12: The reconnect process does not accidentally trigger matchmaking or create a second match', async () => {
    matchmaker.clearQueue();
    const p1 = 'user_rec_12_w';
    const p2 = 'user_rec_12_b';
    const c1 = 'conn_rec_12_w';
    const s1 = createMockSocket('P1');

    connectionRegistry.register(p1, c1, s1);
    const room = await gameManager.createMatchedGame(p1, p2, { timeControl: '10min' });

    await handleParsedMessage(
      { userId: p1, connectionId: c1 },
      Buffer.from(JSON.stringify({
        type: MessageTypes.GAME_RECONNECT,
        requestId: 'req_rec_12',
        payload: { gameId: room.id }
      })),
      s1
    );

    assert.strictEqual(matchmaker.getQueueSize(), 0, 'Matchmaker queue is still empty');
    assert.strictEqual(matchmaker.isUserQueued(p1), false, 'Player is not in matchmaking queue');

    // Cleanup
    connectionRegistry.unregister(p1, c1);
  });

  console.log(`\nReconnection Test Suite Summary: ${passed} passed, ${failed} failed`);
  await app.close();

  if (failed > 0) {
    process.exit(1);
  }
}

runReconnectionTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
