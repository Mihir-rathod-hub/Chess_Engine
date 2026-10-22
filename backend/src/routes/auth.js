import { authenticate } from '../plugins/auth.js';
import { sendSuccess } from '../utils/response.js';

/**
 * Authentication API Routes Plugin
 */
export default async function authRoutes(fastify, options) {
  fastify.get('/api/auth/me', {
    preHandler: [authenticate],
    schema: {
      description: 'Get authenticated user details derived from verified Supabase access token',
      tags: ['Authentication'],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' }
                  }
                },
                profile: {
                  type: ['object', 'null'],
                  properties: {
                    id: { type: 'string' },
                    full_name: { type: 'string' },
                    skill_level: { type: ['string', 'null'] },
                    rating: { type: ['number', 'null'] },
                    created_at: { type: 'string' }
                  }
                }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const user = request.user;
    const profile = request.profile;

    return sendSuccess(reply, {
      user: {
        id: user.id,
        email: user.email
      },
      profile: profile ? {
        id: profile.id,
        full_name: profile.full_name,
        skill_level: profile.skill_level,
        rating: profile.rating,
        created_at: profile.created_at
      } : null
    });
  });
}
