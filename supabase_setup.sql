-- ====================================================================
-- CHESS ENGINE SUPABASE MASTER DATABASE SETUP (STEP 2B V2 HARDENED)
-- Run this script in the Supabase SQL Editor to set up or update the schema.
-- ====================================================================

-- 1. Create the `profiles` table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  skill_level TEXT,
  rating INTEGER DEFAULT 1200 NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. Enable Row Level Security (RLS) on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Row Level Security Policies for profiles
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view any profile" ON public.profiles;
CREATE POLICY "Authenticated users can view any profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Policy: Remove client INSERT permission on public.profiles (handled exclusively by handle_new_user trigger)
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

-- Explicit table grants so authenticated role can access rows permitted by RLS policies
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.profiles TO authenticated;
GRANT UPDATE (full_name, skill_level) ON public.profiles TO authenticated;

-- 4. PostgreSQL BEFORE UPDATE Trigger: Enforce database protection on `rating` & `created_at`
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('role', true) <> 'service_role' AND auth.uid() IS NOT NULL THEN
    NEW.rating := OLD.rating;
    NEW.created_at := OLD.created_at;
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS enforce_profile_field_protection ON public.profiles;
CREATE TRIGGER enforce_profile_field_protection
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- 5. Function and Trigger for automatic profile creation on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, skill_level, rating)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Chess Player'),
    NEW.raw_user_meta_data->>'skill_level',
    1200
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 6. Create `public.games` table for future game persistence & PvP history
CREATE TABLE IF NOT EXISTS public.games (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  white_player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  black_player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  game_type TEXT NOT NULL DEFAULT 'casual' CHECK (game_type IN ('casual', 'ranked', 'bot', 'friendly')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'completed', 'aborted', 'draw')),
  result TEXT CHECK (result IN ('white_win', 'black_win', 'draw', 'stalemate', 'resign', 'timeout', 'aborted')),
  winner_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  time_control TEXT NOT NULL DEFAULT '10min',
  fen TEXT NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT valid_players CHECK (white_player_id IS NULL OR black_player_id IS NULL OR white_player_id <> black_player_id)
);

-- 7. Create `public.game_moves` table for authoritative move logs & replay
CREATE TABLE IF NOT EXISTS public.game_moves (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_id UUID NOT NULL REFERENCES public.games(id) ON DELETE CASCADE,
  player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  move_number INTEGER NOT NULL CHECK (move_number > 0),
  san TEXT NOT NULL,
  lan TEXT,
  fen_after TEXT NOT NULL,
  time_spent_ms INTEGER DEFAULT 0 CHECK (time_spent_ms >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_game_move_number UNIQUE (game_id, move_number)
);

-- 8. Create `public.user_streaks` table
CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_active_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 9. Create Performance Indexes
CREATE INDEX IF NOT EXISTS idx_profiles_rating ON public.profiles (rating DESC, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_games_white_player ON public.games (white_player_id);
CREATE INDEX IF NOT EXISTS idx_games_black_player ON public.games (black_player_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON public.games (status);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON public.games (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_game_moves_game_seq ON public.game_moves (game_id, move_number ASC);

-- 10. Enable RLS and Policies for new tables
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated users can view games" ON public.games;
DROP POLICY IF EXISTS "Participants and public can view allowed games" ON public.games;
CREATE POLICY "Participants and public can view allowed games"
  ON public.games FOR SELECT TO authenticated
  USING (auth.uid() = white_player_id OR auth.uid() = black_player_id OR status = 'completed');

DROP POLICY IF EXISTS "Players can create games" ON public.games;
DROP POLICY IF EXISTS "Players can create pending games" ON public.games;
CREATE POLICY "Players can create pending games"
  ON public.games FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = white_player_id OR auth.uid() = black_player_id) AND status = 'pending' AND result IS NULL AND winner_id IS NULL);

DROP POLICY IF EXISTS "Authenticated users can view game moves" ON public.game_moves;
DROP POLICY IF EXISTS "Users can view game moves for allowed games" ON public.game_moves;
CREATE POLICY "Users can view game moves for allowed games"
  ON public.game_moves FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.games g WHERE g.id = game_id AND (g.white_player_id = auth.uid() OR g.black_player_id = auth.uid() OR g.status = 'completed')));

DROP POLICY IF EXISTS "Users can view streaks" ON public.user_streaks;
DROP POLICY IF EXISTS "Users can view own streak" ON public.user_streaks;
CREATE POLICY "Users can view own streak"
  ON public.user_streaks FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
