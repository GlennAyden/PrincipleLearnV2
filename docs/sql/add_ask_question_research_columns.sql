ALTER TABLE ask_question_history
  ADD COLUMN IF NOT EXISTS prompt_stage TEXT,
  ADD COLUMN IF NOT EXISTS stage_confidence NUMERIC,
  ADD COLUMN IF NOT EXISTS micro_markers JSONB;
