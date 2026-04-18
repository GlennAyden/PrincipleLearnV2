-- Research-grade discussion assessment model.
-- Safe to run multiple times on Supabase production.

ALTER TABLE public.discussion_sessions
  ADD COLUMN IF NOT EXISTS completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS completion_reason text,
  ADD COLUMN IF NOT EXISTS completion_summary jsonb;

CREATE TABLE IF NOT EXISTS public.discussion_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES public.discussion_sessions(id) ON DELETE CASCADE,
  student_message_id uuid NOT NULL REFERENCES public.discussion_messages(id) ON DELETE CASCADE,
  prompt_message_id uuid REFERENCES public.discussion_messages(id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id uuid NOT NULL REFERENCES public.courses(id) ON DELETE CASCADE,
  subtopic_id uuid REFERENCES public.subtopics(id) ON DELETE SET NULL,
  step_key text,
  phase text,
  goal_id text NOT NULL,
  goal_description text,
  assessment_status text NOT NULL CHECK (
    assessment_status IN ('met', 'near', 'weak', 'off_topic', 'unassessable')
  ),
  proximity_score integer NOT NULL CHECK (proximity_score >= 0 AND proximity_score <= 100),
  passed boolean NOT NULL DEFAULT false,
  attempt_number integer NOT NULL DEFAULT 1 CHECK (attempt_number >= 1),
  remediation_round integer CHECK (remediation_round IS NULL OR remediation_round >= 1),
  quality_flag text NOT NULL DEFAULT 'adequate' CHECK (
    quality_flag IN ('adequate', 'low_effort', 'off_topic')
  ),
  evaluator text NOT NULL CHECK (evaluator IN ('mcq', 'llm', 'fallback')),
  model text,
  evaluation_version text NOT NULL DEFAULT 'discussion-proximity-v1',
  coach_feedback text,
  ideal_answer text,
  scaffold_action text,
  advance_allowed boolean NOT NULL DEFAULT false,
  evidence_excerpt text,
  assessment_raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS discussion_assessments_student_goal_unique
  ON public.discussion_assessments (student_message_id, goal_id);

CREATE INDEX IF NOT EXISTS idx_discussion_assessments_session_created
  ON public.discussion_assessments (session_id, created_at);

CREATE INDEX IF NOT EXISTS idx_discussion_assessments_user_course_subtopic
  ON public.discussion_assessments (user_id, course_id, subtopic_id);

CREATE INDEX IF NOT EXISTS idx_discussion_assessments_goal_status
  ON public.discussion_assessments (goal_id, assessment_status);

CREATE INDEX IF NOT EXISTS idx_discussion_assessments_course_created
  ON public.discussion_assessments (course_id, created_at DESC);

ALTER TABLE public.discussion_assessments ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'discussion_assessments'
      AND policyname = 'Service role full access to discussion_assessments'
  ) THEN
    CREATE POLICY "Service role full access to discussion_assessments"
      ON public.discussion_assessments
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;
