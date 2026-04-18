-- ============================================================
-- Example usage events
-- ============================================================
-- Generated examples remain temporary help for the learner. This table only
-- records that the learner used the feature on a specific subtopic/page so
-- admins can audit completion signals without storing generated example text.

CREATE TABLE IF NOT EXISTS public.example_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  learning_session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  module_index INT NOT NULL DEFAULT 0,
  subtopic_index INT NOT NULL DEFAULT 0,
  page_number INT NOT NULL DEFAULT 0,
  subtopic_label TEXT,
  context_hash TEXT NOT NULL,
  context_length INT NOT NULL DEFAULT 0,
  examples_count INT NOT NULL DEFAULT 1,
  usage_scope TEXT NOT NULL DEFAULT 'used_on_subtopic',
  raw_evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  data_collection_week VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT example_usage_events_examples_count_check CHECK (examples_count > 0),
  CONSTRAINT example_usage_events_usage_scope_check CHECK (usage_scope IN ('used_on_subtopic'))
);

CREATE INDEX IF NOT EXISTS idx_example_usage_events_user_created
  ON public.example_usage_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_example_usage_events_course_scope
  ON public.example_usage_events(course_id, module_index, subtopic_index, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_example_usage_events_session
  ON public.example_usage_events(learning_session_id, created_at DESC);

DROP TRIGGER IF EXISTS set_example_usage_events_updated_at ON public.example_usage_events;
CREATE TRIGGER set_example_usage_events_updated_at
  BEFORE UPDATE ON public.example_usage_events
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.example_usage_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'example_usage_events'
      AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY "service_role_full_access"
      ON public.example_usage_events
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
