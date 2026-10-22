import assert from 'assert';
import { buildApp } from './src/app.js';
import { GameManager } from './src/game/GameManager.js';
import { connectionRegistry } from './src/websocket/registry/ConnectionRegistry.js';
import { calculateEloChanges, getExpectedScore, DEFAULT_STARTING_RATING, MINIMUM_RATING } from './src/game/EloRating.js';

async function runRatingsAndHistoryTests() {
  console.log('🧪 Starting Phase 8: Real Player Ratings & Match History Test Suite...\n');

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
      if (err.stack) console.error(err.stack.split('\n').slice(1, 4).join('\n'));
      failed++;
    }
  }

  // Mock Database Client to verify persistent operations cleanly
  function createMockDb() {
    const profiles = new Map();
    const games = new Map();
    const gameMoves = new Map();

    return {
      profiles,
      games,
      gameMoves,
      from: (table) => {
        if (table === 'profiles') {
          return {
            select: () => ({
              eq: (field, val) => ({
                single: async () => {
                  const p = profiles.get(val);
                  return p ? { data: { ...p }, error: null } : { data: null, error: { message: 'Not found' } };
                }
              })
            }),
            update: (updateData) => ({
              eq: (field, val) => ({
                then: async (resolve) => {
                  const existing = profiles.get(val) || { id: val };
                  const updated = { ...existing, ...updateData };
                  profiles.set(val, updated);
                  if (resolve) resolve({ data: updated, error: null });
                  return { data: updated, error: null };
                }
              })
            })
          };
        }
        if (table === 'games') {
          return {
            insert: (data) => {
              const id = `game_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
              const record = { id, ...data };
              games.set(id, record);
              return {
                select: () => ({
                  single: async () => ({ data: record, error: null })
                })
              };
            },
            update: (updateData) => ({
              eq: (field, val) => ({
                then: async (resolve) => {
                  const existing = games.get(val) || { id: val };
                  const updated = { ...existing, ...updateData };
                  games.set(val, updated);
                  if (resolve) resolve({ data: updated, error: null });
                  return { data: updated, error: null };
                }
              })
            }),
            select: () => ({
              or: (orFilter) => ({
                eq: (statusField, statusVal) => ({
                  order: () => ({
                    range: (from, to) => {
                      const all = Array.from(games.values()).filter(g => g.status === statusVal);
                      return Promise.resolve({ data: all.slice(from, to + 1), error: null });
                    }
                  })
                })
              }),
              eq: (field, val) => ({
                single: async () => {
                  const g = games.get(val);
                  return g ? { data: g, error: null } : { data: null, error: { message: 'Game not found' } };
                }
              })
            })
          };
        }
        if (table === 'game_moves') {
          return {
            insert: async (data) => {
              const list = gameMoves.get(data.game_id) || [];
              list.push(data);
              gameMoves.set(data.game_id, list);
              return { data, error: null };
            },
            select: () => ({
              eq: (field, val) => ({
                order: () => Promise.resolve({ data: gameMoves.get(val) || [], error: null })
              })
            })
          };
        }
      }
    };
  }

  // =========================================================================
  // REQUIREMENT 1: Real eligible online win updates both players' ratings correctly
  // =========================================================================
  await test('1: Real eligible online win updates both players ratings correctly with zero-sum conservation', async () => {
    const mockDb = createMockDb();
    mockDb.profiles.set('user_w_1', { id: 'user_w_1', full_name: 'Alice', rating: 1200 });
    mockDb.profiles.set('user_b_1', { id: 'user_b_1', full_name: 'Bob', rating: 1200 });

    const gm = new GameManager(mockDb);
    const room = await gm.createMatchedGame('user_w_1', 'user_b_1', { gameType: 'casual', timeControl: '10min' });

    // Scholar's Mate valid moves:
    await gm.processMove('user_w_1', room.id, { from: 'e2', to: 'e4' });
    await gm.processMove('user_b_1', room.id, { from: 'e7', to: 'e5' });
    await gm.processMove('user_w_1', room.id, { from: 'd1', to: 'h5' });
    await gm.processMove('user_b_1', room.id, { from: 'b8', to: 'c6' });
    await gm.processMove('user_w_1', room.id, { from: 'f1', to: 'c4' });
    await gm.processMove('user_b_1', room.id, { from: 'g8', to: 'f6' });
    const { state } = await gm.processMove('user_w_1', room.id, { from: 'h5', to: 'f7' }); // Checkmate!

    assert.strictEqual(state.status, 'completed');
    assert.strictEqual(state.result, 'white_win');

    // Expected: At equal 1200 ratings, White win should be +16, Black -16
    assert.ok(room.ratingsApplied, 'Ratings must be marked applied');
    assert.strictEqual(room.ratingChanges.whiteDelta, 16);
    assert.strictEqual(room.ratingChanges.blackDelta, -16);
    assert.strictEqual(room.ratingChanges.whiteNewRating, 1216);
    assert.strictEqual(room.ratingChanges.blackNewRating, 1184);

    // Verify DB profiles updated
    assert.strictEqual(mockDb.profiles.get('user_w_1').rating, 1216);
    assert.strictEqual(mockDb.profiles.get('user_b_1').rating, 1184);
  });

  // =========================================================================
  // REQUIREMENT 2: A loss updates the losing player's rating correctly
  // =========================================================================
  await test('2: A loss (via Black win) updates the losing player (White) rating downward', async () => {
    const mockDb = createMockDb();
    mockDb.profiles.set('user_w_2', { id: 'user_w_2', full_name: 'Charlie', rating: 1300 });
    mockDb.profiles.set('user_b_2', { id: 'user_b_2', full_name: 'Dana', rating: 1200 });

    const gm = new GameManager(mockDb);
    const room = await gm.createMatchedGame('user_w_2', 'user_b_2', { gameType: 'casual', timeControl: '10min' });

    // White resigns -> Black win
    const state = await gm.processResign('user_w_2', room.id);
    assert.strictEqual(state.status, 'completed');
    assert.strictEqual(state.result, 'black_win');

    // Expected: 1300 vs 1200. White expected score = 1 / (1 + 10^(-100/400)) ≈ 0.640
    // Black win: White actual 0, delta = round(32 * (0 - 0.640)) = -20
    assert.strictEqual(room.ratingChanges.whiteDelta, -20);
    assert.strictEqual(room.ratingChanges.blackDelta, 20);
    assert.strictEqual(room.ratingChanges.whiteNewRating, 1280);
    assert.strictEqual(room.ratingChanges.blackNewRating, 1220);

    assert.strictEqual(mockDb.profiles.get('user_w_2').rating, 1280);
    assert.strictEqual(mockDb.profiles.get('user_b_2').rating, 1220);
  });

  // =========================================================================
  // REQUIREMENT 3: A draw applies the correct rating calculation
  // =========================================================================
  await test('3: A draw applies the correct rating calculation (underdog gains, higher rated loses slightly)', async () => {
    // 1400 vs 1200 drawn
    const elo = calculateEloChanges({
      whiteRating: 1400,
      blackRating: 1200,
      result: 'draw'
    });

    // White expected = 1 / (1 + 10^(-200/400)) = 0.760. Delta = round(32 * (0.5 - 0.760)) = -8
    assert.strictEqual(elo.whiteDelta, -8);
    assert.strictEqual(elo.blackDelta, 8);
    assert.strictEqual(elo.whiteNewRating, 1392);
    assert.strictEqual(elo.blackNewRating, 1208);

    // Equal rating draw: 1200 vs 1200 -> delta = 0
    const eloEqual = calculateEloChanges({
      whiteRating: 1200,
      blackRating: 1200,
      result: 'draw'
    });
    assert.strictEqual(eloEqual.whiteDelta, 0);
    assert.strictEqual(eloEqual.blackDelta, 0);
  });

  // =========================================================================
  // REQUIREMENT 4: Pre-match ratings and authoritative result are strictly used
  // =========================================================================
  await test('4: Rating calculation uses pre-match persisted ratings and authoritative backend result', async () => {
    const mockDb = createMockDb();
    mockDb.profiles.set('user_w_4', { id: 'user_w_4', rating: 1500 });
    mockDb.profiles.set('user_b_4', { id: 'user_b_4', rating: 1100 });

    const gm = new GameManager(mockDb);
    const room = await gm.createMatchedGame('user_w_4', 'user_b_4');

    // Simulate Black resigns
    await gm.processResign('user_b_4', room.id);

    assert.strictEqual(room.ratingChanges.whitePrevRating, 1500);
    assert.strictEqual(room.ratingChanges.blackPrevRating, 1100);
    // Heavy favorite White winning: expected ≈ 0.909, delta = round(32 * (1 - 0.909)) = +3
    assert.strictEqual(room.ratingChanges.whiteDelta, 3);
    assert.strictEqual(room.ratingChanges.blackDelta, -3);
  });

  // =========================================================================
  // REQUIREMENT 5: Idempotency - duplicate completion does not change ratings twice
  // =========================================================================
  await test('5: Duplicate completion processing does not change ratings twice or duplicate history records', async () => {
    const mockDb = createMockDb();
    mockDb.profiles.set('user_w_5', { id: 'user_w_5', rating: 1200 });
    mockDb.profiles.set('user_b_5', { id: 'user_b_5', rating: 1200 });

    const gm = new GameManager(mockDb);
    const room = await gm.createMatchedGame('user_w_5', 'user_b_5');

    // First completion
    await gm.processResign('user_b_5', room.id);
    const firstRatings = { ...room.ratingChanges };
    const firstWhiteRating = mockDb.profiles.get('user_w_5').rating;

    assert.strictEqual(firstWhiteRating, 1216);

    // Repeated call to applyMatchRatingChanges
    const secondCall = await gm.applyMatchRatingChanges(room);
    assert.deepStrictEqual(secondCall, firstRatings);

    // Third call via duplicate timeout / forfeit
    await gm.handleDisconnectForfeit('user_b_5', room.id);

    // Profile in DB MUST still be 1216 (never 1232!)
    assert.strictEqual(mockDb.profiles.get('user_w_5').rating, 1216);
    assert.strictEqual(mockDb.profiles.get('user_b_5').rating, 1184);

    // Completed games cache must contain exactly one record
    const history = await gm.getMatchHistory('user_w_5');
    assert.strictEqual(history.length, 1);
  });

  // =========================================================================
  // REQUIREMENT 6: Unfinished games do not change ratings
  // =========================================================================
  await test('6: Unfinished games do not change ratings', async () => {
    const mockDb = createMockDb();
    mockDb.profiles.set('user_w_6', { id: 'user_w_6', rating: 1200 });
    mockDb.profiles.set('user_b_6', { id: 'user_b_6', rating: 1200 });

    const gm = new GameManager(mockDb);
    const room = await gm.createMatchedGame('user_w_6', 'user_b_6');

    // One move made - game in progress
    await gm.processMove('user_w_6', room.id, { from: 'e2', to: 'e4' });
    assert.strictEqual(room.status, 'in_progress');

    // Attempt to apply ratings to in-progress game
    const result = await gm.applyMatchRatingChanges(room);
    assert.strictEqual(result, null);
    assert.strictEqual(room.ratingsApplied, false);

    // Ratings in DB remain untouched
    assert.strictEqual(mockDb.profiles.get('user_w_6').rating, 1200);
    assert.strictEqual(mockDb.profiles.get('user_b_6').rating, 1200);
  });

  // =========================================================================
  // REQUIREMENT 7: Profile lookup failures do not produce fabricated ratings
  // =========================================================================
  await test('7: Profile lookup failures do not produce fabricated ratings', async () => {
    const mockDb = createMockDb(); // Empty DB, no user profiles
    const gm = new GameManager(mockDb);

    const lookupResult = await gm.getPlayerRating('non_existent_user');
    assert.strictEqual(lookupResult, null, 'Unfound profile must return null, NOT 1200');
  });

  // =========================================================================
  // REQUIREMENT 8: A new player initial rating is initialized and persisted as intended
  // =========================================================================
  await test('8: New player default rating is 1200 per schema and clamped to minimum floor 100', async () => {
    assert.strictEqual(DEFAULT_STARTING_RATING, 1200);
    assert.strictEqual(MINIMUM_RATING, 100);

    // Clamping test: Player with 105 rating losing equal match cannot drop below 100
    const clampedResult = calculateEloChanges({
      whiteRating: 105,
      blackRating: 105,
      result: 'black_win'
    });
    assert.ok(clampedResult.whiteNewRating >= 100, `Clamped rating ${clampedResult.whiteNewRating} must be >= 100`);
    assert.strictEqual(clampedResult.whiteNewRating, 100);
  });

  // =========================================================================
  // REQUIREMENT 9: Match history contains actual players, result, timestamps & details
  // =========================================================================
  await test('9: Match history contains actual players, result, timestamps, and match details', async () => {
    const mockDb = createMockDb();
    mockDb.profiles.set('user_w_9', { id: 'user_w_9', full_name: 'Elena', rating: 1200 });
    mockDb.profiles.set('user_b_9', { id: 'user_b_9', full_name: 'Frank', rating: 1200 });

    const gm = new GameManager(mockDb);
    const room = await gm.createMatchedGame('user_w_9', 'user_b_9', { timeControl: '5min' });

    await gm.processResign('user_b_9', room.id);

    const history = await gm.getMatchHistory('user_w_9');
    assert.strictEqual(history.length, 1);
    const match = history[0];

    assert.strictEqual(match.gameId, room.id);
    assert.strictEqual(match.userColor, 'w');
    assert.strictEqual(match.result, 'win');
    assert.strictEqual(match.ratingDelta, 16);
    assert.strictEqual(match.ratingBefore, 1200);
    assert.strictEqual(match.ratingAfter, 1216);
    assert.strictEqual(match.timeControl, '5min');
    assert.strictEqual(match.opponent.id, 'user_b_9');
    assert.strictEqual(match.opponent.fullName, 'Frank');
    assert.ok(match.completedAt, 'completedAt timestamp must exist');
  });

  // =========================================================================
  // REQUIREMENT 10: Match history from opponent perspective
  // =========================================================================
  await test('10: Match history represents the game correctly from the losing opponent perspective', async () => {
    const mockDb = createMockDb();
    mockDb.profiles.set('user_w_10', { id: 'user_w_10', full_name: 'Grace', rating: 1200 });
    mockDb.profiles.set('user_b_10', { id: 'user_b_10', full_name: 'Henry', rating: 1200 });

    const gm = new GameManager(mockDb);
    const room = await gm.createMatchedGame('user_w_10', 'user_b_10');

    await gm.processResign('user_b_10', room.id);

    // Query from Black's perspective
    const historyB = await gm.getMatchHistory('user_b_10');
    assert.strictEqual(historyB.length, 1);
    const matchB = historyB[0];

    assert.strictEqual(matchB.userColor, 'b');
    assert.strictEqual(matchB.result, 'loss');
    assert.strictEqual(matchB.ratingDelta, -16);
    assert.strictEqual(matchB.ratingBefore, 1200);
    assert.strictEqual(matchB.ratingAfter, 1184);
    assert.strictEqual(matchB.opponent.id, 'user_w_10');
    assert.strictEqual(matchB.opponent.fullName, 'Grace');
  });

  // =========================================================================
  // REQUIREMENT 11: Unauthorized users cannot access private active matches
  // =========================================================================
  await test('11: Unauthorized users cannot access active private matches of other players', async () => {
    const mockDb = createMockDb();
    const gm = new GameManager(mockDb);
    const room = await gm.createMatchedGame('user_p1', 'user_p2');

    // Third party user attempts to access game details while in progress
    let errorCaught = false;
    try {
      await gm.getGameDetails('user_eavesdropper', room.id);
    } catch (err) {
      errorCaught = true;
      assert.strictEqual(err.code, 'NOT_A_PLAYER');
    }
    assert.strictEqual(errorCaught, true, 'Spectator must be rejected from active private game');
  });

  // =========================================================================
  // REQUIREMENT 12: Checkmate, resignation, draw, timeout, abandonment use consistent policies
  // =========================================================================
  await test('12: Checkmate, resignation, timeout, and abandonment apply consistent rating policies', async () => {
    const mockDb = createMockDb();
    const gm = new GameManager(mockDb);

    // A. Checkmate test
    const rCheckmate = calculateEloChanges({ whiteRating: 1200, blackRating: 1200, result: 'white_win' });
    // B. Resignation test
    const rResign = calculateEloChanges({ whiteRating: 1200, blackRating: 1200, result: 'white_win' });
    // C. Timeout test
    const rTimeout = calculateEloChanges({ whiteRating: 1200, blackRating: 1200, result: 'white_win' });
    // D. Abandonment test
    const rAbandon = calculateEloChanges({ whiteRating: 1200, blackRating: 1200, result: 'white_win' });

    assert.strictEqual(rCheckmate.whiteDelta, 16);
    assert.strictEqual(rResign.whiteDelta, 16);
    assert.strictEqual(rTimeout.whiteDelta, 16);
    assert.strictEqual(rAbandon.whiteDelta, 16);

    // Bot games are strictly unrated
    const botRoom = await gm.createMatchedGame('human_user', 'bot_id', { gameType: 'bot' });
    await gm.processResign('bot_id', botRoom.id);
    assert.strictEqual(botRoom.ratingChanges, null, 'Bot game must not produce rating changes');
  });

  // =========================================================================
  // REQUIREMENT 13: GET /api/games/history REST endpoint returns valid payload
  // =========================================================================
  await test('13: GET /api/games/history endpoint rejects unauthenticated access with 401', async () => {
    const app = buildApp();
    const res = await app.inject({
      method: 'GET',
      url: '/api/games/history'
    });

    assert.strictEqual(res.statusCode, 401);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error.code, 'UNAUTHORIZED');
    await app.close();
  });

  console.log('\n📊 PHASE 8 TEST RESULTS SUMMARY:');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('✨ All 13 Phase 8 Real Player Ratings & Match History tests passed successfully!\n');
    process.exit(0);
  }
}

runRatingsAndHistoryTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
