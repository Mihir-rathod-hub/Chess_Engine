import { MessageTypes, ErrorCodes } from '../protocol/messageTypes.js';
import { formatResponse, formatError } from '../protocol/messageFormatter.js';
import { connectionRegistry } from '../registry/ConnectionRegistry.js';
import { gameManager } from '../../game/GameManager.js';
import { matchmaker } from '../../game/Matchmaker.js';
import { friendRoomManager } from '../../game/FriendRoomManager.js';
import { GameError } from '../../game/gameErrors.js';

/**
 * Handle incoming parsed WebSocket protocol message (Extended for Game Protocol)
 */
export async function handleParsedMessage(session, rawData, socket, logger) {
  const { userId, connectionId } = session;
  let parsed;

  // 1. JSON Parsing Validation
  try {
    parsed = JSON.parse(rawData.toString());
  } catch (err) {
    logger?.warn?.(`Malformed JSON received from connection ${connectionId}: ${err.message}`);
    const errorFrame = formatError(
      'Invalid JSON message format.',
      ErrorCodes.INVALID_JSON
    );
    return connectionRegistry.sendJson(socket, errorFrame);
  }

  // 2. Message Schema Structure Check
  if (!parsed || typeof parsed !== 'object' || !parsed.type || typeof parsed.type !== 'string') {
    logger?.warn?.(`Invalid message schema from connection ${connectionId}`);
    const errorFrame = formatError(
      'Malformed message structure. "type" field string required.',
      ErrorCodes.MALFORMED_MESSAGE,
      parsed?.requestId || null
    );
    return connectionRegistry.sendJson(socket, errorFrame);
  }

  const { type, requestId, payload = {} } = parsed;

  // 3. Message Routing
  try {
    switch (type) {
      case MessageTypes.PING: {
        const responseFrame = formatResponse(
          MessageTypes.PONG,
          { timestamp: new Date().toISOString() },
          requestId
        );
        return connectionRegistry.sendJson(socket, responseFrame);
      }

      case MessageTypes.PRESENCE_INFO: {
        const activeConnections = connectionRegistry.getUserConnections(userId);
        const responseFrame = formatResponse(
          MessageTypes.PRESENCE_DATA,
          {
            userId,
            connectionId,
            activeConnectionsCount: activeConnections.length,
            totalUsersOnline: connectionRegistry.getActiveUserCount()
          },
          requestId
        );
        return connectionRegistry.sendJson(socket, responseFrame);
      }

      // --- GAME PROTOCOL HANDLERS ---
      case MessageTypes.GAME_MATCHMAKE: {
        const timeControl = payload.timeControl || '10min';
        const gameType = payload.gameType || 'casual';

        try {
          const matchResult = await matchmaker.queuePlayer(userId, connectionId, socket, {
            timeControl,
            gameType,
            profile: session.profile || null,
            requestId
          });

          if (!matchResult.matched) {
            const frame = formatResponse(
              MessageTypes.GAME_QUEUED,
              {
                timeControl,
                gameType,
                status: 'waiting'
              },
              requestId
            );
            return connectionRegistry.sendJson(socket, frame);
          }
          return;
        } catch (err) {
          const code = err.message.includes('already in matchmaking')
            ? ErrorCodes.ALREADY_QUEUED
            : ErrorCodes.INVALID_GAME_REQUEST;
          const errorFrame = formatError(err.message, code, requestId);
          return connectionRegistry.sendJson(socket, errorFrame);
        }
      }

      case MessageTypes.GAME_MATCHMAKE_CANCEL: {
        const removed = matchmaker.cancelQueue(userId);
        const frame = formatResponse(
          MessageTypes.GAME_MATCHMAKE_CANCELLED,
          { cancelled: removed },
          requestId
        );
        return connectionRegistry.sendJson(socket, frame);
      }

      case MessageTypes.GAME_CREATE: {
        const room = await gameManager.createGame(userId, {
          gameType: payload.gameType || 'casual',
          timeControl: payload.timeControl || '10min'
        });

        const frame = formatResponse(
          MessageTypes.GAME_CREATED,
          { gameId: room.id, state: room.getState() },
          requestId
        );
        return connectionRegistry.sendJson(socket, frame);
      }

      case MessageTypes.GAME_JOIN: {
        if (!payload.gameId) {
          throw new GameError('gameId parameter is required in payload.', ErrorCodes.INVALID_GAME_REQUEST);
        }
        const { room, assignedColor } = await gameManager.joinGame(userId, payload.gameId);

        const frame = formatResponse(
          MessageTypes.GAME_JOINED,
          { gameId: room.id, assignedColor, state: room.getState() },
          requestId
        );
        return connectionRegistry.sendJson(socket, frame);
      }

      // --- FRIEND ROOM PROTOCOL HANDLERS ---
      case MessageTypes.FRIEND_CREATE: {
        const room = await friendRoomManager.createRoom(userId, {
          timeControl: payload.timeControl || '10min',
          gameType: 'friendly',
          creatorProfile: session.profile || null
        });

        const frame = formatResponse(
          MessageTypes.FRIEND_CREATED,
          {
            roomCode: room.roomCode,
            roomId: room.id,
            timeControl: room.timeControl,
            status: room.status,
            expiresAt: room.expiresAt
          },
          requestId
        );
        return connectionRegistry.sendJson(socket, frame);
      }

      case MessageTypes.FRIEND_JOIN: {
        if (!payload.roomCode) {
          throw new GameError('roomCode parameter is required.', ErrorCodes.INVALID_GAME_REQUEST);
        }

        const joinResult = await friendRoomManager.joinRoom(
          userId,
          payload.roomCode,
          session.profile || null,
          connectionId
        );

        const frame = formatResponse(
          MessageTypes.FRIEND_JOINED,
          {
            roomCode: joinResult.room.roomCode,
            roomId: joinResult.room.id,
            status: joinResult.room.status,
            host: joinResult.room.creatorProfile,
            timeControl: joinResult.room.timeControl
          },
          requestId
        );
        return connectionRegistry.sendJson(socket, frame);
      }

      case MessageTypes.FRIEND_START: {
        if (!payload.roomCode) {
          throw new GameError('roomCode parameter is required.', ErrorCodes.INVALID_GAME_REQUEST);
        }

        const startResult = await friendRoomManager.startGame(userId, payload.roomCode);
        const frame = formatResponse(
          MessageTypes.FRIEND_STARTED,
          {
            roomCode: startResult.roomCode,
            gameId: startResult.gameId,
            state: startResult.state
          },
          requestId
        );
        return connectionRegistry.sendJson(socket, frame);
      }

      case MessageTypes.FRIEND_INFO: {
        if (!payload.roomCode) {
          throw new GameError('roomCode parameter is required.', ErrorCodes.INVALID_GAME_REQUEST);
        }
        const room = await friendRoomManager.getRoom(payload.roomCode);
        if (!room) {
          throw new GameError('Room not found or has expired.', ErrorCodes.ROOM_NOT_FOUND);
        }

        const frame = formatResponse(
          'friend.info',
          {
            roomCode: room.roomCode,
            status: room.status,
            timeControl: room.timeControl,
            host: room.creatorProfile,
            hasGuest: Boolean(room.joinedPlayerId),
            isCreator: room.creatorId === userId
          },
          requestId
        );
        return connectionRegistry.sendJson(socket, frame);
      }

      case MessageTypes.FRIEND_LEAVE: {
        const leaveResult = await friendRoomManager.leaveRoom(userId, payload.roomCode);
        const frame = formatResponse(
          'friend.left',
          leaveResult,
          requestId
        );
        return connectionRegistry.sendJson(socket, frame);
      }

      case MessageTypes.GAME_RECONNECT: {
        const gameId = payload.gameId || null;
        const { room, assignedColor, opponent } = await gameManager.reconnectPlayer(userId, gameId);

        const frame = formatResponse(
          MessageTypes.GAME_RECONNECTED,
          {
            gameId: room.id,
            assignedColor,
            state: room.getState(),
            opponent: opponent || null,
            moveHistory: room.moveHistory
          },
          requestId
        );
        return connectionRegistry.sendJson(socket, frame);
      }

      case MessageTypes.GAME_MOVE: {
        if (!payload.gameId || !payload.from || !payload.to) {
          throw new GameError('game.move requires gameId, from, and to squares.', ErrorCodes.INVALID_GAME_REQUEST);
        }

        // Execute move on authoritative game manager
        const { move, state } = await gameManager.processMove(userId, payload.gameId, {
          from: payload.from,
          to: payload.to,
          promotion: payload.promotion || 'q'
        });

        const frame = formatResponse(
          MessageTypes.GAME_MOVE_RESULT,
          { move, state },
          requestId
        );
        return connectionRegistry.sendJson(socket, frame);
      }

      case MessageTypes.GAME_RESIGN: {
        if (!payload.gameId) {
          throw new GameError('gameId is required for resignation.', ErrorCodes.INVALID_GAME_REQUEST);
        }
        const state = await gameManager.processResign(userId, payload.gameId);
        const frame = formatResponse(
          MessageTypes.GAME_ENDED,
          { state },
          requestId
        );
        return connectionRegistry.sendJson(socket, frame);
      }

      case MessageTypes.GAME_OFFER_DRAW: {
        if (!payload.gameId) {
          throw new GameError('gameId is required.', ErrorCodes.INVALID_GAME_REQUEST);
        }
        const room = gameManager.getRoom(payload.gameId);
        if (!room) {
          throw new GameError(`Game ${payload.gameId} not found.`, ErrorCodes.GAME_NOT_FOUND);
        }
        const drawResult = room.offerDraw(userId);
        gameManager.broadcastGameState(room, 'game.state', drawResult);
        return connectionRegistry.sendJson(socket, formatResponse('game.draw_offered', drawResult, requestId));
      }

      case MessageTypes.GAME_RESPOND_DRAW: {
        if (!payload.gameId || typeof payload.accept !== 'boolean') {
          throw new GameError('gameId and accept boolean required.', ErrorCodes.INVALID_GAME_REQUEST);
        }
        const state = await gameManager.processRespondDraw(userId, payload.gameId, payload.accept);
        return connectionRegistry.sendJson(socket, formatResponse('game.draw_response', { accept: payload.accept, state }, requestId));
      }

      default: {
        logger?.warn?.(`Unsupported message type "${type}" from connection ${connectionId}`);
        const errorFrame = formatError(
          `Unsupported message type "${type}".`,
          ErrorCodes.UNKNOWN_MESSAGE_TYPE,
          requestId
        );
        return connectionRegistry.sendJson(socket, errorFrame);
      }
    }
  } catch (err) {
    logger?.warn?.(`Game message execution error on ${connectionId}: ${err.message}`);
    const errorCode = err.code || ErrorCodes.INTERNAL_ERROR;
    const errorFrame = formatError(
      err.message || 'An unexpected error occurred processing game request.',
      errorCode,
      requestId
    );
    return connectionRegistry.sendJson(socket, errorFrame);
  }
}
