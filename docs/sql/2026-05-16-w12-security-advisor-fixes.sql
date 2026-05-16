-- MVR W12 hygiene: address the 6 WARN advisor findings noted in
-- rencana-eksekusi-mvr.md §9.6. No ERROR-level findings; all 6 are
-- function search_path or SECURITY DEFINER role exposure.
-- Applied via Supabase migration `mvr_w12_security_advisor_warning_fixes` (version 20260516065339).
--
-- 1-2. function_search_path_mutable: pin search_path on trigger functions
-- 3-6. anon/authenticated SECURITY DEFINER executable: revoke EXECUTE from
--      anon + authenticated on the two internal admin helper functions so
--      they cannot be invoked via /rest/v1/rpc.

-- Pin search_path on existing trigger functions to prevent schema-poisoning.
ALTER FUNCTION public.set_updated_at_timestamp() SET search_path = 'public', 'pg_temp';
ALTER FUNCTION public.refresh_learning_session_research_metrics(uuid) SET search_path = 'public', 'pg_temp';

-- Internal admin helpers — should never be callable by anon/authenticated.
-- These rely on service_role to invoke from server-side admin code only.
REVOKE EXECUTE ON FUNCTION public.get_jsonb_columns() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM anon, authenticated;
