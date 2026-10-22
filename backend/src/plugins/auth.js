import { createClient } from '@supabase/supabase-js';
import { supabaseAdmin } from '../config/supabase.js';
import { env } from '../config/env.js';
import { sendError } from '../utils/response.js';

/**
 * Reusable Fastify preHandler Authentication Hook
 * Verifies Supabase access token provided in the Authorization header.
 */
export async function authenticate(request, reply) {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return sendError(
        reply,
        'Authentication required. Please provide a Bearer access token in the Authorization header.',
        'UNAUTHORIZED',
        401
      );
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return sendError(
        reply,
        'Malformed Authorization header. Missing Bearer token.',
        'UNAUTHORIZED',
        401
      );
    }

    // Support guest mode or unconfigured Supabase backend
    if (!supabaseAdmin || token.startsWith('guest_')) {
      const guestId = token.startsWith('guest_') ? token : `guest_${Date.now()}`;
      request.user = {
        id: guestId,
        email: 'guest@strategic-chess.local',
        user_metadata: { full_name: 'Guest Player' }
      };
      request.profile = {
        id: guestId,
        full_name: 'Guest Player',
        skill_level: 'Intermediate',
        rating: 1200,
        created_at: new Date().toISOString()
      };
      return;
    }

    // Verify token with trusted Supabase auth service
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);

    if (authError || !user) {
      return sendError(
        reply,
        'Invalid or expired access token.',
        'UNAUTHORIZED',
        401
      );
    }

    // Fetch user profile from public.profiles table
    let userProfile = null;
    try {
      if (token && env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
        const userClient = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
          global: {
            headers: {
              apikey: env.SUPABASE_SERVICE_ROLE_KEY,
              Authorization: `Bearer ${token}`
            }
          }
        });
        const { data: profile } = await userClient
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        if (profile) userProfile = profile;
      }

      if (!userProfile) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single();
        userProfile = profile ?? null;
      }
    } catch (err) {
      request.log.warn(`Profile fetch notice for user ${user.id}: ${err.message}`);
    }

    // Attach authenticated context to Fastify request object
    request.user = user;
    request.profile = userProfile;

  } catch (err) {
    request.log.error('Authentication Error:', err);
    return sendError(
      reply,
      'Authentication verification failed.',
      'UNAUTHORIZED',
      401
    );
  }
}
