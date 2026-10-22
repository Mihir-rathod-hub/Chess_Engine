import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { GameRoom } from './GameRoom.js';
import { GameError, GameErrorCodes } from './gameErrors.js';
import { connectionRegistry } from '../websocket/registry/ConnectionRegistry.js';
import { formatResponse } from '../websocket/protocol/messageFormatter.js';
import { calculateEloChanges, DEFAULT_STARTING_RATING } from './EloRating.js';

export class GameManager {
  constructor(dbClient = null) {
    this.rooms = new Map(); // Map<gameId, GameRoom>
    this.completedGames = new Map(); // Map<gameId, completedGameRecord>
    this.db = dbClient || supabaseAdmin;
    this.isCustomDb = Boolean(dbClient);
  }

  setDbClient(customDbClient) {
    this.db = customDbClient;
    this.isCustomDb = Boolean(customDbClient);
  }

  async createGame(userId, options = {}) {
    const { gameType = 'casual', timeControl = '10min' } = options;

    let gameId = null;
    let dbRecord = null;

    // 1. Write pending game to Supabase PostgreSQL database
    if (this.db) {
      try {
        const { data, error } = await this.db
          .from('games')
          .insert({
            white_player_id: userId,
            black_player_id: null,
            game_type: gameType,
            status: 'pending',
            time_control: timeControl,
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
          })
          .select()
          .single();

        if (!error && data) {
          gameId = data.id;
          dbRecord = data;
        }
      } catch (err) {
        console.warn('Game DB insert warning:', err.message);
      }
    }

    // Fallback ID if DB is offline/testing (guaranteed valid UUID for PostgreSQL)
    if (!gameId) {
      gameId = crypto.randomUUID();
    }

    // 2. Instantiate GameRoom in memory
    const room = new GameRoom({
      id: gameId,
      whitePlayerId: userId,
      blackPlayerId: null,
      timeControl,
      gameType,
      onTimeoutHandler: (gId, loserColor) => this.handleTimeoutEvent(gId, loserColor)
    });

    this.rooms.set(gameId, room);
    return room;
  }

  async createMatchedGame(whiteUserId, blackUserId, options = {}) {
    const { gameType = 'casual', timeControl = '10min' } = options;

    let gameId = null;

    // 1. Write matched in_progress game to Supabase PostgreSQL database
    if (this.db) {
      try {
        const { data, error } = await this.db
          .from('games')
          .insert({
            white_player_id: whiteUserId,
            black_player_id: blackUserId,
            game_type: gameType,
            status: 'in_progress',
            started_at: new Date().toISOString(),
            time_control: timeControl,
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
          })
          .select()
          .single();

        if (!error && data) {
          gameId = data.id;
        }
      } catch (err) {
        console.warn('Game DB insert warning:', err.message);
      }
    }

    // Fallback ID if DB is offline/testing (guaranteed valid UUID for PostgreSQL)
    if (!gameId) {
      gameId = crypto.randomUUID();
    }

    // 2. Fetch authoritative pre-match ratings
    const whitePlayerRating = await this.getPlayerRating(whiteUserId);
    const blackPlayerRating = await this.getPlayerRating(blackUserId);

    // 3. Instantiate GameRoom in memory with both players assigned and pre-match ratings recorded
    const room = new GameRoom({
      id: gameId,
      whitePlayerId: whiteUserId,
      blackPlayerId: blackUserId,
      whitePlayerRating,
      blackPlayerRating,
      timeControl,
      gameType,
      onTimeoutHandler: (gId, loserColor) => this.handleTimeoutEvent(gId, loserColor)
    });

    // 4. Start game clock and set status to in_progress
    room.start();

    this.rooms.set(gameId, room);
    return room;
  }

  getRoom(gameId) {
    return this.rooms.get(gameId) || null;
  }

  async joinGame(userId, gameId) {
    let room = this.getRoom(gameId);

    // If room not in memory, attempt to load from database
    if (!room && this.db) {
      try {
        const { data, error } = await this.db
          .from('games')
          .select('*')
          .eq('id', gameId)
          .single();

        if (!error && data) {
          room = new GameRoom({
            id: data.id,
            whitePlayerId: data.white_player_id,
            blackPlayerId: data.black_player_id,
            timeControl: data.time_control,
            gameType: data.game_type,
            onTimeoutHandler: (gId, loserColor) => this.handleTimeoutEvent(gId, loserColor)
          });
          this.rooms.set(gameId, room);
        }
      } catch (e) {}
    }

    if (!room) {
      throw new GameError(`Game with ID ${gameId} not found.`, GameErrorCodes.GAME_NOT_FOUND);
    }

    // Assign player
    const assignedColor = room.addPlayer(userId);

    // If both players are present, start game
    if (room.whitePlayerId && room.blackPlayerId && room.status === 'pending') {
      room.start();

      // Update DB record
      if (this.db) {
        try {
          await this.db
            .from('games')
            .update({
              black_player_id: room.blackPlayerId,
              status: 'in_progress',
              started_at: new Date().toISOString()
            })
            .eq('id', gameId);
        } catch (e) {}
      }

      // Broadcast game.joined and game.state to both players
      this.broadcastGameState(room, 'game.joined');
    }

    return { room, assignedColor };
  }

  async processMove(userId, gameId, moveRequest) {
    const room = this.getRoom(gameId);
    if (!room) {
      throw new GameError(`Game ${gameId} not found.`, GameErrorCodes.GAME_NOT_FOUND);
    }

    // Execute authoritative move on room
    const { move, state } = room.makeMove(userId, moveRequest);

    // Broadcast updated game.move and game.state to players immediately for maximum smoothness & zero latency
    this.broadcastGameState(room, 'game.move', { move });

    if (state.status === 'completed') {
      await this.applyMatchRatingChanges(room);
      this.broadcastGameState(room, 'game.ended', { ratingChanges: room.ratingChanges });
    }

    // Persist authoritative move to public.game_moves table
    if (this.db) {
      const persistPromise = (async () => {
        try {
          await this.db.from('game_moves').insert({
            game_id: gameId,
            player_id: userId,
            move_number: move.moveNumber,
            san: move.san,
            lan: move.lan,
            fen_after: move.fenAfter,
            time_spent_ms: move.timeSpentMs
          });

          // Update games table with latest FEN & PGN
          const updatePayload = {
            fen: state.fen,
            pgn: state.pgn
          };

          if (state.status === 'completed') {
            updatePayload.status = 'completed';
            updatePayload.result = state.result;
            updatePayload.winner_id = state.winnerId;
            updatePayload.completed_at = new Date().toISOString();
          }

          await this.db.from('games').update(updatePayload).eq('id', gameId);
        } catch (err) {
          console.warn('DB move persistence warning:', err.message);
        }
      })();

      // Await persistence in unit test environments with custom mock DB or when requested
      if (this.isCustomDb || moveRequest?.awaitDb) {
        await persistPromise;
      }
    }

    return { move, state };
  }

  async processResign(userId, gameId) {
    const room = this.getRoom(gameId);
    if (!room) {
      throw new GameError(`Game ${gameId} not found.`, GameErrorCodes.GAME_NOT_FOUND);
    }

    const state = room.resign(userId);
    await this.applyMatchRatingChanges(room);

    this.broadcastGameState(room, 'game.ended', { ratingChanges: room.ratingChanges, dbPersisted: room.dbPersisted });
    return state;
  }

  async handleTimeoutEvent(gameId, loserColor) {
    const room = this.getRoom(gameId);
    if (!room || room.status !== 'in_progress') return;

    const state = room.handleTimeout(loserColor);
    await this.applyMatchRatingChanges(room);

    this.broadcastGameState(room, 'game.ended', { ratingChanges: room.ratingChanges, dbPersisted: room.dbPersisted });
  }

  getUserActiveRoom(userId) {
    if (!userId) return null;
    for (const room of this.rooms.values()) {
      if (
        room.status === 'in_progress' &&
        (room.whitePlayerId === userId || room.blackPlayerId === userId)
      ) {
        return room;
      }
    }
    return null;
  }

  async handlePlayerDisconnect(userId) {
    const room = this.getUserActiveRoom(userId);
    if (!room) return null;

    // Idempotent: If grace period is already running for this user, do not create duplicate timers
    if (room.isGraceActive && room.disconnectedPlayerId === userId) {
      return null;
    }

    const graceInfo = room.startDisconnectGrace(userId, async () => {
      try {
        await this.handleDisconnectForfeit(userId, room.id);
      } catch (err) {
        console.error(`Error in disconnect forfeit timer for game ${room.id}:`, err);
      }
    });

    if (!graceInfo) return null;

    // Broadcast player disconnection & grace period countdown to room
    this.broadcastGameState(room, 'game.player_disconnected', {
      userId,
      disconnectGraceExpiresAt: graceInfo.disconnectGraceExpiresAt,
      gracePeriodSeconds: graceInfo.disconnectGraceSeconds
    });

    return graceInfo;
  }

  async handleDisconnectForfeit(userId, gameId) {
    const room = this.getRoom(gameId);
    if (!room || room.status !== 'in_progress') return null;

    const state = room.handleDisconnectForfeit(userId);
    if (!state) return null;

    await this.applyMatchRatingChanges(room);

    // Immediately broadcast game.ended to all connected participants
    this.broadcastGameState(room, 'game.ended', { ratingChanges: room.ratingChanges, dbPersisted: room.dbPersisted });

    return state;
  }

  async reconnectPlayer(userId, gameId = null) {
    let room = gameId ? this.getRoom(gameId) : this.getUserActiveRoom(userId);

    // If room not in memory, attempt to recover from database
    if (!room && gameId && this.db) {
      try {
        const { data, error } = await this.db
          .from('games')
          .select('*')
          .eq('id', gameId)
          .single();

        if (!error && data) {
          if (data.status === 'completed') {
            throw new GameError('This match has already ended.', GameErrorCodes.GAME_ALREADY_FINISHED);
          }

          room = new GameRoom({
            id: data.id,
            whitePlayerId: data.white_player_id,
            blackPlayerId: data.black_player_id,
            timeControl: data.time_control,
            gameType: data.game_type,
            onTimeoutHandler: (gId, loserColor) => this.handleTimeoutEvent(gId, loserColor)
          });
          if (data.fen) {
            try { room.chess.load(data.fen); } catch (e) {}
          }
          room.status = data.status || 'in_progress';
          this.rooms.set(gameId, room);
        }
      } catch (e) {
        if (e instanceof GameError) throw e;
      }
    }

    if (!room) {
      throw new GameError('Active match not found.', GameErrorCodes.GAME_NOT_FOUND);
    }

    // Authenticate player membership in this room
    const playerColor = room.getPlayerColor(userId);
    if (!playerColor) {
      throw new GameError('You are not a player in this match.', GameErrorCodes.NOT_A_PLAYER);
    }

    if (room.status === 'completed') {
      throw new GameError('This match has already ended.', GameErrorCodes.GAME_ALREADY_FINISHED);
    }

    // Cancel active disconnect grace period for this player
    room.cancelDisconnectGrace(userId);

    // Broadcast player reconnection notice to room
    this.broadcastGameState(room, 'game.player_reconnected', { userId });

    // Retrieve opponent profile
    const opponentId = playerColor === 'w' ? room.blackPlayerId : room.whitePlayerId;
    let opponent = null;

    if (opponentId) {
      const oppConnections = connectionRegistry.getUserConnections(opponentId);
      if (oppConnections.length > 0 && oppConnections[0].metadata?.profile) {
        opponent = oppConnections[0].metadata.profile;
      } else if (this.db) {
        try {
          const { data } = await this.db
            .from('profiles')
            .select('*')
            .eq('id', opponentId)
            .single();
          if (data) opponent = data;
        } catch (e) {}
      }
    }

    return {
      room,
      assignedColor: playerColor,
      opponent
    };
  }

  async processRespondDraw(userId, gameId, accept) {
    const room = this.getRoom(gameId);
    if (!room) {
      throw new GameError(`Game ${gameId} not found.`, GameErrorCodes.GAME_NOT_FOUND);
    }

    const state = room.respondDraw(userId, accept);

    if (state.status === 'completed') {
      await this.applyMatchRatingChanges(room);
      this.broadcastGameState(room, 'game.ended', { ratingChanges: room.ratingChanges, dbPersisted: room.dbPersisted });
    } else {
      this.broadcastGameState(room, 'game.state');
    }

    return state;
  }

  async getPlayerRating(userId, room = null) {
    if (!userId) return null;

    if (room) {
      if (room.whitePlayerId === userId && typeof room.whitePlayerRating === 'number') {
        return room.whitePlayerRating;
      }
      if (room.blackPlayerId === userId && typeof room.blackPlayerRating === 'number') {
        return room.blackPlayerRating;
      }
    }

    // 1. Check active connection registry metadata
    const userConns = connectionRegistry.getUserConnections(userId);
    if (userConns.length > 0 && typeof userConns[0].metadata?.rating === 'number') {
      return userConns[0].metadata.rating;
    }

    // 2. Query persistent database profiles table
    if (this.db) {
      try {
        const { data, error } = await this.db
          .from('profiles')
          .select('rating')
          .eq('id', userId)
          .single();

        if (!error && data && typeof data.rating === 'number') {
          return data.rating;
        }
      } catch (err) {
        // Safe database access notice
      }
    }

    return null;
  }

  async applyMatchRatingChanges(room) {
    if (!room) return null;
    if (room.ratingsApplied) return room.ratingChanges;
    if (room.status !== 'completed') return null;

    // Idempotent rating application: only online PvP matches between two distinct human players
    if (!room.whitePlayerId || !room.blackPlayerId || room.whitePlayerId === room.blackPlayerId) {
      this.recordCompletedGame(room);
      return null;
    }

    // Bot games and casual friendly matches are unrated
    if (room.gameType === 'bot' || room.gameType === 'friendly') {
      this.recordCompletedGame(room);
      return null;
    }

    // Set authoritative idempotency flag
    room.ratingsApplied = true;

    // Authoritative pre-match ratings
    let whiteRating = await this.getPlayerRating(room.whitePlayerId, room);
    let blackRating = await this.getPlayerRating(room.blackPlayerId, room);

    if (typeof whiteRating !== 'number') {
      whiteRating = DEFAULT_STARTING_RATING;
    }
    if (typeof blackRating !== 'number') {
      blackRating = DEFAULT_STARTING_RATING;
    }

    // FIDE-standard Elo rating delta calculation
    const elo = calculateEloChanges({
      whiteRating,
      blackRating,
      result: room.result
    });

    const ratingChanges = {
      whitePlayerId: room.whitePlayerId,
      blackPlayerId: room.blackPlayerId,
      whitePrevRating: whiteRating,
      blackPrevRating: blackRating,
      whiteDelta: elo.whiteDelta,
      blackDelta: elo.blackDelta,
      whiteNewRating: elo.whiteNewRating,
      blackNewRating: elo.blackNewRating
    };
    room.ratingChanges = ratingChanges;

    // Update active socket session metadata
    for (const conn of connectionRegistry.getUserConnections(room.whitePlayerId)) {
      if (conn.metadata) conn.metadata.rating = ratingChanges.whiteNewRating;
    }
    for (const conn of connectionRegistry.getUserConnections(room.blackPlayerId)) {
      if (conn.metadata) conn.metadata.rating = ratingChanges.blackNewRating;
    }

    // Cache completed match for match history
    this.recordCompletedGame(room);

    // Persist to database atomically via RPC or direct tables
    if (this.db) {
      await this.persistMatchCompletionAndRatings(room, ratingChanges);
    }

    return ratingChanges;
  }

  async persistMatchCompletionAndRatings(room, ratingChanges = null) {
    if (!this.db || !room) return { success: false, reason: 'No database client' };

    const pgnHeader = ratingChanges
      ? `[WhiteElo "${ratingChanges.whitePrevRating}"]\n[BlackElo "${ratingChanges.blackPrevRating}"]\n[WhiteRatingDiff "${ratingChanges.whiteDelta >= 0 ? '+' : ''}${ratingChanges.whiteDelta}"]\n[BlackRatingDiff "${ratingChanges.blackDelta >= 0 ? '+' : ''}${ratingChanges.blackDelta}"]\n[Termination "${room.resultReason || 'Normal'}"]\n`
      : '';
    const fullPgn = pgnHeader + (room.chess.pgn() || '');

    // 1. Attempt atomic PostgreSQL RPC stored procedure first
    if (typeof this.db.rpc === 'function') {
      try {
        const { data, error } = await this.db.rpc('record_match_completion_and_ratings', {
          p_game_id: room.id,
          p_result: room.result,
          p_winner_id: room.winnerId,
          p_white_player_id: room.whitePlayerId,
          p_black_player_id: room.blackPlayerId,
          p_white_new_rating: ratingChanges ? ratingChanges.whiteNewRating : null,
          p_black_new_rating: ratingChanges ? ratingChanges.blackNewRating : null,
          p_pgn: fullPgn
        });

        if (!error && (data?.success || data === null)) {
          room.dbPersisted = true;
          room.dbPersistenceError = null;
          return { success: true, method: 'rpc' };
        } else if (error && error.code !== 'PGRST202') {
          console.warn(`[GameManager Database RPC Notice] record_match_completion_and_ratings: ${error.message} (${error.code})`);
        }
      } catch (err) {
        console.warn(`[GameManager Database RPC Exception]: ${err.message}`);
      }
    }

    // 2. Direct tables update fallback (using upsert if supported so match row is saved even if initial insert failed)
    const errors = [];
    try {
      const gamesTable = this.db.from('games');
      const gamePayload = {
        status: 'completed',
        result: room.result,
        winner_id: room.winnerId,
        pgn: fullPgn,
        completed_at: new Date().toISOString()
      };

      let gameUpdate;
      if (typeof gamesTable.upsert === 'function') {
        gameUpdate = await gamesTable.upsert({
          id: room.id,
          white_player_id: room.whitePlayerId,
          black_player_id: room.blackPlayerId,
          game_type: room.gameType || 'casual',
          time_control: room.timeControl || '10min',
          fen: room.chess.fen(),
          ...gamePayload
        });
      } else if (typeof gamesTable.update === 'function') {
        gameUpdate = await gamesTable.update(gamePayload).eq('id', room.id);
      }

      if (gameUpdate?.error) {
        errors.push(`games table: ${gameUpdate.error.message} (${gameUpdate.error.code})`);
      }
    } catch (err) {
      errors.push(`games table exception: ${err.message}`);
    }

    if (ratingChanges) {
      try {
        const [whiteRes, blackRes] = await Promise.all([
          this.db.from('profiles').update({ rating: ratingChanges.whiteNewRating }).eq('id', room.whitePlayerId),
          this.db.from('profiles').update({ rating: ratingChanges.blackNewRating }).eq('id', room.blackPlayerId)
        ]);

        if (whiteRes?.error) {
          errors.push(`White profile (${room.whitePlayerId}): ${whiteRes.error.message} (${whiteRes.error.code})`);
        }
        if (blackRes?.error) {
          errors.push(`Black profile (${room.blackPlayerId}): ${blackRes.error.message} (${blackRes.error.code})`);
        }
      } catch (err) {
        errors.push(`profiles table exception: ${err.message}`);
      }
    }

    if (errors.length === 0) {
      room.dbPersisted = true;
      room.dbPersistenceError = null;
      return { success: true, method: 'direct' };
    } else {
      room.dbPersisted = false;
      room.dbPersistenceError = errors.join('; ');
      console.error(
        `[GameManager Database Error] Failed to persist ratings/match for game ${room.id}: ${room.dbPersistenceError}. ` +
        `Apply supabase_migration_phase8.sql in Supabase SQL editor or check backend credentials.`
      );
      return { success: false, errors };
    }
  }

  recordCompletedGame(room) {
    if (!room) return null;
    const existing = this.completedGames.get(room.id);
    if (existing) return existing;

    const record = {
      id: room.id,
      whitePlayerId: room.whitePlayerId,
      blackPlayerId: room.blackPlayerId,
      gameType: room.gameType,
      status: room.status,
      result: room.result,
      winnerId: room.winnerId,
      resultReason: room.resultReason,
      timeControl: room.timeControl,
      fen: room.chess.fen(),
      pgn: room.chess.pgn(),
      ratingChanges: room.ratingChanges || null,
      moveCount: room.moveHistory ? room.moveHistory.length : 0,
      startedAt: room.startedTimestamp ? new Date(room.startedTimestamp).toISOString() : new Date(room.createdTimestamp).toISOString(),
      completedAt: room.completedTimestamp ? new Date(room.completedTimestamp).toISOString() : new Date().toISOString()
    };

    this.completedGames.set(room.id, record);
    return record;
  }

  async formatMatchHistoryRecord(record, userId) {
    if (!record || !userId) return null;

    const isWhite = (record.whitePlayerId || record.white_player_id) === userId;
    const isBlack = (record.blackPlayerId || record.black_player_id) === userId;
    if (!isWhite && !isBlack) return null;

    const userColor = isWhite ? 'w' : 'b';
    const opponentId = isWhite
      ? (record.blackPlayerId || record.black_player_id)
      : (record.whitePlayerId || record.white_player_id);

    // Resolve opponent info
    let opponentName = 'Chess Player';
    let opponentRating = null;
    let opponentSkill = 'Intermediate';

    if (opponentId) {
      const oppConns = connectionRegistry.getUserConnections(opponentId);
      if (oppConns.length > 0 && oppConns[0].metadata) {
        opponentName = oppConns[0].metadata.fullName || opponentName;
        opponentRating = oppConns[0].metadata.rating ?? null;
        opponentSkill = oppConns[0].metadata.skillLevel || opponentSkill;
      } else if (this.db) {
        try {
          const { data } = await this.db.from('profiles').select('*').eq('id', opponentId).single();
          if (data) {
            opponentName = data.full_name || opponentName;
            opponentRating = typeof data.rating === 'number' ? data.rating : null;
            opponentSkill = data.skill_level || opponentSkill;
          }
        } catch (e) {}
      }
    } else {
      opponentName = 'BOT';
      opponentRating = 1000;
    }

    // Determine authoritative result from user perspective
    const rawResult = record.result;
    let userResult = 'draw';
    if (rawResult === 'white_win') {
      userResult = isWhite ? 'win' : 'loss';
    } else if (rawResult === 'black_win') {
      userResult = isBlack ? 'win' : 'loss';
    }

    // Resolve rating deltas
    let ratingDelta = null;
    let ratingBefore = null;
    let ratingAfter = null;

    let ratingChanges = record.ratingChanges || this.completedGames.get(record.id)?.ratingChanges || null;

    if (!ratingChanges && record.pgn) {
      const whiteDeltaMatch = record.pgn.match(/\[WhiteRatingDiff "([+-]?\d+)"\]/);
      const blackDeltaMatch = record.pgn.match(/\[BlackRatingDiff "([+-]?\d+)"\]/);
      const whiteEloMatch = record.pgn.match(/\[WhiteElo "(\d+)"\]/);
      const blackEloMatch = record.pgn.match(/\[BlackElo "(\d+)"\]/);

      if (whiteDeltaMatch && blackDeltaMatch) {
        const wDelta = parseInt(whiteDeltaMatch[1], 10);
        const bDelta = parseInt(blackDeltaMatch[1], 10);
        const wBefore = whiteEloMatch ? parseInt(whiteEloMatch[1], 10) : 1200;
        const bBefore = blackEloMatch ? parseInt(blackEloMatch[1], 10) : 1200;

        ratingChanges = {
          whiteDelta: wDelta,
          blackDelta: bDelta,
          whitePrevRating: wBefore,
          blackPrevRating: bBefore,
          whiteNewRating: wBefore + wDelta,
          blackNewRating: bBefore + bDelta
        };
      }
    }

    if (ratingChanges) {
      if (isWhite) {
        ratingDelta = ratingChanges.whiteDelta;
        ratingBefore = ratingChanges.whitePrevRating;
        ratingAfter = ratingChanges.whiteNewRating;
      } else {
        ratingDelta = ratingChanges.blackDelta;
        ratingBefore = ratingChanges.blackPrevRating;
        ratingAfter = ratingChanges.blackNewRating;
      }
    }

    return {
      gameId: record.id,
      userColor,
      result: userResult, // 'win' | 'loss' | 'draw'
      rawResult,
      winnerId: record.winnerId || record.winner_id,
      resultReason: record.resultReason || record.result_reason || (userResult === 'draw' ? 'Draw' : 'Match Concluded'),
      timeControl: record.timeControl || record.time_control || '10min',
      gameType: record.gameType || record.game_type || 'casual',
      ratingDelta,
      ratingBefore,
      ratingAfter,
      moveCount: record.moveCount || (record.move_count ?? 0),
      opponent: {
        id: opponentId,
        fullName: opponentName,
        rating: opponentRating,
        skillLevel: opponentSkill
      },
      startedAt: record.startedAt || record.started_at,
      completedAt: record.completedAt || record.completed_at || new Date().toISOString()
    };
  }

  async getMatchHistory(userId, options = {}) {
    if (!userId) return [];
    const limit = Math.min(Math.max(parseInt(options.limit, 10) || 20, 1), 100);
    const offset = Math.max(parseInt(options.offset, 10) || 0, 0);

    const historyItems = [];
    const seenGameIds = new Set();

    // 1. Query persistent games from database
    if (this.db) {
      try {
        const { data, error } = await this.db
          .from('games')
          .select('*')
          .or(`white_player_id.eq.${userId},black_player_id.eq.${userId}`)
          .eq('status', 'completed')
          .order('completed_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (!error && Array.isArray(data)) {
          for (const g of data) {
            seenGameIds.add(g.id);
            const item = await this.formatMatchHistoryRecord(g, userId);
            if (item) historyItems.push(item);
          }
        }
      } catch (err) {
        console.warn('DB match history fetch notice:', err.message);
      }
    }

    // 2. Merge server-authoritative completedGames from memory
    for (const record of this.completedGames.values()) {
      if (seenGameIds.has(record.id)) continue;
      if (record.whitePlayerId === userId || record.blackPlayerId === userId) {
        seenGameIds.add(record.id);
        const item = await this.formatMatchHistoryRecord(record, userId);
        if (item) historyItems.push(item);
      }
    }

    // Sort descending by completion time
    historyItems.sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt));
    return historyItems.slice(0, limit);
  }

  async getGameDetails(userId, gameId) {
    if (!gameId) throw new GameError('gameId parameter required.', GameErrorCodes.INVALID_GAME_REQUEST);

    // 1. Check in-memory rooms
    let room = this.getRoom(gameId);
    let record = room ? room.getState() : (this.completedGames.get(gameId) || null);

    // 2. If not found in memory, query DB
    if (!record && this.db) {
      try {
        const { data, error } = await this.db
          .from('games')
          .select('*')
          .eq('id', gameId)
          .single();
        if (!error && data) record = data;
      } catch (e) {}
    }

    if (!record) {
      throw new GameError(`Game ${gameId} not found.`, GameErrorCodes.GAME_NOT_FOUND);
    }

    // Authorization check: User must be a participant OR game must be completed
    const whiteId = record.whitePlayerId || record.white_player_id;
    const blackId = record.blackPlayerId || record.black_player_id;
    const isParticipant = whiteId === userId || blackId === userId;
    const isCompleted = record.status === 'completed';

    if (!isParticipant && !isCompleted) {
      throw new GameError('Unauthorized: You cannot access active private matches of other players.', GameErrorCodes.NOT_A_PLAYER);
    }

    let moves = [];
    if (this.db) {
      try {
        const { data } = await this.db
          .from('game_moves')
          .select('*')
          .eq('game_id', gameId)
          .order('move_number', { ascending: true });
        if (data) moves = data;
      } catch (e) {}
    }

    return {
      game: record,
      moves
    };
  }

  broadcastGameState(room, eventType = 'game.state', extraPayload = {}) {
    const state = room.getState();
    const frame = formatResponse(eventType, {
      ...extraPayload,
      state
    });

    if (room.whitePlayerId) {
      connectionRegistry.broadcastToUser(room.whitePlayerId, frame);
    }
    if (room.blackPlayerId) {
      connectionRegistry.broadcastToUser(room.blackPlayerId, frame);
    }
  }
}

export const gameManager = new GameManager();
