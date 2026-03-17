-- Create missing admin action audit table for discussion feature.
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS public.discussion_admin_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.discussion_sessions(id) ON DELETE CASCADE,
  admin_id text NULL,
  admin_email text NULL,
  action text NOT NULL,
  payload jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_discussion_admin_actions_session_created
  ON public.discussion_admin_actions (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_discussion_admin_actions_created
  ON public.discussion_admin_actions (created_at DESC);

ALTER TABLE public.discussion_admin_actions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'discussion_admin_actions'
      AND policyname = 'Service role full access to discussion_admin_actions'
  ) THEN
    CREATE POLICY "Service role full access to discussion_admin_actions"
      ON public.discussion_admin_actions
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;