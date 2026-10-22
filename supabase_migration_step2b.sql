-- ====================================================================
-- STRATEGIC CHESS — PRODUCTION DATABASE MIGRATION (STEP 2B)
-- Run this script in the Supabase SQL Editor to apply Step 2B changes.
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. HARDEN `public.profiles` RLS & PROTECT SENSITIVE COLUMNS
-- --------------------------------------------------------------------

-- A. Update SELECT policy so authenticated users can view public profiles & leaderboards
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Authenticated users can view any profile" ON public.profiles;

CREATE POLICY "Authenticated users can view any profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

-- B. Update UPDATE policy for user-controlled fields
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- C. PostgreSQL BEFORE UPDATE Trigger: Block client-side modification of `rating` & `created_at`
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- If update is executed by a standard authenticated user (auth.uid() is set)
  -- and NOT by the privileged service_role, force server-controlled fields to remain unchanged.
  IF current_setting('role', true) <> 'service_role' AND auth.uid() IS NOT NULL THEN
    NEW.rating := OLD.rating;
    NEW.created_at := OLD.created_at;
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS enforce_profile_field_protection ON public.profiles;
CREATE TRIGGER enforce_profile_field_protection
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();


-- --------------------------------------------------------------------
-- 2. CREATE `public.games` TABLE (FOUNDATION FOR FUTURE PVP & HISTORY)
-- --------------------------------------------------------------------

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


-- --------------------------------------------------------------------
-- 3. CREATE `public.game_moves` TABLE (AUTHORITATIVE MOVE LOGGING)
-- --------------------------------------------------------------------

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


-- --------------------------------------------------------------------
-- 4. CREATE `public.user_streaks` TABLE (SERVER-SIDE STREAK PERSISTENCE)
-- --------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_streaks (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak INTEGER NOT NULL DEFAULT 0 CHECK (current_streak >= 0),
  longest_streak INTEGER NOT NULL DEFAULT 0 CHECK (longest_streak >= 0),
  last_active_date DATE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- --------------------------------------------------------------------
-- 5. PERFORMANCE INDEXES
-- --------------------------------------------------------------------

-- Leaderboard fast index
CREATE INDEX IF NOT EXISTS idx_profiles_rating ON public.profiles (rating DESC, created_at ASC);

-- Games query indexes
CREATE INDEX IF NOT EXISTS idx_games_white_player ON public.games (white_player_id);
CREATE INDEX IF NOT EXISTS idx_games_black_player ON public.games (black_player_id);
CREATE INDEX IF NOT EXISTS idx_games_status ON public.games (status);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON public.games (created_at DESC);

-- Moves sequence index for game replays
CREATE INDEX IF NOT EXISTS idx_game_moves_game_seq ON public.game_moves (game_id, move_number ASC);


-- --------------------------------------------------------------------
-- 6. ROW LEVEL SECURITY (RLS) POLICIES FOR NEW TABLES
-- --------------------------------------------------------------------

ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.game_moves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_streaks ENABLE ROW LEVEL SECURITY;

-- Games Policies
DROP POLICY IF EXISTS "Authenticated users can view games" ON public.games;
CREATE POLICY "Authenticated users can view games"
  ON public.games FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Players can create games" ON public.games;
CREATE POLICY "Players can create games"
  ON public.games FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = white_player_id OR auth.uid() = black_player_id OR white_player_id IS NULL OR black_player_id IS NULL);

DROP POLICY IF EXISTS "Participants can update active games" ON public.games;
CREATE POLICY "Participants can update active games"
  ON public.games FOR UPDATE
  TO authenticated
  USING (auth.uid() = white_player_id OR auth.uid() = black_player_id);

-- Game Moves Policies
DROP POLICY IF EXISTS "Authenticated users can view game moves" ON public.game_moves;
CREATE POLICY "Authenticated users can view game moves"
  ON public.game_moves FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Players can record game moves" ON public.game_moves;
CREATE POLICY "Players can record game moves"
  ON public.game_moves FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.games g
      WHERE g.id = game_id AND (g.white_player_id = auth.uid() OR g.black_player_id = auth.uid())
    )
  );

-- User Streaks Policies
DROP POLICY IF EXISTS "Users can view streaks" ON public.user_streaks;
CREATE POLICY "Users can view streaks"
  ON public.user_streaks FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Users can insert own streak" ON public.user_streaks;
CREATE POLICY "Users can insert own streak"
  ON public.user_streaks FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own streak" ON public.user_streaks;
CREATE POLICY "Users can update own streak"
  ON public.user_streaks FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);
