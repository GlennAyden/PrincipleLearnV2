
-- Fase A DB: security hardening
-- 1) Recreate 3 research views as SECURITY INVOKER (Postgres 15+ syntax)
ALTER VIEW public.v_cognitive_indicators_summary SET (security_invoker = true);
ALTER VIEW public.v_longitudinal_prompt_development SET (security_invoker = true);
ALTER VIEW public.v_prompt_classification_summary SET (security_invoker = true);

-- 2) Pin search_path on 4 public functions (mitigasi search_path injection)
ALTER FUNCTION public.get_admin_user_stats() SET search_path = public, pg_temp;
ALTER FUNCTION public.get_jsonb_columns() SET search_path = public, pg_temp;
ALTER FUNCTION public.update_session_metrics(uuid) SET search_path = public, pg_temp;
ALTER FUNCTION public.calculate_stage_transition(uuid, uuid) SET search_path = public, pg_temp;

-- 3) Fix auto_cognitive_scores RLS — ganti policy `{public} USING(true)` ke service_role only
DROP POLICY IF EXISTS "Service role full access" ON public.auto_cognitive_scores;
CREATE POLICY service_role_full_access
  ON public.auto_cognitive_scores
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
;
