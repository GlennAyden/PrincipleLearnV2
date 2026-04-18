-- ============================================================
-- STAGE 2: THESIS RESEARCH EVIDENCE FOUNDATION
-- PrincipleLearn V3
-- ============================================================
-- Goal:
--   Strengthen RM2/RM3 evidence completeness for admin thesis workflows.
--   This migration adds a unified evidence ledger, validity/coding metadata,
--   richer artifact + triangulation fields, and session readiness counters.
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

ALTER TABLE public.learning_sessions
  ADD COLUMN IF NOT EXISTS data_collection_week VARCHAR(40),
  ADD COLUMN IF NOT EXISTS evidence_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS raw_event_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS coded_event_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS artifact_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS triangulation_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS readiness_status VARCHAR(30) NOT NULL DEFAULT 'perlu_data',
  ADD COLUMN IF NOT EXISTS readiness_score DECIMAL(5,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_research_sync_at TIMESTAMPTZ;

ALTER TABLE public.prompt_classifications
  ADD COLUMN IF NOT EXISTS source_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_stage VARCHAR(20),
  ADD COLUMN IF NOT EXISTS auto_stage_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS classification_status VARCHAR(30) NOT NULL DEFAULT 'final',
  ADD COLUMN IF NOT EXISTS research_validity_status VARCHAR(30) NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS data_collection_week VARCHAR(40);

ALTER TABLE public.cognitive_indicators
  ADD COLUMN IF NOT EXISTS indicator_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS assessment_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS research_validity_status VARCHAR(30) NOT NULL DEFAULT 'valid';

ALTER TABLE public.ask_question_history
  ADD COLUMN IF NOT EXISTS learning_session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prompt_stage VARCHAR(20),
  ADD COLUMN IF NOT EXISTS stage_confidence DECIMAL(3,2),
  ADD COLUMN IF NOT EXISTS micro_markers JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS research_validity_status VARCHAR(30) NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS coding_status VARCHAR(30) NOT NULL DEFAULT 'uncoded',
  ADD COLUMN IF NOT EXISTS researcher_notes TEXT,
  ADD COLUMN IF NOT EXISTS raw_evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS data_collection_week VARCHAR(40),
  ADD COLUMN IF NOT EXISTS research_synced_at TIMESTAMPTZ;

ALTER TABLE public.challenge_responses
  ADD COLUMN IF NOT EXISTS learning_session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS research_validity_status VARCHAR(30) NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS coding_status VARCHAR(30) NOT NULL DEFAULT 'uncoded',
  ADD COLUMN IF NOT EXISTS researcher_notes TEXT,
  ADD COLUMN IF NOT EXISTS raw_evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS data_collection_week VARCHAR(40);

ALTER TABLE public.quiz_submissions
  ADD COLUMN IF NOT EXISTS learning_session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS research_validity_status VARCHAR(30) NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS coding_status VARCHAR(30) NOT NULL DEFAULT 'uncoded',
  ADD COLUMN IF NOT EXISTS researcher_notes TEXT,
  ADD COLUMN IF NOT EXISTS raw_evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS data_collection_week VARCHAR(40);

ALTER TABLE public.jurnal
  ADD COLUMN IF NOT EXISTS learning_session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS research_validity_status VARCHAR(30) NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS coding_status VARCHAR(30) NOT NULL DEFAULT 'uncoded',
  ADD COLUMN IF NOT EXISTS researcher_notes TEXT,
  ADD COLUMN IF NOT EXISTS raw_evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS data_collection_week VARCHAR(40);

ALTER TABLE public.discussion_sessions
  ADD COLUMN IF NOT EXISTS learning_session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS research_validity_status VARCHAR(30) NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS coding_status VARCHAR(30) NOT NULL DEFAULT 'uncoded',
  ADD COLUMN IF NOT EXISTS researcher_notes TEXT,
  ADD COLUMN IF NOT EXISTS data_collection_week VARCHAR(40);

ALTER TABLE public.discussion_messages
  ADD COLUMN IF NOT EXISTS learning_session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS research_validity_status VARCHAR(30) NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS coding_status VARCHAR(30) NOT NULL DEFAULT 'uncoded',
  ADD COLUMN IF NOT EXISTS researcher_notes TEXT,
  ADD COLUMN IF NOT EXISTS raw_evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS data_collection_week VARCHAR(40);

ALTER TABLE public.research_artifacts
  ADD COLUMN IF NOT EXISTS source_type VARCHAR(30) NOT NULL DEFAULT 'artifact',
  ADD COLUMN IF NOT EXISTS source_id UUID,
  ADD COLUMN IF NOT EXISTS source_table TEXT,
  ADD COLUMN IF NOT EXISTS file_url TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS mime_type TEXT,
  ADD COLUMN IF NOT EXISTS storage_path TEXT,
  ADD COLUMN IF NOT EXISTS artifact_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_status VARCHAR(30) NOT NULL DEFAULT 'raw',
  ADD COLUMN IF NOT EXISTS coding_status VARCHAR(30) NOT NULL DEFAULT 'manual_coded',
  ADD COLUMN IF NOT EXISTS research_validity_status VARCHAR(30) NOT NULL DEFAULT 'valid',
  ADD COLUMN IF NOT EXISTS data_collection_week VARCHAR(40);

ALTER TABLE public.triangulation_records
  ADD COLUMN IF NOT EXISTS learning_session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS prompt_classification_id UUID REFERENCES public.prompt_classifications(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rm_focus VARCHAR(20) NOT NULL DEFAULT 'RM2_RM3',
  ADD COLUMN IF NOT EXISTS indicator_code VARCHAR(80),
  ADD COLUMN IF NOT EXISTS triangulation_status VARCHAR(30) NOT NULL DEFAULT 'sebagian',
  ADD COLUMN IF NOT EXISTS sources JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS evidence_excerpt TEXT,
  ADD COLUMN IF NOT EXISTS auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS generated_by VARCHAR(100),
  ADD COLUMN IF NOT EXISTS review_status VARCHAR(30) NOT NULL DEFAULT 'reviewed',
  ADD COLUMN IF NOT EXISTS data_collection_week VARCHAR(40);

CREATE TABLE IF NOT EXISTS public.research_evidence_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type VARCHAR(30) NOT NULL,
  source_id UUID,
  source_table TEXT,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  course_id UUID REFERENCES public.courses(id) ON DELETE SET NULL,
  learning_session_id UUID REFERENCES public.learning_sessions(id) ON DELETE SET NULL,
  prompt_classification_id UUID REFERENCES public.prompt_classifications(id) ON DELETE SET NULL,
  rm_focus VARCHAR(20) NOT NULL DEFAULT 'RM2_RM3',
  indicator_code VARCHAR(80),
  prompt_stage VARCHAR(20),
  unit_sequence INT,
  evidence_title TEXT,
  evidence_text TEXT,
  ai_response_text TEXT,
  artifact_text TEXT,
  evidence_status VARCHAR(30) NOT NULL DEFAULT 'raw',
  coding_status VARCHAR(30) NOT NULL DEFAULT 'uncoded',
  research_validity_status VARCHAR(30) NOT NULL DEFAULT 'valid',
  triangulation_status VARCHAR(30),
  data_collection_week VARCHAR(40),
  auto_confidence DECIMAL(3,2),
  evidence_source_summary TEXT,
  researcher_notes TEXT,
  raw_evidence_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  coded_by VARCHAR(100),
  coded_at TIMESTAMPTZ,
  reviewed_by VARCHAR(100),
  reviewed_at TIMESTAMPTZ,
  is_auto_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT research_evidence_items_source_type_check CHECK (
    source_type IN (
      'ask_question',
      'challenge_response',
      'quiz_submission',
      'journal',
      'discussion',
      'artifact',
      'observation',
      'manual_note'
    )
  ),
  CONSTRAINT research_evidence_items_rm_focus_check CHECK (rm_focus IN ('RM2', 'RM3', 'RM2_RM3')),
  CONSTRAINT research_evidence_items_status_check CHECK (
    evidence_status IN ('raw', 'coded', 'triangulated', 'excluded', 'needs_review')
  ),
  CONSTRAINT research_evidence_items_coding_check CHECK (
    coding_status IN ('uncoded', 'auto_coded', 'manual_coded', 'reviewed')
  ),
  CONSTRAINT research_evidence_items_validity_check CHECK (
    research_validity_status IN ('valid', 'low_information', 'duplicate', 'excluded', 'manual_note')
  )
);

CREATE INDEX IF NOT EXISTS idx_learning_sessions_readiness_status
  ON public.learning_sessions(readiness_status, readiness_score DESC);

CREATE INDEX IF NOT EXISTS idx_learning_sessions_sync
  ON public.learning_sessions(last_research_sync_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_prompt_classifications_validity
  ON public.prompt_classifications(research_validity_status, classification_status);

CREATE INDEX IF NOT EXISTS idx_ask_question_history_stage_created
  ON public.ask_question_history(prompt_stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ask_question_history_session_created
  ON public.ask_question_history(learning_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_challenge_responses_coding
  ON public.challenge_responses(coding_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_learning_session
  ON public.quiz_submissions(learning_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jurnal_learning_session
  ON public.jurnal(learning_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discussion_sessions_learning_session
  ON public.discussion_sessions(learning_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discussion_messages_coding
  ON public.discussion_messages(coding_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_artifacts_status
  ON public.research_artifacts(coding_status, research_validity_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_triangulation_focus_status
  ON public.triangulation_records(rm_focus, triangulation_status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_evidence_items_user_created
  ON public.research_evidence_items(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_evidence_items_session
  ON public.research_evidence_items(learning_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_evidence_items_source
  ON public.research_evidence_items(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_research_evidence_items_focus_indicator
  ON public.research_evidence_items(rm_focus, indicator_code, prompt_stage);

CREATE INDEX IF NOT EXISTS idx_research_evidence_items_status
  ON public.research_evidence_items(coding_status, research_validity_status, evidence_status);

ALTER TABLE public.learning_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_classifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cognitive_indicators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.triangulation_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.research_evidence_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'research_evidence_items'
      AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY "service_role_full_access"
      ON public.research_evidence_items
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'research_evidence_items'
      AND policyname = 'research_evidence_items_own'
  ) THEN
    CREATE POLICY "research_evidence_items_own"
      ON public.research_evidence_items
      FOR ALL
      TO authenticated
      USING (user_id = auth.uid())
      WITH CHECK (user_id = auth.uid());
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_learning_sessions_updated_at'
      AND tgrelid = 'public.learning_sessions'::regclass
  ) THEN
    CREATE TRIGGER set_learning_sessions_updated_at
      BEFORE UPDATE ON public.learning_sessions
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at_timestamp();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_prompt_classifications_updated_at'
      AND tgrelid = 'public.prompt_classifications'::regclass
  ) THEN
    CREATE TRIGGER set_prompt_classifications_updated_at
      BEFORE UPDATE ON public.prompt_classifications
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at_timestamp();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_cognitive_indicators_updated_at'
      AND tgrelid = 'public.cognitive_indicators'::regclass
  ) THEN
    CREATE TRIGGER set_cognitive_indicators_updated_at
      BEFORE UPDATE ON public.cognitive_indicators
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at_timestamp();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_research_artifacts_updated_at'
      AND tgrelid = 'public.research_artifacts'::regclass
  ) THEN
    CREATE TRIGGER set_research_artifacts_updated_at
      BEFORE UPDATE ON public.research_artifacts
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at_timestamp();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_triangulation_records_updated_at'
      AND tgrelid = 'public.triangulation_records'::regclass
  ) THEN
    CREATE TRIGGER set_triangulation_records_updated_at
      BEFORE UPDATE ON public.triangulation_records
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at_timestamp();
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_research_evidence_items_updated_at'
      AND tgrelid = 'public.research_evidence_items'::regclass
  ) THEN
    CREATE TRIGGER set_research_evidence_items_updated_at
      BEFORE UPDATE ON public.research_evidence_items
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at_timestamp();
  END IF;
END
$$;

INSERT INTO public.research_evidence_items (
  source_type,
  source_id,
  source_table,
  user_id,
  course_id,
  learning_session_id,
  rm_focus,
  prompt_stage,
  unit_sequence,
  evidence_title,
  evidence_text,
  ai_response_text,
  evidence_status,
  coding_status,
  research_validity_status,
  auto_confidence,
  researcher_notes,
  raw_evidence_snapshot,
  is_auto_generated,
  created_at,
  updated_at
)
SELECT
  'ask_question',
  aqh.id,
  'ask_question_history',
  aqh.user_id,
  aqh.course_id,
  aqh.learning_session_id,
  'RM2_RM3',
  aqh.prompt_stage,
  aqh.session_number,
  LEFT(COALESCE(aqh.question, ''), 120),
  aqh.question,
  aqh.answer,
  'raw',
  COALESCE(aqh.coding_status, 'uncoded'),
  COALESCE(aqh.research_validity_status, 'valid'),
  aqh.stage_confidence,
  aqh.researcher_notes,
  COALESCE(
    NULLIF(aqh.raw_evidence_snapshot, '{}'::jsonb),
    jsonb_build_object(
      'question', aqh.question,
      'answer', aqh.answer,
      'prompt_stage', aqh.prompt_stage,
      'micro_markers', aqh.micro_markers
    )
  ),
  TRUE,
  COALESCE(aqh.created_at, NOW()),
  NOW()
FROM public.ask_question_history aqh
WHERE aqh.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.research_evidence_items rei
    WHERE rei.source_type = 'ask_question'
      AND rei.source_id = aqh.id
  );

INSERT INTO public.research_evidence_items (
  source_type,
  source_id,
  source_table,
  user_id,
  course_id,
  learning_session_id,
  rm_focus,
  evidence_title,
  evidence_text,
  ai_response_text,
  evidence_status,
  coding_status,
  research_validity_status,
  researcher_notes,
  raw_evidence_snapshot,
  is_auto_generated,
  created_at,
  updated_at
)
SELECT
  'challenge_response',
  cr.id,
  'challenge_responses',
  cr.user_id,
  cr.course_id,
  cr.learning_session_id,
  'RM3',
  LEFT(COALESCE(cr.question, ''), 120),
  cr.question,
  cr.answer,
  'raw',
  COALESCE(cr.coding_status, 'uncoded'),
  COALESCE(cr.research_validity_status, 'valid'),
  cr.researcher_notes,
  COALESCE(
    NULLIF(cr.raw_evidence_snapshot, '{}'::jsonb),
    jsonb_build_object(
      'question', cr.question,
      'answer', cr.answer,
      'feedback', cr.feedback,
      'reasoning_note', cr.reasoning_note
    )
  ),
  TRUE,
  COALESCE(cr.created_at, NOW()),
  NOW()
FROM public.challenge_responses cr
WHERE cr.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.research_evidence_items rei
    WHERE rei.source_type = 'challenge_response'
      AND rei.source_id = cr.id
  );

INSERT INTO public.research_evidence_items (
  source_type,
  source_id,
  source_table,
  user_id,
  course_id,
  learning_session_id,
  rm_focus,
  evidence_title,
  evidence_text,
  evidence_status,
  coding_status,
  research_validity_status,
  researcher_notes,
  raw_evidence_snapshot,
  is_auto_generated,
  created_at,
  updated_at
)
SELECT
  'quiz_submission',
  qs.id,
  'quiz_submissions',
  qs.user_id,
  q.course_id,
  qs.learning_session_id,
  'RM3',
  LEFT(COALESCE(q.question, ''), 120),
  q.question,
  'raw',
  COALESCE(qs.coding_status, 'uncoded'),
  COALESCE(qs.research_validity_status, 'valid'),
  qs.researcher_notes,
  COALESCE(
    NULLIF(qs.raw_evidence_snapshot, '{}'::jsonb),
    jsonb_build_object(
      'question', q.question,
      'student_answer', qs.answer,
      'correct_answer', q.correct_answer,
      'is_correct', qs.is_correct,
      'reasoning_note', qs.reasoning_note
    )
  ),
  TRUE,
  COALESCE(qs.created_at, NOW()),
  NOW()
FROM public.quiz_submissions qs
LEFT JOIN public.quiz q ON q.id = qs.quiz_id
WHERE qs.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.research_evidence_items rei
    WHERE rei.source_type = 'quiz_submission'
      AND rei.source_id = qs.id
  );

INSERT INTO public.research_evidence_items (
  source_type,
  source_id,
  source_table,
  user_id,
  course_id,
  learning_session_id,
  rm_focus,
  evidence_title,
  evidence_text,
  evidence_status,
  coding_status,
  research_validity_status,
  researcher_notes,
  raw_evidence_snapshot,
  is_auto_generated,
  created_at,
  updated_at
)
SELECT
  'journal',
  j.id,
  'jurnal',
  j.user_id,
  j.course_id,
  j.learning_session_id,
  'RM2_RM3',
  LEFT(COALESCE(j.type, 'jurnal'), 120),
  j.content,
  'raw',
  COALESCE(j.coding_status, 'uncoded'),
  COALESCE(j.research_validity_status, 'valid'),
  j.researcher_notes,
  COALESCE(
    NULLIF(j.raw_evidence_snapshot, '{}'::jsonb),
    jsonb_build_object(
      'type', j.type,
      'content', j.content,
      'reflection', j.reflection
    )
  ),
  TRUE,
  COALESCE(j.created_at, NOW()),
  NOW()
FROM public.jurnal j
WHERE j.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.research_evidence_items rei
    WHERE rei.source_type = 'journal'
      AND rei.source_id = j.id
  );

INSERT INTO public.research_evidence_items (
  source_type,
  source_id,
  source_table,
  user_id,
  course_id,
  learning_session_id,
  rm_focus,
  evidence_title,
  evidence_text,
  evidence_status,
  coding_status,
  research_validity_status,
  researcher_notes,
  raw_evidence_snapshot,
  is_auto_generated,
  created_at,
  updated_at
)
SELECT
  'discussion',
  dm.id,
  'discussion_messages',
  ds.user_id,
  ds.course_id,
  COALESCE(dm.learning_session_id, ds.learning_session_id),
  'RM2_RM3',
  LEFT(COALESCE(dm.role, 'discussion'), 120),
  dm.content,
  'raw',
  COALESCE(dm.coding_status, 'uncoded'),
  COALESCE(dm.research_validity_status, 'valid'),
  dm.researcher_notes,
  COALESCE(
    NULLIF(dm.raw_evidence_snapshot, '{}'::jsonb),
    jsonb_build_object(
      'role', dm.role,
      'content', dm.content,
      'metadata', dm.metadata
    )
  ),
  TRUE,
  COALESCE(dm.created_at, NOW()),
  NOW()
FROM public.discussion_messages dm
JOIN public.discussion_sessions ds ON ds.id = dm.session_id
WHERE ds.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.research_evidence_items rei
    WHERE rei.source_type = 'discussion'
      AND rei.source_id = dm.id
  );

INSERT INTO public.research_evidence_items (
  source_type,
  source_id,
  source_table,
  user_id,
  course_id,
  learning_session_id,
  rm_focus,
  evidence_title,
  evidence_text,
  artifact_text,
  evidence_status,
  coding_status,
  research_validity_status,
  researcher_notes,
  raw_evidence_snapshot,
  is_auto_generated,
  created_at,
  updated_at
)
SELECT
  'artifact',
  ra.id,
  'research_artifacts',
  ra.user_id,
  ra.course_id,
  ra.learning_session_id,
  'RM3',
  COALESCE(ra.artifact_title, ra.artifact_type),
  ra.artifact_content,
  ra.artifact_content,
  COALESCE(ra.evidence_status, 'coded'),
  COALESCE(ra.coding_status, 'manual_coded'),
  COALESCE(ra.research_validity_status, 'valid'),
  ra.assessment_notes,
  jsonb_build_object(
    'artifact_type', ra.artifact_type,
    'related_prompt_ids', ra.related_prompt_ids,
    'file_name', ra.file_name,
    'file_url', ra.file_url
  ),
  TRUE,
  COALESCE(ra.created_at, NOW()),
  NOW()
FROM public.research_artifacts ra
WHERE ra.user_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.research_evidence_items rei
    WHERE rei.source_type = 'artifact'
      AND rei.source_id = ra.id
  );

CREATE OR REPLACE FUNCTION public.refresh_learning_session_research_metrics(p_session_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  v_raw_event_count INT := 0;
  v_coded_event_count INT := 0;
  v_artifact_count INT := 0;
  v_triangulation_count INT := 0;
  v_readiness_score DECIMAL(5,2) := 0;
  v_readiness_status VARCHAR(30) := 'perlu_data';
BEGIN
  SELECT COUNT(*)
  INTO v_raw_event_count
  FROM public.research_evidence_items
  WHERE learning_session_id = p_session_id
    AND evidence_status <> 'excluded';

  SELECT COUNT(*)
  INTO v_coded_event_count
  FROM public.research_evidence_items
  WHERE learning_session_id = p_session_id
    AND coding_status IN ('auto_coded', 'manual_coded', 'reviewed')
    AND research_validity_status <> 'excluded';

  SELECT COUNT(*)
  INTO v_artifact_count
  FROM public.research_artifacts
  WHERE learning_session_id = p_session_id;

  SELECT COUNT(*)
  INTO v_triangulation_count
  FROM public.triangulation_records
  WHERE learning_session_id = p_session_id;

  v_readiness_score := LEAST(
    100,
    (LEAST(v_raw_event_count, 10) * 4)
    + (LEAST(v_coded_event_count, 10) * 4)
    + (LEAST(v_artifact_count, 3) * 10)
    + (LEAST(v_triangulation_count, 2) * 10)
  );

  IF v_readiness_score >= 80 THEN
    v_readiness_status := 'siap_tesis';
  ELSIF v_readiness_score >= 45 THEN
    v_readiness_status := 'sebagian';
  ELSE
    v_readiness_status := 'perlu_data';
  END IF;

  UPDATE public.learning_sessions
  SET
    raw_event_count = v_raw_event_count,
    coded_event_count = v_coded_event_count,
    artifact_count = v_artifact_count,
    triangulation_count = v_triangulation_count,
    readiness_score = v_readiness_score,
    readiness_status = v_readiness_status,
    evidence_summary = jsonb_build_object(
      'raw_event_count', v_raw_event_count,
      'coded_event_count', v_coded_event_count,
      'artifact_count', v_artifact_count,
      'triangulation_count', v_triangulation_count
    ),
    last_research_sync_at = NOW(),
    updated_at = NOW()
  WHERE id = p_session_id;
END;
$$;

DO $$
DECLARE
  v_session RECORD;
BEGIN
  FOR v_session IN
    SELECT id
    FROM public.learning_sessions
  LOOP
    PERFORM public.refresh_learning_session_research_metrics(v_session.id);
  END LOOP;
END
$$;

COMMENT ON TABLE public.research_evidence_items IS
  'Unified evidence ledger for RM2/RM3 thesis admin workflows across prompt logs, challenges, journals, discussion, quizzes, and artifacts.';

COMMENT ON COLUMN public.learning_sessions.readiness_status IS
  'Session readiness for thesis analysis: perlu_data, sebagian, siap_tesis.';

COMMENT ON COLUMN public.triangulation_records.triangulation_status IS
  'Human-readable thesis convergence label: kuat, sebagian, bertentangan, belum_muncul.';
