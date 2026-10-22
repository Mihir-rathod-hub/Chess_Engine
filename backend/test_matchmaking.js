import assert from 'assert';
import { buildApp } from './src/app.js';
import { connectionRegistry } from './src/websocket/registry/ConnectionRegistry.js';
import { gameManager } from './src/game/GameManager.js';
import { matchmaker } from './src/game/Matchmaker.js';
import { handleParsedMessage } from './src/websocket/handlers/messageRouter.js';

async function runMatchmakingTests() {
  console.log('🧪 Starting Step 4F-C Authoritative Matchmaking Tests...\n');

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

  // Helper to create mock socket
  function createMockSocket(name) {
    const socket = {
      name,
      readyState: 1, // 1 = OPEN
      sentFrames: [],
      send: (data) => {
        socket.sentFrames.push(JSON.parse(data));
      },
      getLastSent: () => socket.sentFrames[socket.sentFrames.length - 1] || null,
      clear: () => { socket.sentFrames = []; }
    };
    return socket;
  }

  // Clear queue before tests
  matchmaker.clearQueue();

  // 1. First player enters queue
  await test('1: First player enters queue and receives game.queued', async () => {
    matchmaker.clearQueue();
    const user1 = 'user_test_mm_1';
    const conn1 = 'conn_test_mm_1';
    const socket1 = createMockSocket('User1');
    connectionRegistry.register(user1, conn1, socket1);

    await handleParsedMessage(
      { userId: user1, connectionId: conn1 },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        requestId: 'req_mm_1',
        payload: { timeControl: '10min', gameType: 'casual' }
      })),
      socket1,
      app.log
    );

    const lastMsg = socket1.getLastSent();
    assert.ok(lastMsg, 'Message was sent');
    assert.strictEqual(lastMsg.type, 'game.queued', 'Response type is game.queued');
    assert.strictEqual(lastMsg.requestId, 'req_mm_1', 'RequestId matches');
    assert.strictEqual(lastMsg.payload.status, 'waiting', 'Status is waiting');
    assert.strictEqual(matchmaker.getQueueSize(), 1, 'Queue has 1 waiting player');
    assert.strictEqual(matchmaker.isUserQueued(user1), true, 'User1 is marked queued');

    connectionRegistry.unregister(user1, conn1);
  });

  // 2, 3, 4, 9: Second compatible player matches into ONE authoritative room
  await test('2, 3, 4, 9: Second compatible player matches, both receive same gameId, different colors, one GameRoom created', async () => {
    matchmaker.clearQueue();
    const roomsBefore = gameManager.rooms.size;

    const userWhite = 'user_white_mm';
    const connWhite = 'conn_white_mm';
    const socketWhite = createMockSocket('White');
    connectionRegistry.register(userWhite, connWhite, socketWhite);

    const userBlack = 'user_black_mm';
    const connBlack = 'conn_black_mm';
    const socketBlack = createMockSocket('Black');
    connectionRegistry.register(userBlack, connBlack, socketBlack);

    // Player 1 enters queue
    await handleParsedMessage(
      { userId: userWhite, connectionId: connWhite },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        requestId: 'req_w_join',
        payload: { timeControl: '10min', gameType: 'casual' }
      })),
      socketWhite,
      app.log
    );
    assert.strictEqual(socketWhite.getLastSent().type, 'game.queued');

    // Player 2 enters queue with compatible parameters
    await handleParsedMessage(
      { userId: userBlack, connectionId: connBlack },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        requestId: 'req_b_join',
        payload: { timeControl: '10min', gameType: 'casual' }
      })),
      socketBlack,
      app.log
    );

    // Both sockets must have received game.matched
    const whiteMatch = socketWhite.getLastSent();
    const blackMatch = socketBlack.getLastSent();

    assert.strictEqual(whiteMatch.type, 'game.matched', 'White received game.matched');
    assert.strictEqual(blackMatch.type, 'game.matched', 'Black received game.matched');

    // 3: Both receive the same gameId
    assert.ok(whiteMatch.payload.gameId, 'White has gameId');
    assert.ok(blackMatch.payload.gameId, 'Black has gameId');
    assert.strictEqual(whiteMatch.payload.gameId, blackMatch.payload.gameId, 'Both players received identical gameId');

    // 4: Players receive different colors (White and Black)
    assert.strictEqual(whiteMatch.payload.assignedColor, 'w', 'First queued player is assigned White');
    assert.strictEqual(blackMatch.payload.assignedColor, 'b', 'Second queued player is assigned Black');

    // 9: Only ONE GameRoom is created for the match
    assert.strictEqual(gameManager.rooms.size, roomsBefore + 1, 'Exactly one GameRoom was created');
    const createdRoom = gameManager.getRoom(whiteMatch.payload.gameId);
    assert.ok(createdRoom, 'GameRoom exists in GameManager');
    assert.strictEqual(createdRoom.whitePlayerId, userWhite);
    assert.strictEqual(createdRoom.blackPlayerId, userBlack);
    assert.strictEqual(createdRoom.status, 'in_progress', 'Room status is in_progress');

    // Queue must now be empty
    assert.strictEqual(matchmaker.getQueueSize(), 0, 'Queue is empty after match');

    connectionRegistry.unregister(userWhite, connWhite);
    connectionRegistry.unregister(userBlack, connBlack);
  });

  // 5: Incompatible time controls do not match
  await test('5: Incompatible time controls do not match', async () => {
    matchmaker.clearQueue();
    const userA = 'user_incomp_1';
    const connA = 'conn_incomp_1';
    const socketA = createMockSocket('UserA');
    connectionRegistry.register(userA, connA, socketA);

    const userB = 'user_incomp_2';
    const connB = 'conn_incomp_2';
    const socketB = createMockSocket('UserB');
    connectionRegistry.register(userB, connB, socketB);

    // User A wants 10min
    await handleParsedMessage(
      { userId: userA, connectionId: connA },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        requestId: 'req_a',
        payload: { timeControl: '10min', gameType: 'casual' }
      })),
      socketA,
      app.log
    );

    // User B wants 3min
    await handleParsedMessage(
      { userId: userB, connectionId: connB },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        requestId: 'req_b',
        payload: { timeControl: '3min', gameType: 'casual' }
      })),
      socketB,
      app.log
    );

    assert.strictEqual(socketA.getLastSent().type, 'game.queued', 'User A remains queued');
    assert.strictEqual(socketB.getLastSent().type, 'game.queued', 'User B remains queued');
    assert.strictEqual(matchmaker.getQueueSize(), 2, 'Both users are in queue awaiting compatible matches');

    connectionRegistry.unregister(userA, connA);
    connectionRegistry.unregister(userB, connB);
    matchmaker.clearQueue();
  });

  // 6: Same user cannot match with themselves
  await test('6: Same user cannot match with themselves', async () => {
    matchmaker.clearQueue();
    const userId = 'user_self_test';
    const conn1 = 'conn_self_1';
    const socket1 = createMockSocket('Conn1');
    connectionRegistry.register(userId, conn1, socket1);

    const conn2 = 'conn_self_2';
    const socket2 = createMockSocket('Conn2');
    connectionRegistry.register(userId, conn2, socket2);

    // User queues on conn1
    await handleParsedMessage(
      { userId, connectionId: conn1 },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        requestId: 'req_self_1',
        payload: { timeControl: '10min', gameType: 'casual' }
      })),
      socket1,
      app.log
    );

    // User attempts to queue again on conn2 -> Must be rejected with ALREADY_QUEUED
    await handleParsedMessage(
      { userId, connectionId: conn2 },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        requestId: 'req_self_2',
        payload: { timeControl: '10min', gameType: 'casual' }
      })),
      socket2,
      app.log
    );

    const rejectMsg = socket2.getLastSent();
    assert.strictEqual(rejectMsg.type, 'system.error');
    assert.strictEqual(rejectMsg.error.code, 'ALREADY_QUEUED');
    assert.strictEqual(matchmaker.getQueueSize(), 1, 'Queue still only has original entry');

    connectionRegistry.unregister(userId, conn1);
    connectionRegistry.unregister(userId, conn2);
    matchmaker.clearQueue();
  });

  // 7: Duplicate queue request from same user is prevented
  await test('7: Duplicate queue request from same user is prevented', async () => {
    matchmaker.clearQueue();
    const userId = 'user_dup_test';
    const connId = 'conn_dup_test';
    const socket = createMockSocket('Dup');
    connectionRegistry.register(userId, connId, socket);

    await handleParsedMessage(
      { userId, connectionId: connId },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        requestId: 'req_dup_1',
        payload: { timeControl: '5min', gameType: 'casual' }
      })),
      socket,
      app.log
    );
    assert.strictEqual(socket.getLastSent().type, 'game.queued');

    // Duplicate request
    await handleParsedMessage(
      { userId, connectionId: connId },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        requestId: 'req_dup_2',
        payload: { timeControl: '5min', gameType: 'casual' }
      })),
      socket,
      app.log
    );

    const dupReject = socket.getLastSent();
    assert.strictEqual(dupReject.type, 'system.error');
    assert.strictEqual(dupReject.error.code, 'ALREADY_QUEUED');

    connectionRegistry.unregister(userId, connId);
    matchmaker.clearQueue();
  });

  // 8: Disconnect/cancel removes the waiting player
  await test('8: Disconnect or cancel removes the waiting player safely', async () => {
    matchmaker.clearQueue();
    const userCancel = 'user_cancel_1';
    const connCancel = 'conn_cancel_1';
    const socketCancel = createMockSocket('Cancel');
    connectionRegistry.register(userCancel, connCancel, socketCancel);

    // User queues
    await handleParsedMessage(
      { userId: userCancel, connectionId: connCancel },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        requestId: 'req_c_1',
        payload: { timeControl: '10min', gameType: 'casual' }
      })),
      socketCancel,
      app.log
    );
    assert.strictEqual(matchmaker.getQueueSize(), 1);

    // User sends game.matchmake_cancel
    await handleParsedMessage(
      { userId: userCancel, connectionId: connCancel },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake_cancel',
        requestId: 'req_c_2',
        payload: {}
      })),
      socketCancel,
      app.log
    );

    const cancelResp = socketCancel.getLastSent();
    assert.strictEqual(cancelResp.type, 'game.matchmake_cancelled');
    assert.strictEqual(cancelResp.payload.cancelled, true);
    assert.strictEqual(matchmaker.getQueueSize(), 0, 'Player removed on cancel');

    // Test disconnect removal
    const userDisc = 'user_disc_1';
    const connDisc = 'conn_disc_1';
    const socketDisc = createMockSocket('Disc');
    connectionRegistry.register(userDisc, connDisc, socketDisc);

    await handleParsedMessage(
      { userId: userDisc, connectionId: connDisc },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        payload: { timeControl: '10min' }
      })),
      socketDisc,
      app.log
    );
    assert.strictEqual(matchmaker.getQueueSize(), 1);

    // Simulate connection drop
    matchmaker.removeConnection(connDisc);
    matchmaker.removeUser(userDisc);
    assert.strictEqual(matchmaker.getQueueSize(), 0, 'Player removed on disconnect');

    connectionRegistry.unregister(userCancel, connCancel);
    connectionRegistry.unregister(userDisc, connDisc);
  });

  // 10: Matched players can continue into the existing authoritative move flow
  await test('10: Matched players continue seamlessly into authoritative game.move and game.resign flow', async () => {
    matchmaker.clearQueue();
    const userW = 'user_gameflow_w';
    const connW = 'conn_gameflow_w';
    const sockW = createMockSocket('W');
    connectionRegistry.register(userW, connW, sockW);

    const userB = 'user_gameflow_b';
    const connB = 'conn_gameflow_b';
    const sockB = createMockSocket('B');
    connectionRegistry.register(userB, connB, sockB);

    // Match them
    await handleParsedMessage(
      { userId: userW, connectionId: connW },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      sockW,
      app.log
    );
    await handleParsedMessage(
      { userId: userB, connectionId: connB },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      sockB,
      app.log
    );

    const gameId = sockW.getLastSent().payload.gameId;
    assert.ok(gameId, 'Valid gameId');

    // 10a. White plays 1. e4
    await handleParsedMessage(
      { userId: userW, connectionId: connW },
      Buffer.from(JSON.stringify({
        type: 'game.move',
        requestId: 'req_w_move1',
        payload: { gameId, from: 'e2', to: 'e4', promotion: 'q' }
      })),
      sockW,
      app.log
    );
    const whiteMove = sockW.getLastSent();
    assert.strictEqual(whiteMove.type, 'game.move');
    assert.strictEqual(whiteMove.payload.move.san, 'e4');
    assert.strictEqual(whiteMove.payload.state.turn, 'b');

    // 10b. Black plays 1... e5
    await handleParsedMessage(
      { userId: userB, connectionId: connB },
      Buffer.from(JSON.stringify({
        type: 'game.move',
        requestId: 'req_b_move1',
        payload: { gameId, from: 'e7', to: 'e5', promotion: 'q' }
      })),
      sockB,
      app.log
    );
    const blackMove = sockB.getLastSent();
    assert.strictEqual(blackMove.type, 'game.move');
    assert.strictEqual(blackMove.payload.move.san, 'e5');
    assert.strictEqual(blackMove.payload.state.turn, 'w');

    // 10c. White resigns -> Black wins
    await handleParsedMessage(
      { userId: userW, connectionId: connW },
      Buffer.from(JSON.stringify({
        type: 'game.resign',
        requestId: 'req_w_resign',
        payload: { gameId }
      })),
      sockW,
      app.log
    );
    const resignResp = sockW.getLastSent();
    assert.strictEqual(resignResp.type, 'game.ended');
    assert.strictEqual(resignResp.payload.state.result, 'black_win');
    assert.strictEqual(resignResp.payload.state.winnerId, userB);

    connectionRegistry.unregister(userW, connW);
    connectionRegistry.unregister(userB, connB);
  });

  // 11: Authenticated player display names and ratings are correctly exchanged in game.matched
  await test('11: Authenticated player display names and ratings are correctly transmitted in game.matched', async () => {
    matchmaker.clearQueue();

    const userP1 = 'user_grandmaster_1';
    const connP1 = 'conn_gm_1';
    const socketP1 = createMockSocket('P1');
    const profileP1 = { id: userP1, full_name: 'Magnus C.', rating: 2850, skill_level: 'Grandmaster' };
    connectionRegistry.register(userP1, connP1, socketP1, { fullName: profileP1.full_name });

    const userP2 = 'user_challenger_2';
    const connP2 = 'conn_ch_2';
    const socketP2 = createMockSocket('P2');
    const profileP2 = { id: userP2, full_name: 'Hikaru N.', rating: 2820, skill_level: 'Grandmaster' };
    connectionRegistry.register(userP2, connP2, socketP2, { fullName: profileP2.full_name });

    // P1 enters queue with profile
    await handleParsedMessage(
      { userId: userP1, connectionId: connP1, profile: profileP1 },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        requestId: 'req_p1_match',
        payload: { timeControl: '5min', gameType: 'casual' }
      })),
      socketP1,
      app.log
    );

    // P2 enters queue with profile -> instant match
    await handleParsedMessage(
      { userId: userP2, connectionId: connP2, profile: profileP2 },
      Buffer.from(JSON.stringify({
        type: 'game.matchmake',
        requestId: 'req_p2_match',
        payload: { timeControl: '5min', gameType: 'casual' }
      })),
      socketP2,
      app.log
    );

    const p1Frame = socketP1.getLastSent();
    const p2Frame = socketP2.getLastSent();

    assert.strictEqual(p1Frame.type, 'game.matched');
    assert.strictEqual(p2Frame.type, 'game.matched');

    // P1 sees P2's display name and rating
    assert.ok(p1Frame.payload.opponent, 'P1 has opponent object');
    assert.strictEqual(p1Frame.payload.opponent.id, userP2);
    assert.strictEqual(p1Frame.payload.opponent.name, 'Hikaru N.');
    assert.strictEqual(p1Frame.payload.opponent.rating, 2820);

    // P2 sees P1's display name and rating
    assert.ok(p2Frame.payload.opponent, 'P2 has opponent object');
    assert.strictEqual(p2Frame.payload.opponent.id, userP1);
    assert.strictEqual(p2Frame.payload.opponent.name, 'Magnus C.');
    assert.strictEqual(p2Frame.payload.opponent.rating, 2850);

    connectionRegistry.unregister(userP1, connP1);
    connectionRegistry.unregister(userP2, connP2);
  });

  // 12: Active match disconnect-forfeit policy terminates game, notifies opponent, and rejects further moves
  await test('12: Active match disconnect terminates game with Opponent disconnected, notifies opponent, and rejects subsequent moves', async () => {
    matchmaker.clearQueue();

    const userStay = 'user_staying_1';
    const connStay = 'conn_staying_1';
    const sockStay = createMockSocket('Staying');
    connectionRegistry.register(userStay, connStay, sockStay);

    const userLeave = 'user_leaving_2';
    const connLeave = 'conn_leaving_2';
    const sockLeave = createMockSocket('Leaving');
    connectionRegistry.register(userLeave, connLeave, sockLeave);

    // Match them
    await handleParsedMessage(
      { userId: userStay, connectionId: connStay },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      sockStay,
      app.log
    );
    await handleParsedMessage(
      { userId: userLeave, connectionId: connLeave },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      sockLeave,
      app.log
    );

    const gameId = sockStay.getLastSent().payload.gameId;
    const room = gameManager.getRoom(gameId);
    assert.ok(room, 'GameRoom exists');
    assert.strictEqual(room.status, 'in_progress', 'Room is active and in_progress');

    // Simulate userLeave closing tab/refreshing browser (disconnect)
    connectionRegistry.unregister(userLeave, connLeave);
    assert.strictEqual(connectionRegistry.getUserConnections(userLeave).length, 0);

    // Trigger disconnect handling (initiates grace period)
    await gameManager.handlePlayerDisconnect(userLeave);

    // Assert room state during grace period
    assert.strictEqual(room.status, 'in_progress', 'Room is preserved in_progress during grace period');
    assert.strictEqual(room.isGraceActive, true, 'Grace period is active');
    assert.strictEqual(sockStay.getLastSent().type, 'game.player_disconnected', 'Opponent received game.player_disconnected');

    // When grace expires without reconnection, forfeit occurs
    await gameManager.handleDisconnectForfeit(userLeave, room.id);
    assert.strictEqual(room.status, 'completed', 'Room is marked completed after forfeit');
    assert.strictEqual(room.winnerId, userStay, 'Staying player is declared winner');

    // Assert staying player received game.ended frame over WebSocket
    const lastFrame = sockStay.getLastSent();
    assert.strictEqual(lastFrame.type, 'game.ended', 'Staying socket received game.ended');
    assert.strictEqual(lastFrame.payload.state.status, 'completed');
    assert.strictEqual(lastFrame.payload.state.winnerId, userStay);

    // Assert subsequent moves on finished room are rejected
    assert.throws(
      () => {
        room.makeMove(userStay, { from: 'e2', to: 'e4' });
      },
      (err) => err.message.includes('Game is not in progress')
    );

    connectionRegistry.unregister(userStay, connStay);
  });

  // 13: Neutral fallback when profile fields are missing (no fabricated 1200 or hardcoded names)
  await test('13: Missing profile fields use neutral fallback without fabricating 1200 rating', async () => {
    matchmaker.clearQueue();

    const u1 = 'user_anon_1';
    const c1 = 'conn_anon_1';
    const s1 = createMockSocket('S1');
    connectionRegistry.register(u1, c1, s1);

    const u2 = 'user_anon_2';
    const c2 = 'conn_anon_2';
    const s2 = createMockSocket('S2');
    connectionRegistry.register(u2, c2, s2);

    // Both enter with empty profile
    await handleParsedMessage(
      { userId: u1, connectionId: c1, profile: null },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      s1,
      app.log
    );
    await handleParsedMessage(
      { userId: u2, connectionId: c2, profile: null },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      s2,
      app.log
    );

    const matchFrame = s1.getLastSent();
    assert.strictEqual(matchFrame.type, 'game.matched');
    assert.ok(matchFrame.payload.opponent, 'Has opponent object');
    assert.strictEqual(matchFrame.payload.opponent.name, 'Opponent', 'Neutral fallback Opponent');
    assert.strictEqual(matchFrame.payload.opponent.rating, null, 'Rating is null, not fabricated 1200');
    assert.strictEqual(matchFrame.payload.opponent.avatar, '/pixel_avatar.jpg', 'Real avatar path');

    connectionRegistry.unregister(u1, c1);
    connectionRegistry.unregister(u2, c2);
  });

  // 14: Starting a second match after a completed match works seamlessly
  await test('14: Starting a second match after a completed match creates a new room', async () => {
    matchmaker.clearQueue();

    const p1 = 'user_rematch_1';
    const c1 = 'conn_rematch_1';
    const s1 = createMockSocket('P1');
    connectionRegistry.register(p1, c1, s1, { rating: 1300, fullName: 'Alice' });

    const p2 = 'user_rematch_2';
    const c2 = 'conn_rematch_2';
    const s2 = createMockSocket('P2');
    connectionRegistry.register(p2, c2, s2, { rating: 1350, fullName: 'Bob' });

    // Match 1
    await handleParsedMessage(
      { userId: p1, connectionId: c1, profile: { rating: 1300, full_name: 'Alice' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      s1,
      app.log
    );
    await handleParsedMessage(
      { userId: p2, connectionId: c2, profile: { rating: 1350, full_name: 'Bob' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      s2,
      app.log
    );

    const match1Frame = s1.getLastSent();
    assert.strictEqual(match1Frame.type, 'game.matched');
    const gameId1 = match1Frame.payload.gameId;

    // Conclude Match 1 via resignation
    await gameManager.processResign(p1, gameId1);
    const room1 = gameManager.getRoom(gameId1);
    assert.strictEqual(room1.status, 'completed', 'Room 1 completed');

    // Both players requeue for Match 2
    s1.clear();
    s2.clear();

    await handleParsedMessage(
      { userId: p1, connectionId: c1, profile: { rating: 1300, full_name: 'Alice' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      s1,
      app.log
    );
    const queueFrameP1 = s1.getLastSent();
    assert.strictEqual(queueFrameP1.type, 'game.queued');

    await handleParsedMessage(
      { userId: p2, connectionId: c2, profile: { rating: 1350, full_name: 'Bob' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      s2,
      app.log
    );
    const match2Frame = s1.getLastSent();
    assert.strictEqual(match2Frame.type, 'game.matched');
    const gameId2 = match2Frame.payload.gameId;
    assert.notStrictEqual(gameId1, gameId2, 'A distinct new game room was created for match 2');

    connectionRegistry.unregister(p1, c1);
    connectionRegistry.unregister(p2, c2);
  });

  // 15: Starting a second match after a disconnect-forfeit
  await test('15: Starting a second match after disconnect forfeit proceeds smoothly', async () => {
    matchmaker.clearQueue();

    const p1 = 'user_forfeit_rematch_1';
    const c1 = 'conn_forfeit_rematch_1';
    const s1 = createMockSocket('P1');
    connectionRegistry.register(p1, c1, s1, { rating: 1400, fullName: 'Grandmaster Grace' });

    const p2 = 'user_forfeit_rematch_2';
    const c2 = 'conn_forfeit_rematch_2';
    const s2 = createMockSocket('P2');
    connectionRegistry.register(p2, c2, s2, { rating: 1450, fullName: 'Henry' });

    // Match 1 starts
    await handleParsedMessage(
      { userId: p1, connectionId: c1, profile: { rating: 1400, full_name: 'Grandmaster Grace' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      s1,
      app.log
    );
    await handleParsedMessage(
      { userId: p2, connectionId: c2, profile: { rating: 1450, full_name: 'Henry' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      s2,
      app.log
    );

    const m1 = s1.getLastSent();
    const game1Id = m1.payload.gameId;

    // P2 disconnects during match (e.g. browser refresh)
    matchmaker.removeConnection(c2);
    matchmaker.removeUser(p2);
    connectionRegistry.unregister(p2, c2);
    await gameManager.handlePlayerDisconnect(p2);
    // Grace period expires, finalizing forfeit
    await gameManager.handleDisconnectForfeit(p2, game1Id);

    const room1 = gameManager.getRoom(game1Id);
    assert.strictEqual(room1.status, 'completed', 'Room completed by disconnect forfeit');

    // P1 (who stayed connected) attempts to start another match
    s1.clear();
    await handleParsedMessage(
      { userId: p1, connectionId: c1, profile: { rating: 1400, full_name: 'Grandmaster Grace' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      s1,
      app.log
    );
    assert.strictEqual(s1.getLastSent().type, 'game.queued', 'P1 enters queue waiting for opponent');

    // P2 re-authenticates on refreshed browser with new connection and queues
    const c2_new = 'conn_forfeit_rematch_2_refreshed';
    const s2_new = createMockSocket('P2_refreshed');
    connectionRegistry.register(p2, c2_new, s2_new, { rating: 1450, fullName: 'Henry' });

    await handleParsedMessage(
      { userId: p2, connectionId: c2_new, profile: { rating: 1450, full_name: 'Henry' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      s2_new,
      app.log
    );

    const m2 = s1.getLastSent();
    assert.strictEqual(m2.type, 'game.matched', 'P1 matched into new match');
    assert.notStrictEqual(m2.payload.gameId, game1Id, 'New room created after forfeit');

    connectionRegistry.unregister(p1, c1);
    connectionRegistry.unregister(p2, c2_new);
  });

  // 16: Persisted ratings and genuine unrated cases are delivered accurately in payload
  await test('16: Both players actual persisted ratings and genuine unrated are accurately transmitted', async () => {
    matchmaker.clearQueue();

    // Player A has persisted 1650 rating
    const pA = 'user_rated_a';
    const cA = 'conn_rated_a';
    const sA = createMockSocket('PA');
    connectionRegistry.register(pA, cA, sA, { rating: 1650, fullName: 'Rated Player A' });

    // Player B has persisted 1520 rating
    const pB = 'user_rated_b';
    const cB = 'conn_rated_b';
    const sB = createMockSocket('PB');
    connectionRegistry.register(pB, cB, sB, { rating: 1520, fullName: 'Rated Player B' });

    await handleParsedMessage(
      { userId: pA, connectionId: cA, profile: { rating: 1650, full_name: 'Rated Player A' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      sA,
      app.log
    );
    await handleParsedMessage(
      { userId: pB, connectionId: cB, profile: { rating: 1520, full_name: 'Rated Player B' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      sB,
      app.log
    );

    // Verify Player A receives Player B's exact rating (1520)
    const frameA = sA.getLastSent();
    assert.strictEqual(frameA.payload.opponent.rating, 1520, 'Player A sees exact rating 1520 for Player B');
    assert.strictEqual(frameA.payload.opponent.isUnrated, false, 'Opponent is not unrated');

    // Verify Player B receives Player A's exact rating (1650)
    const frameB = sB.getLastSent();
    assert.strictEqual(frameB.payload.opponent.rating, 1650, 'Player B sees exact rating 1650 for Player A');
    assert.strictEqual(frameB.payload.opponent.isUnrated, false, 'Opponent is not unrated');

    connectionRegistry.unregister(pA, cA);
    connectionRegistry.unregister(pB, cB);

    // Now test Genuine Unrated case vs Failed Lookup error case
    matchmaker.clearQueue();

    const pUnrated = 'user_unrated';
    const cUnrated = 'conn_unrated';
    const sUnrated = createMockSocket('PUnrated');
    // Genuine unrated: rating is null, NO ratingError
    connectionRegistry.register(pUnrated, cUnrated, sUnrated, { rating: null, ratingError: null, fullName: 'New Player' });

    const pError = 'user_lookup_error';
    const cError = 'conn_lookup_error';
    const sError = createMockSocket('PError');
    // Failed lookup: rating is null, but ratingError is present
    connectionRegistry.register(pError, cError, sError, { rating: null, ratingError: 'Database connection failed', fullName: 'DB Error Player' });

    await handleParsedMessage(
      { userId: pUnrated, connectionId: cUnrated, profile: { rating: null, ratingError: null, full_name: 'New Player' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      sUnrated,
      app.log
    );
    await handleParsedMessage(
      { userId: pError, connectionId: cError, profile: { rating: null, ratingError: 'Database connection failed', full_name: 'DB Error Player' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', payload: { timeControl: '10min' } })),
      sError,
      app.log
    );

    const frameUnrated = sUnrated.getLastSent();
    // Opponent of pUnrated is pError -> has ratingError, isUnrated is false
    assert.strictEqual(frameUnrated.payload.opponent.rating, null);
    assert.strictEqual(frameUnrated.payload.opponent.isUnrated, false, 'Failed lookup is NOT treated as genuine unrated');
    assert.ok(frameUnrated.payload.opponent.ratingError, 'Distinguishable lookup error retained');

    const frameError = sError.getLastSent();
    // Opponent of pError is pUnrated -> rating is null, ratingError is null -> isUnrated is true!
    assert.strictEqual(frameError.payload.opponent.rating, null);
    assert.strictEqual(frameError.payload.opponent.isUnrated, true, 'Genuine unrated player is distinguished as isUnrated: true');

    connectionRegistry.unregister(pUnrated, cUnrated);
    connectionRegistry.unregister(pError, cError);
  });

  // 17: Matching player receives requestId acknowledgment to prevent client send timeout
  await test('17: Incoming matching player receives exact requestId in game.matched frame', async () => {
    matchmaker.clearQueue();

    const pWait = 'user_wait_timeout_test';
    const cWait = 'conn_wait_timeout_test';
    const sWait = createMockSocket('SWait');
    connectionRegistry.register(pWait, cWait, sWait, { rating: 1200, fullName: 'Waiting Player' });

    const pMatch = 'user_match_timeout_test';
    const cMatch = 'conn_match_timeout_test';
    const sMatch = createMockSocket('SMatch');
    connectionRegistry.register(pMatch, cMatch, sMatch, { rating: 1200, fullName: 'Matching Player' });

    // Player 1 enters queue
    await handleParsedMessage(
      { userId: pWait, connectionId: cWait, profile: { rating: 1200, full_name: 'Waiting Player' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', requestId: 'req_wait_123', payload: { timeControl: '10min' } })),
      sWait,
      app.log
    );
    const queueFrame = sWait.getLastSent();
    assert.strictEqual(queueFrame.type, 'game.queued');
    assert.strictEqual(queueFrame.requestId, 'req_wait_123', 'Player 1 receives their requestId on game.queued');

    // Player 2 enters queue and immediately forms a match
    const p2ReqId = 'req_match_456';
    await handleParsedMessage(
      { userId: pMatch, connectionId: cMatch, profile: { rating: 1200, full_name: 'Matching Player' } },
      Buffer.from(JSON.stringify({ type: 'game.matchmake', requestId: p2ReqId, payload: { timeControl: '10min' } })),
      sMatch,
      app.log
    );

    const matchFrameP2 = sMatch.getLastSent();
    assert.strictEqual(matchFrameP2.type, 'game.matched');
    assert.strictEqual(matchFrameP2.requestId, p2ReqId, 'Player 2 receives their exact requestId on game.matched to prevent timeout');
    assert.strictEqual(matchFrameP2.payload.assignedColor, 'b');
    assert.strictEqual(matchFrameP2.payload.opponent.rating, 1200);

    connectionRegistry.unregister(pWait, cWait);
    connectionRegistry.unregister(pMatch, cMatch);
  });

  console.log('\n📊 MATCHMAKING TEST RESULTS SUMMARY:');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('✨ All Step 4F-C Matchmaking Tests passed successfully!\n');
  }
}

runMatchmakingTests().catch((err) => {
  console.error('Fatal Matchmaking Test Error:', err);
  process.exit(1);
});
