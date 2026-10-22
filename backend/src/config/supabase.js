import { createClient } from '@supabase/supabase-js';
import { env, isServiceRoleKey } from './env.js';

export { isServiceRoleKey };

if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[SUPABASE CONFIG] Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing.');
}

// Trusted backend Supabase client
export const supabaseAdmin = env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(
      env.SUPABASE_URL,
      env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )
  : null;
