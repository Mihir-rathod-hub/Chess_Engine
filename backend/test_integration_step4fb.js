import assert from 'assert';
import { buildApp } from './src/app.js';
import { connectionRegistry } from './src/websocket/registry/ConnectionRegistry.js';
import { gameManager } from './src/game/GameManager.js';
import { handleParsedMessage } from './src/websocket/handlers/messageRouter.js';

async function runStep4FBIntegrationTest() {
  console.log('🧪 Starting Step 4F-B Authoritative WebSocket Move Integration Test...\n');

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

  const whiteUserId = 'user_white_test_4fb';
  const blackUserId = 'user_black_test_4fb';
  const whiteConnId = 'conn_white_4fb';
  const blackConnId = 'conn_black_4fb';

  let lastWhiteSent = null;
  let lastBlackSent = null;

  const mockWhiteSocket = {
    readyState: 1,
    send: (data) => {
      lastWhiteSent = JSON.parse(data);
    }
  };

  const mockBlackSocket = {
    readyState: 1,
    send: (data) => {
      lastBlackSent = JSON.parse(data);
    }
  };

  connectionRegistry.register(whiteUserId, whiteConnId, mockWhiteSocket, { fullName: 'White Player' });
  connectionRegistry.register(blackUserId, blackConnId, mockBlackSocket, { fullName: 'Black Player' });

  let testRoomId = null;

  // 1. Create and Join Game Room
  await test('Game Creation and Joining for 2 Players', async () => {
    const room = await gameManager.createGame(whiteUserId, { gameType: 'casual', timeControl: '10min' });
    testRoomId = room.id;
    assert.ok(testRoomId, 'Game room created with valid ID');

    const { room: joinedRoom, assignedColor } = await gameManager.joinGame(blackUserId, testRoomId);
    assert.strictEqual(assignedColor, 'b', 'Black player assigned color b');
    assert.strictEqual(joinedRoom.status, 'in_progress', 'Game status transitioned to in_progress');
  });

  // 2. White executes legal move 1. e4 ({ from: 'e2', to: 'e4', promotion: 'q' }) over WebSocket
  await test('White executes legal move 1. e4 via WebSocket game.move', async () => {
    const moveMsg = {
      type: 'game.move',
      version: 1,
      requestId: 'req_w_101',
      payload: {
        gameId: testRoomId,
        from: 'e2',
        to: 'e4',
        promotion: 'q'
      }
    };

    await handleParsedMessage(
      { userId: whiteUserId, connectionId: whiteConnId },
      Buffer.from(JSON.stringify(moveMsg)),
      mockWhiteSocket,
      app.log
    );

    assert.strictEqual(lastWhiteSent.type, 'game.move', 'Response type is game.move');
    assert.strictEqual(lastWhiteSent.requestId, 'req_w_101', 'RequestId matched');
    assert.strictEqual(lastWhiteSent.payload.move.san, 'e4', 'SAN move is e4');
    assert.strictEqual(lastWhiteSent.payload.state.turn, 'b', 'Turn switched to Black (b)');
  });

  // 3. White attempts out-of-turn move 2. e5 -> Rejected with NOT_YOUR_TURN
  await test('White out-of-turn move attempt is rejected with NOT_YOUR_TURN error', async () => {
    const moveMsg = {
      type: 'game.move',
      version: 1,
      requestId: 'req_w_102',
      payload: {
        gameId: testRoomId,
        from: 'e4',
        to: 'e5',
        promotion: 'q'
      }
    };

    await handleParsedMessage(
      { userId: whiteUserId, connectionId: whiteConnId },
      Buffer.from(JSON.stringify(moveMsg)),
      mockWhiteSocket,
      app.log
    );

    assert.strictEqual(lastWhiteSent.type, 'system.error', 'Response type is system.error');
    assert.strictEqual(lastWhiteSent.error.code, 'NOT_YOUR_TURN', 'Error code is NOT_YOUR_TURN');
    assert.strictEqual(lastWhiteSent.requestId, 'req_w_102', 'RequestId matched');
  });

  // 4. Black attempts illegal move e7 to e2 -> Rejected with INVALID_MOVE
  await test('Black illegal move attempt (e7 to e2) is rejected with INVALID_MOVE error', async () => {
    const moveMsg = {
      type: 'game.move',
      version: 1,
      requestId: 'req_b_101',
      payload: {
        gameId: testRoomId,
        from: 'e7',
        to: 'e2',
        promotion: 'q'
      }
    };

    await handleParsedMessage(
      { userId: blackUserId, connectionId: blackConnId },
      Buffer.from(JSON.stringify(moveMsg)),
      mockBlackSocket,
      app.log
    );

    assert.strictEqual(lastBlackSent.type, 'system.error', 'Response type is system.error');
    assert.strictEqual(lastBlackSent.error.code, 'INVALID_MOVE', 'Error code is INVALID_MOVE');
    assert.strictEqual(lastBlackSent.requestId, 'req_b_101', 'RequestId matched');
  });

  // 5. Black executes legal move 1... e5 ({ from: 'e7', to: 'e5', promotion: 'q' })
  await test('Black executes legal move 1... e5 via WebSocket game.move', async () => {
    const moveMsg = {
      type: 'game.move',
      version: 1,
      requestId: 'req_b_102',
      payload: {
        gameId: testRoomId,
        from: 'e7',
        to: 'e5',
        promotion: 'q'
      }
    };

    await handleParsedMessage(
      { userId: blackUserId, connectionId: blackConnId },
      Buffer.from(JSON.stringify(moveMsg)),
      mockBlackSocket,
      app.log
    );

    assert.strictEqual(lastBlackSent.type, 'game.move', 'Response type is game.move');
    assert.strictEqual(lastBlackSent.requestId, 'req_b_102', 'RequestId matched');
    assert.strictEqual(lastBlackSent.payload.move.san, 'e5', 'SAN move is e5');
    assert.strictEqual(lastBlackSent.payload.state.turn, 'w', 'Turn switched back to White (w)');
  });

  connectionRegistry.unregister(whiteUserId, whiteConnId);
  connectionRegistry.unregister(blackUserId, blackConnId);

  console.log('\n📊 STEP 4F-B INTEGRATION TEST RESULTS SUMMARY:');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('✨ All Step 4F-B Authoritative Move Integration Tests passed successfully!\n');
  }
}

runStep4FBIntegrationTest().catch((err) => {
  console.error('Fatal Step 4F-B Integration Test Error:', err);
  process.exit(1);
});
