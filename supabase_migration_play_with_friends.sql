-- ====================================================================
-- STRATEGIC CHESS — PLAY WITH FRIENDS DATABASE MIGRATION
-- Adds room_code, expiration tracking, and safe RLS for friendly games
-- ====================================================================

-- 1. Add room_code and expires_at columns to public.games
ALTER TABLE public.games 
  ADD COLUMN IF NOT EXISTS room_code TEXT,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 2. Create Unique Partial Index for collision-free room codes on pending/active rooms
CREATE UNIQUE INDEX IF NOT EXISTS idx_games_room_code 
  ON public.games (room_code) 
  WHERE room_code IS NOT NULL;

-- 3. Add constraint on room_code format (e.g. STRAT-XXXX or custom 4-20 chars alphanumeric)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_room_code_format'
  ) THEN
    ALTER TABLE public.games
      ADD CONSTRAINT valid_room_code_format 
      CHECK (room_code IS NULL OR room_code ~ '^[A-Z0-9-]{4,20}$');
  END IF;
END $$;

-- 4. Enable service_role and authenticated access
GRANT SELECT, INSERT, UPDATE ON public.games TO authenticated, service_role;

-- 5. RLS Policy: Allow authenticated users to look up pending friendly game rooms by room_code
DROP POLICY IF EXISTS "Allow lookup of pending friendly games by room code" ON public.games;
CREATE POLICY "Allow lookup of pending friendly games by room code"
  ON public.games FOR SELECT TO authenticated
  USING (status = 'pending' AND room_code IS NOT NULL);

-- 6. RLS Policy: Allow participants to update their game (e.g., joining second player)
DROP POLICY IF EXISTS "Allow joining second player to pending friendly game" ON public.games;
CREATE POLICY "Allow joining second player to pending friendly game"
  ON public.games FOR UPDATE TO authenticated
  USING (status = 'pending' AND (white_player_id = auth.uid() OR black_player_id IS NULL))
  WITH CHECK (status IN ('pending', 'in_progress'));

-- 7. Performance Index for expiration cleanup
CREATE INDEX IF NOT EXISTS idx_games_pending_expires_at 
  ON public.games (status, expires_at) 
  WHERE status = 'pending';
