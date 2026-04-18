-- ============================================================
-- STAGE 3: AUTO RESEARCH COLLECTION WIRING
-- PrincipleLearn V3
-- ============================================================
-- Goal:
--   Make automatic RM2/RM3 evidence collection idempotent while
--   student-facing routes write into the unified evidence ledger.
-- ============================================================

CREATE UNIQUE INDEX IF NOT EXISTS uniq_research_evidence_items_source
  ON public.research_evidence_items(source_type, source_table, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_research_evidence_items_week_source
  ON public.research_evidence_items(data_collection_week, source_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_challenge_responses_learning_session
  ON public.challenge_responses(learning_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_discussion_messages_learning_session
  ON public.discussion_messages(learning_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_evidence_items_auto_generated
  ON public.research_evidence_items(is_auto_generated, updated_at DESC);

COMMENT ON INDEX public.uniq_research_evidence_items_source IS
  'Ensures Stage 3 automatic collectors can rerun without duplicating source evidence rows.';

COMMENT ON INDEX public.idx_research_evidence_items_week_source IS
  'Speeds admin thesis views grouped by collection week and evidence source.';
