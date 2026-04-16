-- Prepare reflection storage for the current historical model.
--
-- Why this exists:
--   - `jurnal` is now an append-only reflection log, not an upserted
--     one-row-per-course table.
--   - admin activity and analytics read `jurnal + feedback` as a unified
--     reflection model.
--   - this file is the additive/safe phase only: indexes and check constraints.
--
-- If the live database still carries a legacy `UNIQUE (user_id, course_id)` on
-- `jurnal`, drop it later using:
--   docs/sql/drop_legacy_jurnal_user_course_unique.sql

-- History-friendly indexes for recent activity, per-user audit trails, and
-- per-subtopic reflection timelines.
CREATE INDEX IF NOT EXISTS idx_jurnal_user_course_created_at
  ON public.jurnal (user_id, course_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jurnal_user_course_subtopic_created_at
  ON public.jurnal (user_id, course_id, subtopic_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jurnal_course_scope_created_at
  ON public.jurnal (course_id, subtopic_id, module_index, subtopic_index, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_user_course_created_at
  ON public.feedback (user_id, course_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_feedback_course_scope_created_at
  ON public.feedback (course_id, subtopic_id, module_index, subtopic_index, created_at DESC);

-- Optional integrity checks for scope positions.
-- Keep these nullable because legacy rows and fallback writes may not always
-- know the resolved module/subtopic position.
ALTER TABLE public.jurnal
  DROP CONSTRAINT IF EXISTS jurnal_module_index_nonnegative;

ALTER TABLE public.jurnal
  ADD CONSTRAINT jurnal_module_index_nonnegative
  CHECK (module_index IS NULL OR module_index >= 0);

ALTER TABLE public.jurnal
  DROP CONSTRAINT IF EXISTS jurnal_subtopic_index_nonnegative;

ALTER TABLE public.jurnal
  ADD CONSTRAINT jurnal_subtopic_index_nonnegative
  CHECK (subtopic_index IS NULL OR subtopic_index >= 0);

ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_module_index_nonnegative;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_module_index_nonnegative
  CHECK (module_index IS NULL OR module_index >= 0);

ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_subtopic_index_nonnegative;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_subtopic_index_nonnegative
  CHECK (subtopic_index IS NULL OR subtopic_index >= 0);
