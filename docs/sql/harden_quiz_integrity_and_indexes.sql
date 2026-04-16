-- docs/sql/harden_quiz_integrity_and_indexes.sql
--
-- Hardening migration for the subtopic quiz flow.
--
-- Goals:
-- 1. Add database-level guardrails for attempt metadata and labels.
-- 2. Prevent duplicate rows for the same question inside one quiz attempt.
-- 3. Improve query performance for quiz status/admin attempt lookups.
--
-- Safe to re-run.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quiz_subtopic_label_not_blank_chk'
      AND conrelid = 'public.quiz'::regclass
  ) THEN
    ALTER TABLE public.quiz
      ADD CONSTRAINT quiz_subtopic_label_not_blank_chk
      CHECK (subtopic_label IS NULL OR btrim(subtopic_label) <> '')
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quiz_submissions_subtopic_label_not_blank_chk'
      AND conrelid = 'public.quiz_submissions'::regclass
  ) THEN
    ALTER TABLE public.quiz_submissions
      ADD CONSTRAINT quiz_submissions_subtopic_label_not_blank_chk
      CHECK (subtopic_label IS NULL OR btrim(subtopic_label) <> '')
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quiz_submissions_attempt_number_positive_chk'
      AND conrelid = 'public.quiz_submissions'::regclass
  ) THEN
    ALTER TABLE public.quiz_submissions
      ADD CONSTRAINT quiz_submissions_attempt_number_positive_chk
      CHECK (attempt_number >= 1)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quiz_submissions_module_index_nonnegative_chk'
      AND conrelid = 'public.quiz_submissions'::regclass
  ) THEN
    ALTER TABLE public.quiz_submissions
      ADD CONSTRAINT quiz_submissions_module_index_nonnegative_chk
      CHECK (module_index IS NULL OR module_index >= 0)
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'quiz_submissions_subtopic_index_nonnegative_chk'
      AND conrelid = 'public.quiz_submissions'::regclass
  ) THEN
    ALTER TABLE public.quiz_submissions
      ADD CONSTRAINT quiz_submissions_subtopic_index_nonnegative_chk
      CHECK (subtopic_index IS NULL OR subtopic_index >= 0)
      NOT VALID;
  END IF;
END $$;

ALTER TABLE public.quiz VALIDATE CONSTRAINT quiz_subtopic_label_not_blank_chk;
ALTER TABLE public.quiz_submissions VALIDATE CONSTRAINT quiz_submissions_subtopic_label_not_blank_chk;
ALTER TABLE public.quiz_submissions VALIDATE CONSTRAINT quiz_submissions_attempt_number_positive_chk;
ALTER TABLE public.quiz_submissions VALIDATE CONSTRAINT quiz_submissions_module_index_nonnegative_chk;
ALTER TABLE public.quiz_submissions VALIDATE CONSTRAINT quiz_submissions_subtopic_index_nonnegative_chk;

CREATE UNIQUE INDEX IF NOT EXISTS idx_quiz_submissions_attempt_question_unique
  ON public.quiz_submissions (quiz_attempt_id, quiz_id);

CREATE INDEX IF NOT EXISTS idx_quiz_scope_created_at
  ON public.quiz (course_id, subtopic_id, subtopic_label, created_at);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_scope_created_at
  ON public.quiz_submissions (user_id, subtopic_id, subtopic_label, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_attempt_created_at
  ON public.quiz_submissions (quiz_attempt_id, created_at);
