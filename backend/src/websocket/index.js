import fastifyWebsocket from '@fastify/websocket';
import { handleWebSocketConnection } from './handlers/connectionHandler.js';
import { connectionRegistry } from './registry/ConnectionRegistry.js';

/**
 * Fastify WebSocket Infrastructure Plugin
 */
export default async function websocketPlugin(fastify, options) {
  // 1. Register official Fastify WebSocket plugin
  await fastify.register(fastifyWebsocket, {
    options: {
      maxPayload: 1048576, // 1MB payload limit to prevent buffer flood attacks
    }
  });

  // 2. Register WebSocket endpoint GET /ws
  fastify.get('/ws', { websocket: true }, (connection, req) => {
    // Fastify-websocket v10+ provides connection.socket or connection
    const socket = connection.socket || connection;
    handleWebSocketConnection(socket, req, fastify.log);
  });

  // 3. Graceful Shutdown Hook: Close active sockets cleanly when Fastify shuts down
  fastify.addHook('onClose', async (instance) => {
    instance.log.info('Closing all active WebSocket connections for graceful shutdown...');
    connectionRegistry.closeAll();
  });
}
