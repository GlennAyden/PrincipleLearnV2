-- MVR Item 6 + Item 9.1: research_artifacts extension untuk 6 komponen interaktif + mode tag.
-- learning_session_id sudah ada sejak 2026-04-18 migration; skip ADD COLUMN.
-- Applied via Supabase migration `mvr_w8_research_artifacts_interactive_cols` (version 20260516063040).

-- 1. Extend artifact_type CHECK constraint dengan 6 tipe komponen interaktif baru.
-- Constraint baru karena belum ada CHECK pada kolom ini.
ALTER TABLE research_artifacts ADD CONSTRAINT research_artifacts_artifact_type_check
  CHECK (artifact_type IN (
    'pseudocode','flowchart','algorithm','solution',
    'trace_table','output_predictor','parsons','bug_hunt',
    'flowchart_builder','block_builder'
  ));

-- 2. Kolom interaksi + mode.
ALTER TABLE research_artifacts
  ADD COLUMN interaction_events JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN completion_status VARCHAR(20) NOT NULL DEFAULT 'in_progress'
    CHECK (completion_status IN ('in_progress','submitted','abandoned')),
  ADD COLUMN component_score NUMERIC(3,2)
    CHECK (component_score IS NULL OR (component_score >= 0 AND component_score <= 1)),
  ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'general'
    CHECK (mode IN ('general','research'));

CREATE INDEX idx_research_artifacts_mode               ON research_artifacts(mode);
CREATE INDEX idx_research_artifacts_completion_status  ON research_artifacts(completion_status);
CREATE INDEX idx_research_artifacts_session            ON research_artifacts(learning_session_id);
CREATE INDEX idx_research_artifacts_user               ON research_artifacts(user_id);
