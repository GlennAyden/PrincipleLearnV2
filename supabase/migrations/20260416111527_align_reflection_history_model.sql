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
  CHECK (subtopic_index IS NULL OR subtopic_index >= 0);;
