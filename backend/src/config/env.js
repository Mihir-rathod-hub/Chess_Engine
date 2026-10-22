import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from backend root
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const env = {
  PORT: process.env.PORT ? parseInt(process.env.PORT, 10) : 3001,
  HOST: process.env.HOST || '127.0.0.1',
  FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:5173',
  SUPABASE_URL: process.env.SUPABASE_URL || '',
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY || ''
};

export const isServiceRoleKey = Boolean(
  env.SUPABASE_SERVICE_ROLE_KEY &&
  !env.SUPABASE_SERVICE_ROLE_KEY.startsWith('sb_publishable_')
);

if (!env.SUPABASE_URL) {
  console.warn('[WARNING] SUPABASE_URL is missing in backend environment variables.');
}

if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[WARNING] SUPABASE_SERVICE_ROLE_KEY is missing in backend environment variables.');
} else if (!isServiceRoleKey) {
  console.warn(
    '[DATABASE NOTICE] SUPABASE_SERVICE_ROLE_KEY is configured with a publishable anon key (sb_publishable_...). ' +
    'Direct table updates on protected profiles will require the secret service_role key or public.record_match_completion_and_ratings() RPC.'
  );
}
