-- docs/sql/fix_supabase_advisor_discussion_rate_limits.sql
--
-- Addresses non-quiz Supabase advisor findings:
-- - missing indexes on foreign keys used by discussion/research tables
-- - rate_limits has RLS enabled without any policy

CREATE INDEX IF NOT EXISTS idx_discussion_messages_learning_session_id
  ON public.discussion_messages (learning_session_id);

CREATE INDEX IF NOT EXISTS idx_discussion_messages_revision_of_message_id
  ON public.discussion_messages (revision_of_message_id);

CREATE INDEX IF NOT EXISTS idx_discussion_sessions_template_id
  ON public.discussion_sessions (template_id);

CREATE INDEX IF NOT EXISTS idx_research_artifacts_course_id
  ON public.research_artifacts (course_id);

ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'rate_limits'
      AND policyname = 'rate_limits_service_role_all'
  ) THEN
    CREATE POLICY rate_limits_service_role_all
      ON public.rate_limits
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
;
