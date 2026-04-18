
ALTER TABLE quiz_submissions
  ADD COLUMN IF NOT EXISTS attempt_number INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS quiz_attempt_id UUID NOT NULL DEFAULT gen_random_uuid();

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_attempt
  ON quiz_submissions(user_id, subtopic_id, attempt_number);

CREATE INDEX IF NOT EXISTS idx_quiz_submissions_attempt_id
  ON quiz_submissions(quiz_attempt_id);
;
