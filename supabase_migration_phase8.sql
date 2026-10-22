-- ====================================================================
-- STRATEGIC CHESS — PHASE 8 PRODUCTION DATABASE MIGRATION
-- REAL RATINGS PERSISTENCE & MATCH HISTORY
-- ====================================================================
-- Apply this migration in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/eqxjnvfnquoktfxybqhi/sql
-- ====================================================================

-- --------------------------------------------------------------------
-- 1. PERFORMANCE INDEXES FOR MATCH HISTORY & REPLAY
-- --------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_games_white_completed 
  ON public.games (white_player_id, status, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_games_black_completed 
  ON public.games (black_player_id, status, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_games_completed_at_desc 
  ON public.games (completed_at DESC) 
  WHERE status = 'completed';

CREATE INDEX IF NOT EXISTS idx_game_moves_game_number 
  ON public.game_moves (game_id, move_number ASC);

-- --------------------------------------------------------------------
-- 2. EXPLICIT GRANTS FOR AUTHENTICATED & SERVICE ROLES UNDER RLS
-- --------------------------------------------------------------------
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT ON public.games TO authenticated;
GRANT SELECT ON public.game_moves TO authenticated;

-- Ensure service_role has unconditional write and bypass grants on competitive tables
GRANT ALL ON public.games TO service_role;
GRANT ALL ON public.profiles TO service_role;
GRANT ALL ON public.game_moves TO service_role;
GRANT ALL ON public.user_streaks TO service_role;

-- --------------------------------------------------------------------
-- 3. HARDEN PROFILE FIELD PROTECTION TRIGGER
-- --------------------------------------------------------------------
-- Allow rating updates initiated by:
-- a) service_role
-- b) authoritative backend RPC function via session variable
-- Direct client UPDATE attempts on rating remain strictly blocked.
CREATE OR REPLACE FUNCTION public.protect_profile_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF current_setting('role', true) <> 'service_role' 
     AND COALESCE(current_setting('app.authoritative_rating_update', true), 'false') <> 'true'
     AND auth.uid() IS NOT NULL THEN
    NEW.rating := OLD.rating;
    NEW.created_at := OLD.created_at;
    NEW.id := OLD.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_catalog;

DROP TRIGGER IF EXISTS enforce_profile_field_protection ON public.profiles;
CREATE TRIGGER enforce_profile_field_protection
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_fields();

-- --------------------------------------------------------------------
-- 4. ATOMIC MATCH COMPLETION & ELO RATINGS PERSISTENCE FUNCTION
-- --------------------------------------------------------------------
-- Safely executes match completion and rating updates within a single
-- atomic database transaction with idempotency protection.
CREATE OR REPLACE FUNCTION public.record_match_completion_and_ratings(
  p_game_id UUID,
  p_result TEXT,
  p_winner_id UUID DEFAULT NULL,
  p_white_player_id UUID DEFAULT NULL,
  p_black_player_id UUID DEFAULT NULL,
  p_white_new_rating INT DEFAULT NULL,
  p_black_new_rating INT DEFAULT NULL,
  p_pgn TEXT DEFAULT ''
)
RETURNS JSONB AS $$
DECLARE
  v_game_status TEXT;
  v_white_id UUID;
  v_black_id UUID;
BEGIN
  -- Set transaction-scoped flag allowing authoritative rating updates
  PERFORM set_config('app.authoritative_rating_update', 'true', true);

  -- 1. Check game existence
  SELECT status, white_player_id, black_player_id 
  INTO v_game_status, v_white_id, v_black_id 
  FROM public.games 
  WHERE id = p_game_id;

  -- 2. Idempotency guard: If match already marked completed, prevent duplicate rating updates
  IF FOUND AND v_game_status = 'completed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_completed', true,
      'message', 'Game already completed; duplicate rating application skipped.'
    );
  END IF;

  -- 3. Upsert into public.games table
  IF FOUND THEN
    UPDATE public.games
    SET
      status = 'completed',
      result = p_result,
      winner_id = p_winner_id,
      pgn = COALESCE(NULLIF(p_pgn, ''), pgn),
      completed_at = pg_catalog.now()
    WHERE id = p_game_id;
  ELSE
    INSERT INTO public.games (
      id, white_player_id, black_player_id, status, result, winner_id, pgn, completed_at
    ) VALUES (
      p_game_id, p_white_player_id, p_black_player_id, 'completed', p_result, p_winner_id, COALESCE(p_pgn, ''), pg_catalog.now()
    );
  END IF;

  -- 4. Update White player's rating (if specified and valid)
  IF p_white_player_id IS NOT NULL AND p_white_new_rating IS NOT NULL THEN
    UPDATE public.profiles
    SET rating = GREATEST(100, p_white_new_rating)
    WHERE id = p_white_player_id;
  END IF;

  -- 5. Update Black player's rating (if specified and valid)
  IF p_black_player_id IS NOT NULL AND p_black_new_rating IS NOT NULL THEN
    UPDATE public.profiles
    SET rating = GREATEST(100, p_black_new_rating)
    WHERE id = p_black_player_id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'game_id', p_game_id,
    'result', p_result,
    'winner_id', p_winner_id,
    'white_new_rating', p_white_new_rating,
    'black_new_rating', p_black_new_rating
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth, pg_catalog;

-- --------------------------------------------------------------------
-- 5. EXECUTION PERMISSIONS FOR DATABASE FUNCTION
-- --------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.record_match_completion_and_ratings TO anon, authenticated, service_role;

