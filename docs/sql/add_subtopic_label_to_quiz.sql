-- docs/sql/add_subtopic_label_to_quiz.sql
--
-- Problem:
--   `subtopics` table stores one row per MODULE, not per subtopic. All quiz
--   rows for every subtopic inside a module therefore collided on the same
--   `subtopic_id`, and syncQuizQuestions' delete-then-insert clobbered the
--   quiz rows of a sibling subtopic whenever no submissions existed yet.
--   As a result, submitting a quiz on subtopic B after visiting subtopic A
--   (same module) returned "Pertanyaan kuis tidak ditemukan di database".
--
-- Fix:
--   Add a `subtopic_label` column that holds the actual subtopic title, so
--   the application can scope both `quiz` and `quiz_submissions` by
--   (subtopic_id, subtopic_label) and isolate sibling subtopics from each
--   other. No cross-subtopic clobber, full history preserved.
--
-- Safe to re-run. Non-destructive except for the legacy orphan cleanup at
-- the bottom, which only removes quiz rows that are NOT referenced by any
-- quiz_submissions row (so no audit history is lost).

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
  );
