ALTER TABLE IF EXISTS public.quiz
  ADD COLUMN IF NOT EXISTS subtopic_label TEXT;

ALTER TABLE IF EXISTS public.quiz_submissions
  ADD COLUMN IF NOT EXISTS subtopic_label TEXT;

CREATE INDEX IF NOT EXISTS idx_quiz_subtopic_label
  ON public.quiz (subtopic_id, subtopic_label);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_subtopic_label
  ON public.quiz_submissions (user_id, subtopic_id, subtopic_label);

-- One-time legacy cleanup: remove unreferenced quiz rows that predate the
-- subtopic_label scoping. These rows are unreachable after the code change
-- (new sync writes subtopic_label) and would otherwise re-appear in the
-- course-wide fallback query. Rows with submissions are preserved.
DELETE FROM public.quiz
WHERE subtopic_label IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.quiz_submissions qs
    WHERE qs.quiz_id = public.quiz.id
  );;
