import crypto from 'crypto';
import { supabaseAdmin } from '../config/supabase.js';
import { gameManager } from './GameManager.js';
import { connectionRegistry } from '../websocket/registry/ConnectionRegistry.js';
import { formatResponse } from '../websocket/protocol/messageFormatter.js';
import { MessageTypes } from '../websocket/protocol/messageTypes.js';

// Alphabet for unambiguous, user-friendly room codes (excludes 0/O, 1/I, L)
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 4;
const ROOM_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

export class FriendRoomManager {
  constructor(gManager = gameManager, cRegistry = connectionRegistry, dbClient = null) {
    this.gameManager = gManager;
    this.connectionRegistry = cRegistry;
    this.db = dbClient || supabaseAdmin;

    // In-memory Authoritative Storage:
    // roomsByCode: Map<roomCode, FriendRoomRecord>
    // roomsById: Map<roomId, FriendRoomRecord>
    this.roomsByCode = new Map();
    this.roomsById = new Map();

    // Rate Limiting & Abuse Protection
    this.failedAttempts = new Map(); // Map<key, { count, resetAt }>
    this.creationRate = new Map();   // Map<userId, { count, resetAt }>

    // Periodic cleanup interval (runs every 5 minutes)
    this.cleanupTimer = setInterval(() => this.cleanupExpiredRooms(), 5 * 60 * 1000);
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  setDbClient(customDb) {
    this.db = customDb;
  }

  /**
   * Normalize room code from raw input (supports plain codes, full URLs, whitespace, mixed case)
   */
  normalizeCode(raw) {
    if (!raw || typeof raw !== 'string') return '';

    let code = raw.trim();

    // If a full invitation URL was pasted (e.g. https://domain.com/play?room=STRAT-5528)
    if (code.includes('?')) {
      try {
        const urlParams = new URLSearchParams(code.split('?')[1]);
        const paramCode = urlParams.get('room') || urlParams.get('code');
        if (paramCode) code = paramCode;
      } catch (_) {
        // Fallback simple regex extraction
        const match = code.match(/[?&](?:room|code)=([A-Za-z0-9-]+)/i);
        if (match) code = match[1];
      }
    }

    // Convert to uppercase and strip invalid characters
    code = code.toUpperCase().replace(/[^A-Z0-9-]/g, '');

    // Canonicalize prefix: if entered without "STRAT-", e.g. "5528", prepend "STRAT-"
    if (code && !code.startsWith('STRAT-') && code.length <= 6) {
      code = `STRAT-${code}`;
    }

    return code;
  }

  /**
   * Generate a cryptographically random, collision-free room code
   */
  generateRoomCode() {
    let attempts = 0;
    while (attempts < 50) {
      attempts++;
      let randomPart = '';
      for (let i = 0; i < CODE_LENGTH; i++) {
        const randIdx = crypto.randomInt(0, CODE_ALPHABET.length);
        randomPart += CODE_ALPHABET[randIdx];
      }

      const code = `STRAT-${randomPart}`;
      if (!this.roomsByCode.has(code)) {
        return code;
      }
    }
    // High-concurrency fallback with timestamp suffix
    return `STRAT-${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  /**
   * Check rate limit for room creation (max 10 rooms per 5 minutes per user)
   */
  _checkCreationRate(userId) {
    const now = Date.now();
    const entry = this.creationRate.get(userId) || { count: 0, resetAt: now + 5 * 60 * 1000 };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + 5 * 60 * 1000;
    }
    entry.count++;
    this.creationRate.set(userId, entry);

    if (entry.count > 10) {
      throw new Error('Too many rooms created. Please wait a few minutes before creating another.');
    }
  }

  /**
   * Check rate limit for failed room lookups / joins (max 8 failed attempts per minute)
   */
  _checkJoinRate(key) {
    const now = Date.now();
    const entry = this.failedAttempts.get(key);
    if (entry && now < entry.resetAt && entry.count >= 8) {
      const waitSec = Math.ceil((entry.resetAt - now) / 1000);
      throw new Error(`Too many incorrect room attempts. Please try again in ${waitSec} seconds.`);
    }
  }

  _recordFailedAttempt(key) {
    const now = Date.now();
    const entry = this.failedAttempts.get(key) || { count: 0, resetAt: now + 60 * 1000 };
    if (now > entry.resetAt) {
      entry.count = 0;
      entry.resetAt = now + 60 * 1000;
    }
    entry.count++;
    this.failedAttempts.set(key, entry);
  }

  _clearFailedAttempts(key) {
    this.failedAttempts.delete(key);
  }

  /**
   * Create a new friendly game room
   */
  async createRoom(creatorId, options = {}) {
    const { timeControl = '10min', gameType = 'friendly', creatorProfile = null } = options;

    this._checkCreationRate(creatorId);

    const roomCode = this.generateRoomCode();
    let roomId = crypto.randomUUID();
    const now = Date.now();
    const expiresAt = now + ROOM_EXPIRY_MS;

    // 1. Persist to PostgreSQL games table if DB is available
    if (this.db) {
      try {
        const { data, error } = await this.db
          .from('games')
          .insert({
            id: roomId,
            white_player_id: creatorId,
            black_player_id: null,
            game_type: gameType,
            status: 'pending',
            time_control: timeControl,
            room_code: roomCode,
            expires_at: new Date(expiresAt).toISOString(),
            fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'
          })
          .select()
          .single();

        if (!error && data?.id) {
          roomId = data.id;
        }
      } catch (err) {
        console.warn('[FriendRoomManager] DB insert warning (fallback to in-memory):', err.message);
      }
    }

    // 2. Build Authoritative In-Memory Room Record
    const roomRecord = {
      id: roomId,
      roomCode,
      creatorId,
      creatorProfile: creatorProfile || { id: creatorId, name: 'Host' },
      joinedPlayerId: null,
      joinedPlayerProfile: null,
      timeControl,
      gameType,
      status: 'waiting', // 'waiting' | 'ready' | 'in_progress' | 'cancelled' | 'expired'
      createdAt: now,
      expiresAt,
      gameId: null,
      starting: false
    };

    this.roomsByCode.set(roomCode, roomRecord);
    this.roomsById.set(roomId, roomRecord);

    return roomRecord;
  }

  /**
   * Retrieve a room by code with expiration and DB hydration checks
   */
  async getRoom(rawCode) {
    const code = this.normalizeCode(rawCode);
    if (!code) return null;

    let room = this.roomsByCode.get(code);

    // If expired, clean up and return null
    if (room && Date.now() > room.expiresAt) {
      this.roomsByCode.delete(code);
      this.roomsById.delete(room.id);
      return null;
    }

    // If not in memory, attempt DB hydration
    if (!room && this.db) {
      try {
        const { data, error } = await this.db
          .from('games')
          .select('*')
          .eq('room_code', code)
          .single();

        if (!error && data) {
          const exp = data.expires_at ? new Date(data.expires_at).getTime() : Date.now() + ROOM_EXPIRY_MS;
          if (Date.now() <= exp && data.status !== 'completed' && data.status !== 'aborted') {
            room = {
              id: data.id,
              roomCode: data.room_code,
              creatorId: data.white_player_id,
              creatorProfile: { id: data.white_player_id, name: 'Host' },
              joinedPlayerId: data.black_player_id || null,
              joinedPlayerProfile: data.black_player_id ? { id: data.black_player_id, name: 'Player' } : null,
              timeControl: data.time_control || '10min',
              gameType: data.game_type || 'friendly',
              status: data.status === 'in_progress' ? 'in_progress' : (data.black_player_id ? 'ready' : 'waiting'),
              createdAt: data.created_at ? new Date(data.created_at).getTime() : Date.now(),
              expiresAt: exp,
              gameId: data.status === 'in_progress' ? data.id : null,
              starting: false
            };
            this.roomsByCode.set(code, room);
            this.roomsById.set(room.id, room);
          }
        }
      } catch (_) {}
    }

    return room || null;
  }

  /**
   * Second player joins a friendly game room
   */
  async joinRoom(userId, rawCode, userProfile = null, clientIp = 'unknown') {
    const code = this.normalizeCode(rawCode);
    if (!code) {
      throw new Error('Please enter a valid room code.');
    }

    const rateKey = `${userId}_${clientIp}`;
    this._checkJoinRate(rateKey);

    const room = await this.getRoom(code);
    if (!room) {
      this._recordFailedAttempt(rateKey);
      throw new Error(`Room "${code}" not found. Please check the code and try again.`);
    }

    if (Date.now() > room.expiresAt) {
      this._recordFailedAttempt(rateKey);
      throw new Error('This game room code has expired.');
    }

    // Check: Cannot join own room with the same account
    if (room.creatorId === userId) {
      throw new Error('You cannot join your own game room from the same account.');
    }

    // Check: Reconnection of already joined player is allowed
    if (room.joinedPlayerId === userId) {
      this._clearFailedAttempts(rateKey);
      return { room, role: 'joiner', isReconnect: true };
    }

    // Check: Room already full
    if (room.joinedPlayerId && room.joinedPlayerId !== userId) {
      throw new Error('This game room is already full (maximum 2 players).');
    }

    // Check: Room already in progress
    if (room.status === 'in_progress' && room.gameId) {
      throw new Error('This game has already started.');
    }

    // Assign second player
    room.joinedPlayerId = userId;
    room.joinedPlayerProfile = {
      id: userId,
      userId: userId,
      name: userProfile?.full_name || userProfile?.name || 'Friend',
      ...(userProfile || {})
    };
    room.status = 'ready';

    this._clearFailedAttempts(rateKey);

    // Update DB
    if (this.db) {
      try {
        await this.db
          .from('games')
          .update({
            black_player_id: userId,
            status: 'pending'
          })
          .eq('id', room.id);
      } catch (err) {
        console.warn('[FriendRoomManager] DB join update notice:', err.message);
      }
    }

    // Notify Creator via WebSocket that friend has joined
    this._broadcastToUser(room.creatorId, 'friend.player_joined', {
      roomCode: room.roomCode,
      roomId: room.id,
      player: room.joinedPlayerProfile,
      status: 'ready'
    });

    return { room, role: 'joiner', isReconnect: false };
  }

  /**
   * Start the friend game when both players are present
   * Concurrency-safe: Exactly one GameRoom is initialized and both clients are notified.
   */
  async startGame(userId, rawCode) {
    const code = this.normalizeCode(rawCode);
    const room = await this.getRoom(code);

    if (!room) {
      throw new Error('Room not found or has expired.');
    }

    // Authorization: only participants can start
    if (room.creatorId !== userId && room.joinedPlayerId !== userId) {
      throw new Error('You are not a participant in this room.');
    }

    // Must have 2 players
    if (!room.creatorId || !room.joinedPlayerId) {
      throw new Error('Waiting for your friend to join. Both players must be present to start.');
    }

    // Idempotency: if already started, return existing game state
    if (room.status === 'in_progress' && room.gameId) {
      const existingRoom = this.gameManager.getRoom(room.gameId);
      if (existingRoom) {
        return { success: true, gameId: room.gameId, state: existingRoom.getState(), alreadyStarted: true };
      }
    }

    // Concurrency Lock
    if (room.starting) {
      // Another concurrent start request is already processing
      return { success: true, gameId: room.gameId, starting: true };
    }
    room.starting = true;

    try {
      // 50/50 fair randomized color assignment
      const creatorIsWhite = Math.random() < 0.5;
      const whiteUserId = creatorIsWhite ? room.creatorId : room.joinedPlayerId;
      const blackUserId = creatorIsWhite ? room.joinedPlayerId : room.creatorId;

      const whiteProfile = creatorIsWhite ? room.creatorProfile : room.joinedPlayerProfile;
      const blackProfile = creatorIsWhite ? room.joinedPlayerProfile : room.creatorProfile;

      // Create authoritative game in GameManager
      const gameRoom = await this.gameManager.createMatchedGame(
        whiteUserId,
        blackUserId,
        {
          timeControl: room.timeControl || '10min',
          gameType: 'friendly'
        }
      );

      room.status = 'in_progress';
      room.gameId = gameRoom.id;
      room.starting = false;

      const initialGameState = gameRoom.getState();

      // Build safe opponent profiles for both clients
      const whiteOpponentPayload = {
        id: blackProfile.id || blackUserId,
        name: blackProfile.full_name || blackProfile.name || 'Friend',
        rating: typeof blackProfile.rating === 'number' ? blackProfile.rating : null,
        skillLevel: blackProfile.skill_level || 'Intermediate',
        avatar: blackProfile.avatar || '/pixel_avatar.jpg'
      };

      const blackOpponentPayload = {
        id: whiteProfile.id || whiteUserId,
        name: whiteProfile.full_name || whiteProfile.name || 'Friend',
        rating: typeof whiteProfile.rating === 'number' ? whiteProfile.rating : null,
        skillLevel: whiteProfile.skill_level || 'Intermediate',
        avatar: whiteProfile.avatar || '/pixel_avatar.jpg'
      };

      // Broadcast game.matched to White player
      this._broadcastToUser(whiteUserId, MessageTypes.GAME_MATCHED, {
        gameId: gameRoom.id,
        roomCode: room.roomCode,
        assignedColor: 'w',
        opponentId: blackUserId,
        opponent: whiteOpponentPayload,
        timeControl: room.timeControl,
        gameType: 'friendly',
        state: initialGameState
      });

      // Broadcast game.matched to Black player
      this._broadcastToUser(blackUserId, MessageTypes.GAME_MATCHED, {
        gameId: gameRoom.id,
        roomCode: room.roomCode,
        assignedColor: 'b',
        opponentId: whiteUserId,
        opponent: blackOpponentPayload,
        timeControl: room.timeControl,
        gameType: 'friendly',
        state: initialGameState
      });

      return {
        success: true,
        gameId: gameRoom.id,
        roomCode: room.roomCode,
        state: initialGameState
      };
    } catch (err) {
      room.starting = false;
      throw err;
    }
  }

  /**
   * Leave or cancel a room
   */
  async leaveRoom(userId, rawCode) {
    const code = this.normalizeCode(rawCode);
    const room = this.roomsByCode.get(code);
    if (!room) return { success: true };

    if (room.creatorId === userId) {
      // Creator leaves: cancel room and notify joiner
      room.status = 'cancelled';
      if (room.joinedPlayerId) {
        this._broadcastToUser(room.joinedPlayerId, 'friend.room_cancelled', {
          roomCode: code,
          message: 'The room creator has left or cancelled the room.'
        });
      }
      this.roomsByCode.delete(code);
      this.roomsById.delete(room.id);
      return { success: true, cancelled: true };
    }

    if (room.joinedPlayerId === userId) {
      // Joined friend leaves before game started: reset room to waiting
      room.joinedPlayerId = null;
      room.joinedPlayerProfile = null;
      if (room.status !== 'in_progress') {
        room.status = 'waiting';
        this._broadcastToUser(room.creatorId, 'friend.player_left', {
          roomCode: code,
          message: 'Your friend has left the room.'
        });
      }
      return { success: true, left: true };
    }

    return { success: true };
  }

  /**
   * Helper to send JSON WebSocket frame to all active connections for a given user
   */
  _broadcastToUser(userId, messageType, payload) {
    if (!userId) return;
    const connections = this.connectionRegistry.getUserConnections(userId);
    const frame = formatResponse(messageType, payload);
    for (const conn of connections) {
      if (conn.socket && conn.socket.readyState === 1) {
        this.connectionRegistry.sendJson(conn.socket, frame);
      }
    }
  }

  /**
   * Purge expired waiting rooms
   */
  cleanupExpiredRooms() {
    const now = Date.now();
    for (const [code, room] of this.roomsByCode.entries()) {
      if (now > room.expiresAt && room.status !== 'in_progress') {
        this.roomsByCode.delete(code);
        this.roomsById.delete(room.id);
      }
    }
  }

  clear() {
    this.roomsByCode.clear();
    this.roomsById.clear();
    this.failedAttempts.clear();
    this.creationRate.clear();
  }
}

export const friendRoomManager = new FriendRoomManager();
