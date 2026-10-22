import { sendSuccess } from '../utils/response.js';

/**
 * Health Check API Route Plugin
 */
export default async function healthRoutes(fastify, options) {
  // Root ping endpoint for cloud platform health checks (Render, load balancers)
  fastify.route({
    method: ['GET', 'HEAD'],
    url: '/',
    handler: async (request, reply) => {
      return sendSuccess(reply, {
        status: 'ok',
        service: 'strategic-chess-backend',
        timestamp: new Date().toISOString()
      });
    }
  });

  fastify.get('/api/health', {
    schema: {
      description: 'Public health status check',
      tags: ['System'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: { type: 'string' },
                service: { type: 'string' },
                timestamp: { type: 'string' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    return sendSuccess(reply, {
      status: 'ok',
      service: 'strategic-chess-backend',
      timestamp: new Date().toISOString()
    });
  });
}
