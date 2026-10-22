import { sendSuccess, sendError } from '../utils/response.js';
import { getNewsFeed } from '../services/newsService.js';

/**
 * Chess News API Routes Plugin
 */
export default async function newsRoutes(fastify, options) {
  fastify.get('/api/news', {
    schema: {
      description: 'Fetch aggregated, continuously updating chess news feed',
      tags: ['News'],
      querystring: {
        type: 'object',
        properties: {
          category: { type: 'string' },
          sort: { type: 'string', enum: ['balanced', 'newest'] },
          refresh: { type: 'string' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          offset: { type: 'integer', minimum: 0 },
          _t: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    // Explicitly disallow browser and proxy caching of the news endpoint
    reply.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    reply.header('Pragma', 'no-cache');
    reply.header('Expires', '0');

    try {
      const { category = 'ALL', sort = 'balanced', refresh, limit = 30, offset = 0 } = request.query;
      const forceRefresh = refresh === 'true' || refresh === true || refresh === '1';

      const feedData = await getNewsFeed({
        forceRefresh,
        category,
        sort,
        limit: parseInt(limit, 10) || 30,
        offset: parseInt(offset, 10) || 0
      });

      return sendSuccess(reply, feedData);
    } catch (err) {
      request.log.error(err, 'Error generating chess news feed');
      if (err.code === 'FEEDS_UNAVAILABLE') {
        return sendError(
          reply,
          'Chess news sources are temporarily unavailable. Please try again in a few moments.',
          'FEEDS_UNAVAILABLE',
          503
        );
      }
      return sendError(
        reply,
        'Failed to retrieve chess news feed.',
        'NEWS_FEED_ERROR',
        500
      );
    }
  });
}
