-- MVR Item 4 (citation) + Item 7 (scaffold tier) + Item 5 (prompt template versioning).
-- All column-additions with safe defaults; existing rows backfill implicitly.
-- Applied via Supabase migration `mvr_w4_5_citation_scaffold_prompt_template_cols` (version 20260516063030).

ALTER TABLE ask_question_history
  ADD COLUMN cited_material_chunk_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN scaffold_tier INT NOT NULL DEFAULT 1 CHECK (scaffold_tier BETWEEN 1 AND 3),
  ADD COLUMN prompt_template_version VARCHAR(20) NOT NULL DEFAULT 'baseline_v1';

ALTER TABLE challenge_responses
  ADD COLUMN cited_material_chunk_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN scaffold_tier INT NOT NULL DEFAULT 1 CHECK (scaffold_tier BETWEEN 1 AND 3),
  ADD COLUMN prompt_template_version VARCHAR(20) NOT NULL DEFAULT 'baseline_v1';

CREATE INDEX idx_ask_question_history_scaffold_tier  ON ask_question_history(scaffold_tier);
CREATE INDEX idx_challenge_responses_scaffold_tier   ON challenge_responses(scaffold_tier);
