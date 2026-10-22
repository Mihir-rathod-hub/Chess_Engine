import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../../config/supabase.js';
import { env } from '../../config/env.js';
import { connectionRegistry } from '../registry/ConnectionRegistry.js';
import { matchmaker } from '../../game/Matchmaker.js';
import { gameManager } from '../../game/GameManager.js';
import { MessageTypes, ErrorCodes } from '../protocol/messageTypes.js';
import { formatResponse, formatError } from '../protocol/messageFormatter.js';
import { handleParsedMessage } from './messageRouter.js';

let connectionCounter = 0;

/**
 * Fetch authenticated user profile using user token with full metadata fallback
 */
async function fetchUserProfile(user, token, logger) {
  let profile = null;
  let lookupError = null;

  // 1. If we have the user's JWT, query public.profiles with an authenticated user client.
  // Note: PostgREST requires both the project apikey and the user Authorization Bearer header.
  if (token && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    try {
      const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: {
            apikey: env.SUPABASE_SERVICE_ROLE_KEY,
            Authorization: `Bearer ${token}`
          }
        }
      });
      const { data, error } = await userClient
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!error && data) {
        profile = data;
      } else if (error) {
        lookupError = error.message;
        logger?.warn?.(`User-token profile query notice for ${user.id}: ${error.message}`);
      }
    } catch (e) {
      lookupError = e.message;
      logger?.warn?.(`User-token profile query exception for ${user.id}: ${e.message}`);
    }
  }

  // 2. If token client query didn't return profile, attempt with supabaseAdmin
  if (!profile && supabaseAdmin) {
    try {
      const { data, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
      if (!error && data) {
        profile = data;
        lookupError = null;
      } else if (error && !lookupError) {
        lookupError = error.message;
      }
    } catch (e) {
      if (!lookupError) lookupError = e.message;
    }
  }

  // 3. Robust fallback: user.user_metadata or user.email
  const resolvedName = profile?.full_name ||
    user?.user_metadata?.full_name ||
    user?.raw_user_meta_data?.full_name ||
    (user?.email ? user.email.split('@')[0] : null) ||
    'Player';

  // Authoritative rating: exact persisted rating from public.profiles
  const resolvedRating = typeof profile?.rating === 'number'
    ? profile.rating
    : (typeof user?.user_metadata?.rating === 'number'
        ? user.user_metadata.rating
        : (user?.user_metadata?.rating ? parseInt(user.user_metadata.rating, 10) : null));

  const resolvedSkill = profile?.skill_level ||
    user?.user_metadata?.skill_level ||
    'Intermediate';

  return {
    id: user.id,
    full_name: resolvedName,
    rating: resolvedRating,
    ratingError: lookupError && resolvedRating === null ? lookupError : null,
    skill_level: resolvedSkill
  };
}

/**
 * Handle new incoming WebSocket connection lifecycle
 */
export async function handleWebSocketConnection(socket, req, logger) {
  const connectionId = `conn_${Date.now()}_${++connectionCounter}`;
  let isAuthenticated = false;
  let userId = null;
  let userProfile = null;
  let heartbeatTimer = null;

  logger.info(`New WebSocket connection initiated: ${connectionId}`);

  // Setup Heartbeat Ping/Pong tracking
  socket.isAlive = true;
  socket.on('pong', () => {
    socket.isAlive = true;
  });

  heartbeatTimer = setInterval(async () => {
    if (socket.isAlive === false) {
      logger.info(`Terminating stale/dead WebSocket connection: ${connectionId}`);
      clearInterval(heartbeatTimer);
      if (isAuthenticated && userId) {
        matchmaker.removeConnection(connectionId);
        matchmaker.removeUser(userId);
        connectionRegistry.unregister(userId, connectionId);
        if (connectionRegistry.getUserConnections(userId).length === 0) {
          try {
            await gameManager.handlePlayerDisconnect(userId);
          } catch (e) {}
        }
      }
      return socket.terminate();
    }

    socket.isAlive = false;
    try {
      socket.ping();
    } catch (e) {
      clearInterval(heartbeatTimer);
    }
  }, 30000); // 30 second ping check interval

  // Check for authentication token in query parameter: ws://host/ws?token=<access_token>
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const tokenFromQuery = urlObj.searchParams.get('token');

  // Helper to complete authentication
  const completeAuth = (user, profile) => {
    if (authTimeoutTimer) clearTimeout(authTimeoutTimer);
    isAuthenticated = true;
    userId = user.id;
    userProfile = profile;

    // Register in server-side connection registry with complete profile details
    connectionRegistry.register(userId, connectionId, socket, {
      email: user.email,
      fullName: profile?.full_name || 'Player',
      rating: typeof profile?.rating === 'number' ? profile.rating : (profile?.rating ?? null),
      ratingError: profile?.ratingError || null,
      skillLevel: profile?.skill_level || 'Intermediate'
    });

    logger.info(`WebSocket connection authenticated: ${connectionId} (User: ${userId}, Name: ${profile?.full_name})`);

    const authSuccessFrame = formatResponse(MessageTypes.AUTHENTICATED, {
      userId,
      connectionId,
      profile: userProfile ? {
        id: userProfile.id,
        full_name: userProfile.full_name,
        skill_level: userProfile.skill_level,
        rating: userProfile.rating,
        ratingError: userProfile.ratingError || null
      } : null
    });

    connectionRegistry.sendJson(socket, authSuccessFrame);
  };

  // Helper to reject authentication
  const rejectAuth = (reason) => {
    if (authTimeoutTimer) clearTimeout(authTimeoutTimer);
    logger.warn(`WebSocket auth failed (${connectionId}): ${reason}`);
    const errorFrame = formatError(reason, ErrorCodes.UNAUTHORIZED);
    connectionRegistry.sendJson(socket, errorFrame);

    setTimeout(() => {
      try {
        socket.close(4001, 'Unauthorized');
      } catch (e) {}
    }, 100);
  };

  let authTimeoutTimer = null;

  // 1. Authenticate immediately if token was provided in URL query string
  if (tokenFromQuery) {
    try {
      const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(tokenFromQuery);
      if (authError || !user) {
        return rejectAuth('Invalid or expired authentication token.');
      }

      const profile = await fetchUserProfile(user, tokenFromQuery, logger);
      completeAuth(user, profile);
    } catch (err) {
      return rejectAuth('Authentication processing error.');
    }
  } else {
    // If no token in query string, give client 500ms to send connection.auth frame, otherwise reject
    authTimeoutTimer = setTimeout(() => {
      if (!isAuthenticated) {
        rejectAuth('Connection unauthenticated. Token required.');
      }
    }, 500);
  }

  // 2. Incoming Message Listener
  socket.on('message', async (rawData) => {
    try {
      // If connection is not yet authenticated, check if this is a connection.auth payload
      if (!isAuthenticated) {
        try {
          const parsed = JSON.parse(rawData.toString());
          if (parsed && parsed.type === MessageTypes.AUTH && parsed.payload?.token) {
            const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(parsed.payload.token);
            if (authError || !user) {
              return rejectAuth('Invalid or expired authentication token.');
            }

            const profile = await fetchUserProfile(user, parsed.payload.token, logger);
            return completeAuth(user, profile);
          }
        } catch (e) {}

        return rejectAuth('Connection unauthenticated. Authentication required.');
      }

      // If authenticated, route to message handler
      await handleParsedMessage(
        { userId, connectionId, profile: userProfile },
        rawData,
        socket,
        logger
      );
    } catch (err) {
      logger.error(`Error processing message on ${connectionId}:`, err);
    }
  });

  // 3. Socket Close & Error Cleanup
  socket.on('close', async (code, reason) => {
    clearInterval(heartbeatTimer);
    matchmaker.removeConnection(connectionId);
    if (isAuthenticated && userId) {
      matchmaker.removeUser(userId);
      connectionRegistry.unregister(userId, connectionId);
      logger.info(`WebSocket closed cleanly: ${connectionId} (Code: ${code})`);

      // If user has no more active connections (e.g. browser refresh or tab closed)
      if (connectionRegistry.getUserConnections(userId).length === 0) {
        try {
          await gameManager.handlePlayerDisconnect(userId);
        } catch (err) {
          logger.error(`Error handling disconnect grace for ${userId}:`, err);
        }
      }
    }
  });

  socket.on('error', async (err) => {
    logger.error(`WebSocket error on ${connectionId}:`, err);
    clearInterval(heartbeatTimer);
    matchmaker.removeConnection(connectionId);
    if (isAuthenticated && userId) {
      matchmaker.removeUser(userId);
      connectionRegistry.unregister(userId, connectionId);

      if (connectionRegistry.getUserConnections(userId).length === 0) {
        try {
          await gameManager.handlePlayerDisconnect(userId);
        } catch (e) {}
      }
    }
  });
}
