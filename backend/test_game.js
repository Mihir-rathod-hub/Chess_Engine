import assert from 'assert';
import { buildApp } from './src/app.js';
import { GameManager } from './src/game/GameManager.js';
import { GameErrorCodes } from './src/game/gameErrors.js';
import { connectionRegistry } from './src/websocket/registry/ConnectionRegistry.js';

async function runGameEngineTests() {
  console.log('🧪 Starting Step 4 Authoritative PvP Game Engine Integration Tests...\n');

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

  // Mock Database Client to verify persistence without mutating live DB
  const mockDbLogs = {
    gamesInserted: [],
    gamesUpdated: [],
    movesInserted: []
  };

  const createMockDb = () => {
    return {
      from: (tableName) => {
        if (tableName === 'games') {
          return {
            insert: (data) => {
              const record = { id: `mock_game_${Date.now()}`, ...data };
              mockDbLogs.gamesInserted.push(record);
              return {
                select: () => ({
                  single: async () => ({ data: record, error: null })
                })
              };
            },
            update: (data) => {
              mockDbLogs.gamesUpdated.push(data);
              return {
                eq: async () => ({ data: null, error: null })
              };
            },
            select: () => ({
              eq: () => ({
                single: async () => ({ data: null, error: null })
              })
            })
          };
        }
        if (tableName === 'game_moves') {
          return {
            insert: async (data) => {
              mockDbLogs.movesInserted.push(data);
              return { data, error: null };
            }
          };
        }
        return {};
      }
    };
  };

  const mockDb = createMockDb();
  const gameManager = new GameManager(mockDb);

  const playerWhite = 'uuid_user_white_1001';
  const playerBlack = 'uuid_user_black_1002';
  const spectator = 'uuid_user_spectator_1003';

  let testRoom = null;

  // A. Create game
  await test('A: White player can create a game room', async () => {
    testRoom = await gameManager.createGame(playerWhite, { gameType: 'ranked', timeControl: '10min' });
    assert.ok(testRoom.id);
    assert.strictEqual(testRoom.whitePlayerId, playerWhite);
    assert.strictEqual(testRoom.blackPlayerId, null);
    assert.strictEqual(testRoom.status, 'pending');
    assert.strictEqual(mockDbLogs.gamesInserted.length, 1);
  });

  // B & C. Join game & White/Black assignment
  await test('B & C: Black player joins game and receives correct color assignment', async () => {
    const { room, assignedColor } = await gameManager.joinGame(playerBlack, testRoom.id);
    assert.strictEqual(assignedColor, 'b');
    assert.strictEqual(room.whitePlayerId, playerWhite);
    assert.strictEqual(room.blackPlayerId, playerBlack);
    assert.strictEqual(room.status, 'in_progress');
  });

  // D & L. Valid move succeeds & clock switches turn
  await test('D & L: White player makes valid move 1. e4 (e2 to e4) & turn switches to Black', async () => {
    const { move, state } = await gameManager.processMove(playerWhite, testRoom.id, { from: 'e2', to: 'e4' });
    assert.strictEqual(move.san, 'e4');
    assert.strictEqual(move.playerColor, 'w');
    assert.strictEqual(state.turn, 'b');
    assert.strictEqual(mockDbLogs.movesInserted.length, 1);
    assert.strictEqual(mockDbLogs.movesInserted[0].san, 'e4');
  });

  // E. Illegal move rejected
  await test('E: Illegal move attempt by Black is rejected with INVALID_MOVE error', async () => {
    await assert.rejects(
      async () => {
        await gameManager.processMove(playerBlack, testRoom.id, { from: 'e7', to: 'e4' }); // e7 to e4 is illegal for pawn
      },
      (err) => err.code === GameErrorCodes.INVALID_MOVE
    );
  });

  // F. Out-of-turn move rejected
  await test('F: Out-of-turn move by White when it is Black turn is rejected with NOT_YOUR_TURN', async () => {
    await assert.rejects(
      async () => {
        await gameManager.processMove(playerWhite, testRoom.id, { from: 'd2', to: 'd4' });
      },
      (err) => err.code === GameErrorCodes.NOT_YOUR_TURN
    );
  });

  // G. Non-player cannot move
  await test('G: Non-player/Spectator cannot make a move in the game', async () => {
    await assert.rejects(
      async () => {
        await gameManager.processMove(spectator, testRoom.id, { from: 'e7', to: 'e5' });
      },
      (err) => err.code === GameErrorCodes.NOT_A_PLAYER
    );
  });

  // H. Arbitrary FEN/result payload overrides are ignored
  await test('H: Server ignores client attempts to override FEN or result payload', async () => {
    const { state } = await gameManager.processMove(playerBlack, testRoom.id, {
      from: 'e7',
      to: 'e5',
      fen: '8/8/8/8/8/8/8/8 w - - 0 1', // Malicious attempt to clear board
      result: 'black_win'
    });

    assert.strictEqual(state.status, 'in_progress');
    assert.notStrictEqual(state.fen, '8/8/8/8/8/8/8/8 w - - 0 1');
    assert.strictEqual(state.turn, 'w');
  });

  // I, N, O & P. Scholar's Mate Checkmate sequence ends game & persists
  await test('I, N, O & P: Scholar Mate checkmate sequence terminates game with white_win & updates DB', async () => {
    const mateRoom = await gameManager.createGame(playerWhite, { timeControl: '10min' });
    await gameManager.joinGame(playerBlack, mateRoom.id);

    // 1. e4 e5
    await gameManager.processMove(playerWhite, mateRoom.id, { from: 'e2', to: 'e4' });
    await gameManager.processMove(playerBlack, mateRoom.id, { from: 'e7', to: 'e5' });

    // 2. Bc4 Nc6
    await gameManager.processMove(playerWhite, mateRoom.id, { from: 'f1', to: 'c4' });
    await gameManager.processMove(playerBlack, mateRoom.id, { from: 'b8', to: 'c6' });

    // 3. Qh5 Nf6
    await gameManager.processMove(playerWhite, mateRoom.id, { from: 'd1', to: 'h5' });
    await gameManager.processMove(playerBlack, mateRoom.id, { from: 'g8', to: 'f6' });

    // 4. Qxf7# (Checkmate!)
    const { state } = await gameManager.processMove(playerWhite, mateRoom.id, { from: 'h5', to: 'f7' });

    assert.strictEqual(state.status, 'completed');
    assert.strictEqual(state.result, 'white_win');
    assert.strictEqual(state.winnerId, playerWhite);
    assert.strictEqual(state.resultReason, 'Checkmate');
  });

  // K. Resignation ends game correctly
  await test('K: Player resignation terminates match immediately with opponent win', async () => {
    const resignRoom = await gameManager.createGame(playerWhite, { timeControl: '10min' });
    await gameManager.joinGame(playerBlack, resignRoom.id);

    const state = await gameManager.processResign(playerWhite, resignRoom.id);
    assert.strictEqual(state.status, 'completed');
    assert.strictEqual(state.result, 'black_win');
    assert.strictEqual(state.winnerId, playerBlack);
    assert.strictEqual(state.resultReason, 'Resignation');
  });

  // M. Clock Timeout ends game correctly
  await test('M: Server clock timeout terminates match and declares opponent winner', async () => {
    const timeoutRoom = await gameManager.createGame(playerWhite, { timeControl: '10min' });
    await gameManager.joinGame(playerBlack, timeoutRoom.id);

    // Trigger timeout event directly for White
    await gameManager.handleTimeoutEvent(timeoutRoom.id, 'w');
    const state = timeoutRoom.getState();

    assert.strictEqual(state.status, 'completed');
    assert.strictEqual(state.result, 'black_win');
    assert.strictEqual(state.winnerId, playerBlack);
    assert.strictEqual(state.resultReason, 'Timeout');
  });

  console.log('\n📊 GAME ENGINE TEST RESULTS SUMMARY:');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log('✨ All Step 4 Authoritative Game Engine Integration Tests passed successfully!\n');
  }
}

runGameEngineTests().catch((err) => {
  console.error('Fatal Game Engine Test Error:', err);
  process.exit(1);
});
