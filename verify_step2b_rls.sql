-- ====================================================================
-- STRATEGIC CHESS — STEP 2B RLS & SECURITY AUDIT VERIFICATION QUERY
-- Run this script in the Supabase SQL Editor to verify database policies.
-- ====================================================================

-- 1. Check all RLS policies on public tables
SELECT 
    schemaname,
    tablename,
    policyname,
    roles,
    cmd AS operation,
    qual AS using_expression,
    with_check
FROM pg_policies
WHERE schemaname = 'public' 
  AND tablename IN ('profiles', 'games', 'game_moves', 'user_streaks')
ORDER BY tablename, cmd;

-- 2. Verify Table RLS Status (Must all be rowsecurity = true)
SELECT 
    relname AS table_name,
    relrowsecurity AS rls_enabled
FROM pg_class
JOIN pg_namespace ON pg_namespace.oid = pg_class.relnamespace
WHERE pg_namespace.nspname = 'public'
  AND relname IN ('profiles', 'games', 'game_moves', 'user_streaks');

-- 3. Verify Trigger Functions SECURITY DEFINER and search_path configuration
SELECT 
    proname AS function_name,
    prosecdef AS is_security_definer,
    proconfig AS search_path_config
FROM pg_proc
JOIN pg_namespace ON pg_namespace.oid = pg_proc.pronamespace
WHERE pg_namespace.nspname = 'public'
  AND proname IN ('handle_new_user', 'protect_profile_fields');
