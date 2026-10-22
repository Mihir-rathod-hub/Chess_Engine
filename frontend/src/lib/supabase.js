import { createClient } from '@supabase/supabase-js';

const rawUrl = (import.meta.env.VITE_SUPABASE_URL || 'https://placeholder.supabase.co').trim();
// Automatically sanitize accidental duplicate https:// prefixes or trailing slashes
const supabaseUrl = rawUrl.replace(/^(https?:\/\/)+/i, 'https://').replace(/\/+$/, '');
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || 'placeholder-anon-key').trim();

export const isSupabaseConfigured = Boolean(
  supabaseUrl &&
  !supabaseUrl.includes('placeholder') &&
  supabaseAnonKey &&
  !supabaseAnonKey.includes('placeholder')
);

if (!isSupabaseConfigured) {
  console.warn('Supabase URL or Anon Key is missing or placeholder. Running in guest/local mode.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
