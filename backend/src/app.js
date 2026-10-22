import Fastify from 'fastify';
import cors from '@fastify/cors';
import sensible from '@fastify/sensible';
import { env } from './config/env.js';
import { sendError } from './utils/response.js';
import healthRoutes from './routes/health.js';
import authRoutes from './routes/auth.js';
import gamesRoutes from './routes/games.js';
import roomsRoutes from './routes/rooms.js';
import newsRoutes from './routes/news.js';
import websocketPlugin from './websocket/index.js';

/**
 * Fastify Server Factory
 */
export function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.NODE_ENV === 'test' ? 'error' : 'info',
      transport: process.env.NODE_ENV !== 'production'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname'
            }
          }
        : undefined
    }
  });

  // 1. CORS Configuration (Restricted to known frontend origin)
  fastify.register(cors, {
    origin: [env.FRONTEND_URL, 'http://localhost:5173', 'http://127.0.0.1:5173'],
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    credentials: true,
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
  });

  // 2. Sensible Utilities Plugin
  fastify.register(sensible);

  // 2b. Gracefully handle empty or whitespace application/json payloads
  fastify.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    if (!body || body.trim() === '') {
      return done(null, {});
    }
    try {
      const json = JSON.parse(body);
      done(null, json);
    } catch (err) {
      err.statusCode = 400;
      done(err, undefined);
    }
  });

  // 3. Centralized Error Handler
  fastify.setErrorHandler((error, request, reply) => {
    request.log.error(error);

    // Fastify Schema Validation Error
    if (error.validation) {
      return sendError(
        reply,
        'Invalid request data.',
        'BAD_REQUEST',
        400,
        error.validation
      );
    }

    const statusCode = error.statusCode || 500;
    const message = error.statusCode ? error.message : 'An unexpected server error occurred.';
    const errorCode = error.code || 'INTERNAL_SERVER_ERROR';

    return sendError(reply, message, errorCode, statusCode);
  });

  // 4. Register API Routes & WebSocket Plugin
  fastify.register(healthRoutes);
  fastify.register(authRoutes);
  fastify.register(gamesRoutes);
  fastify.register(roomsRoutes);
  fastify.register(newsRoutes);
  fastify.register(websocketPlugin);

  return fastify;
}

// Start Server if executed directly
if (process.argv[1] && process.argv[1].endsWith('app.js')) {
  const server = buildApp();

  const startServer = async () => {
    try {
      await server.listen({ port: env.PORT, host: env.HOST });
      server.log.info(`🚀 Strategic Chess Backend running at http://${env.HOST}:${env.PORT}`);
    } catch (err) {
      server.log.error('Error starting server:', err);
      process.exit(1);
    }
  };

  // Graceful Shutdown Signals
  const shutdown = async (signal) => {
    server.log.info(`Received ${signal}. Shutting down gracefully...`);
    try {
      await server.close();
      server.log.info('Server closed cleanly.');
      process.exit(0);
    } catch (err) {
      server.log.error('Error during server shutdown:', err);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  startServer();
}
