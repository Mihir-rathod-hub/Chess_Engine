import { authenticate } from '../plugins/auth.js';
import { gameManager } from '../game/GameManager.js';
import { sendSuccess, sendError } from '../utils/response.js';

/**
 * Games API Routes Plugin (Match History & Replays)
 */
export default async function gamesRoutes(fastify, options) {
  // 1. GET /api/games/history - Retrieve authenticated user's persistent match history
  fastify.get('/api/games/history', {
    preHandler: [authenticate],
    schema: {
      description: 'Get completed match history for the authenticated player',
      tags: ['Games'],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          offset: { type: 'integer', minimum: 0, default: 0 }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const history = await gameManager.getMatchHistory(request.user.id, request.query || {});
      return sendSuccess(reply, {
        userId: request.user.id,
        count: history.length,
        history
      });
    } catch (err) {
      request.log.error(`Match history retrieval error for ${request.user.id}:`, err);
      return sendError(
        reply,
        'Failed to retrieve match history.',
        'HISTORY_FETCH_ERROR',
        500
      );
    }
  });

  // 2. GET /api/games/:id - Retrieve authorized game details and move list
  fastify.get('/api/games/:id', {
    preHandler: [authenticate],
    schema: {
      description: 'Get authoritative details and move log for a specific game',
      tags: ['Games'],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    try {
      const details = await gameManager.getGameDetails(request.user.id, request.params.id);
      return sendSuccess(reply, details);
    } catch (err) {
      const statusCode = err.code === 'NOT_A_PLAYER' ? 403 : err.code === 'GAME_NOT_FOUND' ? 404 : 400;
      return sendError(
        reply,
        err.message || 'Game retrieval error.',
        err.code || 'GAME_FETCH_ERROR',
        statusCode
      );
    }
  });
}
