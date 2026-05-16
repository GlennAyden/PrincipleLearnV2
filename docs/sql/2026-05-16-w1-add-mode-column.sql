-- MVR Item 1: Mode flag column di 7 tabel kunci.
-- Setiap baris activity tertaut ke mode (general | research) untuk filter dashboard, ekspor, dan analisis riset.
-- DEFAULT 'general' + NOT NULL artinya 100% backfill implicit untuk baris existing.
-- Applied via Supabase migration `mvr_w1_add_mode_column` (version 20260516060942).

ALTER TABLE courses
  ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'general'
    CHECK (mode IN ('general','research'));
CREATE INDEX idx_courses_mode ON courses(mode);

ALTER TABLE learning_sessions
  ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'general'
    CHECK (mode IN ('general','research'));
CREATE INDEX idx_learning_sessions_mode ON learning_sessions(mode);

ALTER TABLE ask_question_history
  ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'general'
    CHECK (mode IN ('general','research'));
CREATE INDEX idx_ask_question_history_mode ON ask_question_history(mode);

ALTER TABLE challenge_responses
  ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'general'
    CHECK (mode IN ('general','research'));
CREATE INDEX idx_challenge_responses_mode ON challenge_responses(mode);

ALTER TABLE jurnal
  ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'general'
    CHECK (mode IN ('general','research'));
CREATE INDEX idx_jurnal_mode ON jurnal(mode);

ALTER TABLE quiz_submissions
  ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'general'
    CHECK (mode IN ('general','research'));
CREATE INDEX idx_quiz_submissions_mode ON quiz_submissions(mode);

ALTER TABLE prompt_classifications
  ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'general'
    CHECK (mode IN ('general','research'));
CREATE INDEX idx_prompt_classifications_mode ON prompt_classifications(mode);
