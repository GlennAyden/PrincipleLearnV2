-- ============================================================
-- STAGE 4: THESIS AUTO-CODER ENGINE
-- PrincipleLearn V3
-- ============================================================
-- Goal:
--   Track automatic RM2/RM3 coding runs, keep evidence-level
--   auto-coding metadata idempotent, and materialize automatic
--   triangulation status including "belum_muncul" per indicator.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.research_auto_coding_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  requested_by_email TEXT,
  status VARCHAR(30) NOT NULL DEFAULT 'running',
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT research_auto_coding_runs_status_check CHECK (
    status IN ('running', 'completed', 'failed', 'dry_run')
  )
);

ALTER TABLE public.research_evidence_items
  ADD COLUMN IF NOT EXISTS auto_coding_status VARCHAR(30) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS auto_coding_run_id UUID REFERENCES public.research_auto_coding_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_coding_version VARCHAR(40),
  ADD COLUMN IF NOT EXISTS auto_coding_model TEXT,
  ADD COLUMN IF NOT EXISTS auto_coded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auto_coding_reason TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'research_evidence_items_auto_coding_status_check'
  ) THEN
    ALTER TABLE public.research_evidence_items
      ADD CONSTRAINT research_evidence_items_auto_coding_status_check CHECK (
        auto_coding_status IN ('pending', 'completed', 'needs_review', 'failed', 'skipped')
      );
  END IF;
END
$$;

ALTER TABLE public.triangulation_records
  ADD COLUMN IF NOT EXISTS auto_coding_run_id UUID REFERENCES public.research_auto_coding_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS support_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS contradiction_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS missing_reason TEXT,
  ADD COLUMN IF NOT EXISTS evidence_item_ids UUID[] NOT NULL DEFAULT ARRAY[]::UUID[];

CREATE INDEX IF NOT EXISTS idx_research_auto_coding_runs_status
  ON public.research_auto_coding_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_auto_coding_runs_requested_by
  ON public.research_auto_coding_runs(requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_evidence_items_auto_coding
  ON public.research_evidence_items(auto_coding_status, auto_coded_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_research_evidence_items_auto_run
  ON public.research_evidence_items(auto_coding_run_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_triangulation_records_auto_run
  ON public.triangulation_records(auto_coding_run_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_triangulation_records_auto_indicator
  ON public.triangulation_records(user_id, course_id, learning_session_id, rm_focus, indicator_code, generated_by);

ALTER TABLE public.research_auto_coding_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'research_auto_coding_runs'
      AND policyname = 'service_role_full_access'
  ) THEN
    CREATE POLICY "service_role_full_access"
      ON public.research_auto_coding_runs
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'set_research_auto_coding_runs_updated_at'
      AND tgrelid = 'public.research_auto_coding_runs'::regclass
  ) THEN
    CREATE TRIGGER set_research_auto_coding_runs_updated_at
      BEFORE UPDATE ON public.research_auto_coding_runs
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at_timestamp();
  END IF;
END
$$;

COMMENT ON TABLE public.research_auto_coding_runs IS
  'Stage 4 run log for automatic RM2/RM3 coding and triangulation from the thesis evidence ledger.';

COMMENT ON COLUMN public.research_evidence_items.auto_coding_status IS
  'Stage 4 auto-coder status: pending, completed, needs_review, failed, skipped.';

COMMENT ON COLUMN public.triangulation_records.missing_reason IS
  'Auto-generated explanation when an RM2 stage or RM3 indicator has not appeared in available evidence.';
