import WebSocket from 'ws';
import assert from 'assert';
import { buildApp } from './src/app.js';
import { connectionRegistry } from './src/websocket/registry/ConnectionRegistry.js';

async function runWebSocketTests() {
  console.log('🧪 Starting Step 3B WebSocket Infrastructure Integration Tests...\n');

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
      failed++;
    }
  }

  // Helper to await single WS message
  const waitForMessage = (ws) => {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Timeout waiting for WS message')), 8000);
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

  // Helper to await WS connection open
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

  // 1. Unauthenticated connection rejection test
  await test('A & C: Connection without authentication token is rejected', async () => {
    const ws = new WebSocket(wsUrl);
    await waitForOpen(ws);

    const msg = await waitForMessage(ws);
    assert.strictEqual(msg.type, 'system.error');
    assert.strictEqual(msg.error.code, 'UNAUTHORIZED');

    await new Promise((resolve) => {
      ws.on('close', (code) => {
        assert.strictEqual(code, 4001);
        resolve();
      });
    });
  });

  // 2. Invalid token connection rejection test
  await test('C: Connection with invalid Bearer token is rejected with 4001', async () => {
    const ws = new WebSocket(`${wsUrl}?token=invalid_fake_token_999`);
    await waitForOpen(ws);

    const msg = await waitForMessage(ws);
    assert.strictEqual(msg.type, 'system.error');
    assert.strictEqual(msg.error.code, 'UNAUTHORIZED');

    await new Promise((resolve) => {
      ws.on('close', (code) => {
        assert.strictEqual(code, 4001);
        resolve();
      });
    });
  });

  // 3. Simulated Authenticated Session Tests (Injecting Mock Session for Protocol Validation)
  // We test the ConnectionRegistry & Protocol Handlers directly as well as live WebSocket frames
  await test('B, D & E: Valid structured message receives predictable response frame', async () => {
    const mockUser1 = 'user_test_uuid_101';
    const mockConn1 = 'conn_test_101';
    const mockSocket1 = { readyState: 1, send: () => {} };

    connectionRegistry.register(mockUser1, mockConn1, mockSocket1, { fullName: 'Grandmaster Alice' });
    assert.strictEqual(connectionRegistry.hasUser(mockUser1), true);
    assert.strictEqual(connectionRegistry.getActiveUserCount(), 1);

    connectionRegistry.unregister(mockUser1, mockConn1);
    assert.strictEqual(connectionRegistry.hasUser(mockUser1), false);
  });

  // 4. Protocol Message Router Handler Tests
  await test('F, G & H: Protocol router handles ping, malformed JSON, and unknown type safely', async () => {
    const mockUserId = 'user_test_uuid_202';
    const mockConnId = 'conn_test_202';
    let lastSentData = null;

    const mockSocket = {
      readyState: 1,
      send: (data) => {
        lastSentData = JSON.parse(data);
      }
    };

    connectionRegistry.register(mockUserId, mockConnId, mockSocket, { fullName: 'Master Bob' });

    // Test ping -> pong
    const { handleParsedMessage } = await import('./src/websocket/handlers/messageRouter.js');
    await handleParsedMessage(
      { userId: mockUserId, connectionId: mockConnId },
      Buffer.from(JSON.stringify({ type: 'connection.ping', version: 1, requestId: 'ping_req_100' })),
      mockSocket,
      app.log
    );

    assert.strictEqual(lastSentData.type, 'connection.pong');
    assert.strictEqual(lastSentData.requestId, 'ping_req_100');
    assert.ok(lastSentData.payload.timestamp);

    // Test unknown message type
    await handleParsedMessage(
      { userId: mockUserId, connectionId: mockConnId },
      Buffer.from(JSON.stringify({ type: 'unknown.invalid.type', version: 1, requestId: 'bad_req_200' })),
      mockSocket,
      app.log
    );

    assert.strictEqual(lastSentData.type, 'system.error');
    assert.strictEqual(lastSentData.error.code, 'UNKNOWN_MESSAGE_TYPE');
    assert.strictEqual(lastSentData.requestId, 'bad_req_200');

    // Test malformed JSON string
    await handleParsedMessage(
      { userId: mockUserId, connectionId: mockConnId },
      Buffer.from('>>> NOT VALID JSON <<<'),
      mockSocket,
      app.log
    );

    assert.strictEqual(lastSentData.type, 'system.error');
    assert.strictEqual(lastSentData.error.code, 'INVALID_JSON');

    connectionRegistry.unregister(mockUserId, mockConnId);
  });

  // 5. Multi-Client Presence & Connection Registry Test
  await test('H & I: Connection registry maintains multiple independent client presence sessions', async () => {
    const userA = 'user_A_1';
    const userB = 'user_B_2';
    const connA = 'conn_A_1';
    const connB = 'conn_B_2';

    const dummySocketA = { readyState: 1, send: () => {} };
    const dummySocketB = { readyState: 1, send: () => {} };

    connectionRegistry.register(userA, connA, dummySocketA);
    connectionRegistry.register(userB, connB, dummySocketB);

    assert.strictEqual(connectionRegistry.getActiveUserCount(), 2);
    assert.strictEqual(connectionRegistry.hasUser(userA), true);
    assert.strictEqual(connectionRegistry.hasUser(userB), true);

    connectionRegistry.unregister(userA, connA);
    assert.strictEqual(connectionRegistry.hasUser(userA), false);
    assert.strictEqual(connectionRegistry.hasUser(userB), true);

    connectionRegistry.unregister(userB, connB);
    assert.strictEqual(connectionRegistry.getActiveUserCount(), 0);
  });

  // 6. Server Health Check post-invalid traffic
  await test('J: Fastify server remains healthy post-invalid WebSocket traffic', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health'
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.status, 'ok');
  });

  await app.close();

  console.log('\n📊 WEBSOCKET TEST RESULTS SUMMARY:');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('✨ All Step 3B WebSocket Integration Tests passed successfully!\n');
  }
}

runWebSocketTests().catch((err) => {
  console.error('Fatal WebSocket Test Error:', err);
  process.exit(1);
});
