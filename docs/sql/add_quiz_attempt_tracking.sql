-- docs/sql/add_quiz_attempt_tracking.sql
-- Adds attempt tracking to quiz_submissions so the Reshuffle feature can
-- distinguish multiple attempts per user per subtopic.
--
-- Applied to Supabase project wesgoqdldgjbwgmubfdm via MCP on 2026-04-12.
-- This file is kept for repo audit / re-application on other environments.

ALTER TABLE quiz_submissions
  ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quiz_attempt_id UUID NOT NULL DEFAULT gen_random_uuid();

-- Existing rows receive attempt_number = 1 via DEFAULT and fresh quiz_attempt_ids
-- via gen_random_uuid(). All pre-existing rows are treated as a single "attempt 1"
-- per user per subtopic (since there was no way to distinguish them before).

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_attempt
  ON quiz_submissions(user_id, subtopic_id, attempt_number);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_attempt_id
  ON quiz_submissions(quiz_attempt_id);
