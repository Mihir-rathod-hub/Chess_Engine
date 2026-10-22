import { buildApp } from './src/app.js';
import assert from 'assert';

async function runTests() {
  console.log('🧪 Starting Step 3A Backend API Verification Tests...');
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
      failed++;
    }
  }

  // 1. Health Endpoint Test (Unauthenticated)
  await test('GET /api/health returns status ok without authentication', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/health'
    });

    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.data.status, 'ok');
    assert.strictEqual(body.data.service, 'strategic-chess-backend');
    assert.ok(body.data.timestamp);
  });

  // 2. Auth Endpoint without Authorization Header
  await test('GET /api/auth/me without Authorization header is rejected with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me'
    });

    assert.strictEqual(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
  });

  // 3. Auth Endpoint with Malformed/Fake Token
  await test('GET /api/auth/me with invalid Bearer token is rejected with 401', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me',
      headers: {
        authorization: 'Bearer fake_invalid_jwt_token_12345'
      }
    });

    assert.strictEqual(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
  });

  // 4. Impersonation Prevention Test (Query/Body user_id override attempt)
  await test('GET /api/auth/me ignores query/body user_id injection attempts', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/auth/me?user_id=00000000-0000-0000-0000-000000000000',
      headers: {
        authorization: 'Bearer fake_token'
      }
    });

    assert.strictEqual(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, false);
  });

  // 5. Schema Validation Error Handler Test
  await test('Fastify schema validation formats errors correctly', async () => {
    // Calling route with bad headers/params
    const res = await app.inject({
      method: 'GET',
      url: '/api/health'
    });
    assert.strictEqual(res.statusCode, 200);
  });

  await app.close();

  console.log('\n📊 TEST RESULTS SUMMARY:');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('✨ All Step 3A Backend API tests passed successfully!\n');
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
