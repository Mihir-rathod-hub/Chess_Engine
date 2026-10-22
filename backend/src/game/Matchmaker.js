import { connectionRegistry } from '../websocket/registry/ConnectionRegistry.js';
import { gameManager } from './GameManager.js';
import { formatResponse } from '../websocket/protocol/messageFormatter.js';
import { MessageTypes } from '../websocket/protocol/messageTypes.js';

/**
 * Server-Side In-Memory Matchmaker (Step 4F-C)
 * Matches compatible online players into authoritative GameRooms.
 */
export class Matchmaker {
  constructor(gManager = gameManager, cRegistry = connectionRegistry) {
    this.gameManager = gManager;
    this.connectionRegistry = cRegistry;
    // Array of waiting tickets:
    // { userId, connectionId, socket, timeControl, gameType, queuedAt }
    this.queue = [];
  }

  getQueueSize() {
    return this.queue.length;
  }

  isUserQueued(userId) {
    return this.queue.some((entry) => entry.userId === userId);
  }

  getQueueEntry(userId) {
    return this.queue.find((entry) => entry.userId === userId) || null;
  }

  removeUser(userId) {
    const initialLen = this.queue.length;
    this.queue = this.queue.filter((entry) => entry.userId !== userId);
    return initialLen > this.queue.length;
  }

  removeConnection(connectionId) {
    const initialLen = this.queue.length;
    this.queue = this.queue.filter((entry) => entry.connectionId !== connectionId);
    return initialLen > this.queue.length;
  }

  cancelQueue(userId) {
    return this.removeUser(userId);
  }

  clearQueue() {
    this.queue = [];
  }

  _isSocketAlive(socket) {
    return Boolean(socket && socket.readyState === 1); // 1 = OPEN
  }

  _purgeStaleEntries() {
    this.queue = this.queue.filter((entry) => this._isSocketAlive(entry.socket));
  }

  async queuePlayer(userId, connectionId, socket, options = {}) {
    const { timeControl = '10min', gameType = 'casual', profile = null, requestId = null } = options;

    // 1. Prevent duplicate queue entries for the same user
    if (this.isUserQueued(userId)) {
      throw new Error('User is already in matchmaking queue.');
    }

    // 2. Filter out stale/disconnected entries before matching
    this._purgeStaleEntries();

    // 3. Search for a compatible opponent in queue:
    // - Must be a different user (cannot match with themselves)
    // - Must match requested timeControl
    // - Must match requested gameType
    // - Must have an active open WebSocket
    let opponentIndex = -1;
    for (let i = 0; i < this.queue.length; i++) {
      const entry = this.queue[i];
      if (
        entry.userId !== userId &&
        entry.timeControl === timeControl &&
        entry.gameType === gameType &&
        this._isSocketAlive(entry.socket)
      ) {
        opponentIndex = i;
        break;
      }
    }

    // Case A: No compatible opponent found -> add ticket to queue
    if (opponentIndex === -1) {
      const queueTicket = {
        userId,
        connectionId,
        socket,
        timeControl,
        gameType,
        profile,
        requestId,
        queuedAt: Date.now()
      };
      this.queue.push(queueTicket);
      return { matched: false, ticket: queueTicket };
    }

    // Case B: Compatible opponent found -> remove from queue and create game
    const [opponent] = this.queue.splice(opponentIndex, 1);

    // First queued player is White, incoming second player is Black (consistent assignment)
    const whitePlayer = opponent;
    const blackPlayer = { userId, connectionId, socket, timeControl, gameType, profile, requestId };

    // Create exactly one authoritative GameRoom for this match
    const room = await this.gameManager.createMatchedGame(
      whitePlayer.userId,
      blackPlayer.userId,
      { timeControl, gameType }
    );

    const initialGameState = room.getState();

    // Prepare safe, public opponent profile summaries
    const buildOpponentPayload = (ticket) => {
      const regMeta = this.connectionRegistry.getMetadata(ticket.userId) || {};
      const name = ticket.profile?.full_name || ticket.profile?.name || regMeta.fullName || 'Opponent';
      const rating = typeof ticket.profile?.rating === 'number'
        ? ticket.profile.rating
        : (typeof regMeta.rating === 'number' ? regMeta.rating : null);
      const ratingError = ticket.profile?.ratingError || regMeta.ratingError || null;
      const isUnrated = (rating === null) && !ratingError;
      const skillLevel = ticket.profile?.skill_level || ticket.profile?.skillLevel || regMeta.skillLevel || 'Intermediate';

      return {
        id: ticket.userId,
        name,
        rating,
        isUnrated,
        ratingError,
        skillLevel,
        avatar: '/pixel_avatar.jpg'
      };
    };

    const whiteOpponentPayload = buildOpponentPayload(blackPlayer);
    const blackOpponentPayload = buildOpponentPayload(whitePlayer);

    // Notify White player
    const whiteMatchFrame = formatResponse(MessageTypes.GAME_MATCHED, {
      gameId: room.id,
      assignedColor: 'w',
      opponentId: blackPlayer.userId,
      opponent: whiteOpponentPayload,
      timeControl,
      gameType,
      state: initialGameState
    });
    this.connectionRegistry.sendJson(whitePlayer.socket, whiteMatchFrame);

    // Notify Black player (incoming matching player receives their requestId acknowledgment)
    const blackMatchFrame = formatResponse(MessageTypes.GAME_MATCHED, {
      gameId: room.id,
      assignedColor: 'b',
      opponentId: whitePlayer.userId,
      opponent: blackOpponentPayload,
      timeControl,
      gameType,
      state: initialGameState
    }, blackPlayer.requestId || null);
    this.connectionRegistry.sendJson(blackPlayer.socket, blackMatchFrame);

    return {
      matched: true,
      gameId: room.id,
      whitePlayerId: whitePlayer.userId,
      blackPlayerId: blackPlayer.userId,
      room,
      state: initialGameState
    };
  }
}

export const matchmaker = new Matchmaker();
