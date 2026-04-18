
-- ============================================================
-- 1. Create ask_question_history table (missing from migration)
-- ============================================================
CREATE TABLE IF NOT EXISTS ask_question_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
  module_index INT DEFAULT 0,
  subtopic_index INT DEFAULT 0,
  page_number INT DEFAULT 0,
  subtopic_label VARCHAR,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  -- New RM-critical fields
  reasoning_note TEXT,
  prompt_components JSONB,
  prompt_version INT DEFAULT 1,
  session_number INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ask_question_history_user_id ON ask_question_history(user_id);
CREATE INDEX IF NOT EXISTS idx_ask_question_history_course_id ON ask_question_history(course_id);
CREATE INDEX IF NOT EXISTS idx_ask_question_history_created_at ON ask_question_history(created_at);
CREATE INDEX IF NOT EXISTS idx_ask_question_history_user_course ON ask_question_history(user_id, course_id);
CREATE INDEX IF NOT EXISTS idx_ask_question_history_session ON ask_question_history(user_id, session_number);

-- Enable RLS
ALTER TABLE ask_question_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on ask_question_history"
  ON ask_question_history FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================
-- 2. Create challenge_responses table (missing from migration)
-- ============================================================
CREATE TABLE IF NOT EXISTS challenge_responses (
  id VARCHAR PRIMARY KEY,
  user_id VARCHAR NOT NULL,
  course_id VARCHAR NOT NULL,
  module_index INT DEFAULT 0,
  subtopic_index INT DEFAULT 0,
  page_number INT DEFAULT 0,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  feedback TEXT,
  -- New RM-critical field
  reasoning_note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_challenge_responses_user_id ON challenge_responses(user_id);
CREATE INDEX IF NOT EXISTS idx_challenge_responses_course_id ON challenge_responses(course_id);
CREATE INDEX IF NOT EXISTS idx_challenge_responses_created_at ON challenge_responses(created_at);

-- Enable RLS
ALTER TABLE challenge_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access on challenge_responses"
  ON challenge_responses FOR ALL
  USING (true) WITH CHECK (true);

-- ============================================================
-- 3. Add reasoning_note to quiz_submissions
-- ============================================================
ALTER TABLE quiz_submissions ADD COLUMN IF NOT EXISTS reasoning_note TEXT;
;
