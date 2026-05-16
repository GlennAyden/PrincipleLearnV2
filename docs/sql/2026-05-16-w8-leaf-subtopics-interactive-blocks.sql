-- MVR Item 9.1: leaf_subtopics.interactive_blocks JSONB array of {type, config} entries.
-- Applied via Supabase migration `mvr_w8_leaf_subtopics_interactive_blocks` (version 20260516063043).

ALTER TABLE leaf_subtopics
  ADD COLUMN interactive_blocks JSONB NOT NULL DEFAULT '[]'::jsonb;

CREATE INDEX idx_leaf_subtopics_interactive_blocks ON leaf_subtopics USING GIN (interactive_blocks);
