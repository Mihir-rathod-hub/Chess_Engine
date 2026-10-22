import { authenticate } from '../plugins/auth.js';
import { friendRoomManager } from '../game/FriendRoomManager.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * Fastify REST Routes for Play with Friends private rooms
 */
export default async function roomsRoutes(fastify, options) {
  // 1. POST /api/rooms/create - Create a new friendly game room
  fastify.post('/api/rooms/create', {
    preHandler: [authenticate],
    schema: {
      description: 'Create a new private friend room with a unique room code',
      tags: ['Rooms'],
      body: {
        type: 'object',
        properties: {
          timeControl: { type: 'string', default: '10min' },
          gameType: { type: 'string', default: 'friendly' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const room = await friendRoomManager.createRoom(request.user.id, {
        timeControl: request.body?.timeControl || '10min',
        gameType: 'friendly',
        creatorProfile: {
          id: request.user.id,
          name: request.user.user_metadata?.full_name || request.user.email?.split('@')[0] || 'Host'
        }
      });

      return sendSuccess(reply, {
        roomCode: room.roomCode,
        roomId: room.id,
        timeControl: room.timeControl,
        status: room.status,
        expiresAt: room.expiresAt
      }, 201);
    } catch (err) {
      request.log.warn(`Room creation error for ${request.user.id}: ${err.message}`);
      return sendError(reply, err.message, 'ROOM_CREATE_ERROR', 400);
    }
  });

  // 2. GET /api/rooms/:code - Validate and retrieve room details
  fastify.get('/api/rooms/:code', {
    preHandler: [authenticate],
    schema: {
      description: 'Validate and get information for a friend room code',
      tags: ['Rooms'],
      params: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const room = await friendRoomManager.getRoom(request.params.code);
      if (!room) {
        return sendError(reply, 'Room not found or has expired.', 'ROOM_NOT_FOUND', 404);
      }

      return sendSuccess(reply, {
        roomCode: room.roomCode,
        roomId: room.id,
        status: room.status,
        timeControl: room.timeControl,
        host: room.creatorProfile,
        hasGuest: Boolean(room.joinedPlayerId),
        isCreator: room.creatorId === request.user.id,
        expiresAt: room.expiresAt
      });
    } catch (err) {
      return sendError(reply, err.message, 'ROOM_FETCH_ERROR', 400);
    }
  });

  // 3. POST /api/rooms/:code/join - Join a friendly game room
  fastify.post('/api/rooms/:code/join', {
    preHandler: [authenticate],
    schema: {
      description: 'Join a private room as the second player',
      tags: ['Rooms'],
      params: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        nullable: true,
        additionalProperties: true
      }
    }
  }, async (request, reply) => {
    try {
      const joinResult = await friendRoomManager.joinRoom(
        request.user.id,
        request.params.code,
        {
          id: request.user.id,
          name: request.user.user_metadata?.full_name || request.user.email?.split('@')[0] || 'Friend'
        },
        request.ip
      );

      return sendSuccess(reply, {
        roomCode: joinResult.room.roomCode,
        roomId: joinResult.room.id,
        role: joinResult.role,
        status: joinResult.room.status,
        host: joinResult.room.creatorProfile,
        timeControl: joinResult.room.timeControl
      });
    } catch (err) {
      const errLower = err.message.toLowerCase();
      const code = errLower.includes('expired')
        ? 'ROOM_EXPIRED'
        : errLower.includes('full')
          ? 'ROOM_FULL'
          : errLower.includes('own room')
            ? 'CANNOT_JOIN_OWN_ROOM'
            : errLower.includes('not found')
              ? 'ROOM_NOT_FOUND'
              : 'ROOM_JOIN_ERROR';
      const statusCode = code === 'ROOM_NOT_FOUND' ? 404 : 400;
      return sendError(reply, err.message, code, statusCode);
    }
  });

  // 4. POST /api/rooms/:code/start - Authoritative game initialization
  fastify.post('/api/rooms/:code/start', {
    preHandler: [authenticate],
    schema: {
      description: 'Start match for room when both players are present',
      tags: ['Rooms'],
      params: {
        type: 'object',
        required: ['code'],
        properties: {
          code: { type: 'string' }
        }
      },
      body: {
        type: 'object',
        nullable: true,
        additionalProperties: true
      }
    }
  }, async (request, reply) => {
    try {
      const startResult = await friendRoomManager.startGame(request.user.id, request.params.code);
      return sendSuccess(reply, startResult);
    } catch (err) {
      return sendError(reply, err.message, 'ROOM_START_ERROR', 400);
    }
  });
}
