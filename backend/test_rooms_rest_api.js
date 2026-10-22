import assert from 'assert';
import { buildApp } from './src/app.js';
import { friendRoomManager } from './src/game/FriendRoomManager.js';
import { connectionRegistry } from './src/websocket/registry/ConnectionRegistry.js';

async function runRoomsRestApiTests() {
  console.log('🧪 Starting Play with Friends REST API Test Suite...\n');

  const app = buildApp();
  await app.ready();

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

  // Create helper to generate a fake valid JWT token if auth plugin decodes or uses mock
  // In backend plugins/auth.js, let's see how request.user is populated.
  // Let's test endpoints using app.inject()
  
  // We can inject requests with an authenticated user context or test fastify handlers directly
  console.log('Testing Fastify route parsing and bodyless POST handlers...\n');

  // Test 1: POST /api/rooms/:code/join with empty JSON body must NOT throw FST_ERR_CTP_EMPTY_JSON_BODY
  await test('1: POST /api/rooms/:code/join with Content-Type application/json and empty body does not throw 400 empty body error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/STRAT-TEST/join',
      headers: {
        'content-type': 'application/json'
      },
      payload: ''
    });

    // It should hit authentication (401), NOT 400 FST_ERR_CTP_EMPTY_JSON_BODY!
    assert.strictEqual(res.statusCode, 401, 'Should reach auth middleware and return 401 Unauthorized');
    const json = JSON.parse(res.payload);
    assert.strictEqual(json.error.code, 'UNAUTHORIZED');
    assert.doesNotMatch(json.error.message, /Body cannot be empty/i);
  });

  // Test 2: POST /api/rooms/:code/join with Accept header only (bodyless) hits auth correctly
  await test('2: POST /api/rooms/:code/join with Accept: application/json (bodyless) hits auth correctly', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/STRAT-TEST/join',
      headers: {
        'accept': 'application/json'
      }
    });

    assert.strictEqual(res.statusCode, 401);
    const json = JSON.parse(res.payload);
    assert.strictEqual(json.error.code, 'UNAUTHORIZED');
  });

  // Test 3: POST /api/rooms/:code/start with Content-Type application/json and empty body does not throw empty body error
  await test('3: POST /api/rooms/:code/start with Content-Type application/json and empty body handles gracefully', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/rooms/STRAT-TEST/start',
      headers: {
        'content-type': 'application/json'
      },
      payload: ''
    });

    assert.strictEqual(res.statusCode, 401);
    const json = JSON.parse(res.payload);
    assert.strictEqual(json.error.code, 'UNAUTHORIZED');
    assert.doesNotMatch(json.error.message, /Body cannot be empty/i);
  });

  // Test 4: End-to-end joinRoom execution on FriendRoomManager
  await test('4: Two distinct users create and join room, properly updating state and participants', async () => {
    const creatorId = 'user_rest_creator_123';
    const joinerId = 'user_rest_joiner_456';

    const room = await friendRoomManager.createRoom(creatorId, {
      timeControl: '10min',
      creatorProfile: { id: creatorId, name: 'Alice' }
    });

    assert.ok(room.roomCode);
    assert.strictEqual(room.status, 'waiting');
    assert.strictEqual(room.creatorId, creatorId);

    // Joiner joins
    const joinResult = await friendRoomManager.joinRoom(joinerId, room.roomCode, {
      id: joinerId,
      name: 'Bob'
    });

    assert.strictEqual(joinResult.role, 'joiner');
    assert.strictEqual(joinResult.room.status, 'ready');
    assert.strictEqual(joinResult.room.joinedPlayerId, joinerId);

    // Creator joining own room is rejected
    await assert.rejects(
      async () => {
        await friendRoomManager.joinRoom(creatorId, room.roomCode, { id: creatorId, name: 'Alice' });
      },
      (err) => {
        assert.match(err.message, /cannot join your own/i);
        return true;
      }
    );

    // Third player joining full room is rejected
    await assert.rejects(
      async () => {
        await friendRoomManager.joinRoom('user_third_party', room.roomCode, { id: 'user_third_party', name: 'Charlie' });
      },
      (err) => {
        assert.match(err.message, /already full/i);
        return true;
      }
    );
  });

  console.log('\n📊 REST API TEST RESULTS SUMMARY:');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  await app.close();

  if (failed > 0) {
    throw new Error(`${failed} test(s) failed.`);
  } else {
    console.log('✨ All REST API and Content-Type parsing tests passed successfully!\n');
  }
}

runRoomsRestApiTests().catch((err) => {
  console.error('Fatal Test Error:', err);
  process.exit(1);
});
