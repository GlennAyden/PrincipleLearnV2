
-- Auto Cognitive Scores: unified CT/CrT measurement across all interaction points
CREATE TABLE IF NOT EXISTS auto_cognitive_scores (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Source identification
    source TEXT NOT NULL CHECK (source IN ('ask_question','challenge_response','quiz_submission','journal','discussion')),
    source_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,

    -- CT indicators (0-2 each, 0-12 total)
    ct_decomposition SMALLINT NOT NULL DEFAULT 0 CHECK (ct_decomposition BETWEEN 0 AND 2),
    ct_pattern_recognition SMALLINT NOT NULL DEFAULT 0 CHECK (ct_pattern_recognition BETWEEN 0 AND 2),
    ct_abstraction SMALLINT NOT NULL DEFAULT 0 CHECK (ct_abstraction BETWEEN 0 AND 2),
    ct_algorithm_design SMALLINT NOT NULL DEFAULT 0 CHECK (ct_algorithm_design BETWEEN 0 AND 2),
    ct_evaluation_debugging SMALLINT NOT NULL DEFAULT 0 CHECK (ct_evaluation_debugging BETWEEN 0 AND 2),
    ct_generalization SMALLINT NOT NULL DEFAULT 0 CHECK (ct_generalization BETWEEN 0 AND 2),
    ct_total_score SMALLINT GENERATED ALWAYS AS (
        ct_decomposition + ct_pattern_recognition + ct_abstraction +
        ct_algorithm_design + ct_evaluation_debugging + ct_generalization
    ) STORED,

    -- CrT indicators (0-2 each, 0-12 total)
    cth_interpretation SMALLINT NOT NULL DEFAULT 0 CHECK (cth_interpretation BETWEEN 0 AND 2),
    cth_analysis SMALLINT NOT NULL DEFAULT 0 CHECK (cth_analysis BETWEEN 0 AND 2),
    cth_evaluation SMALLINT NOT NULL DEFAULT 0 CHECK (cth_evaluation BETWEEN 0 AND 2),
    cth_inference SMALLINT NOT NULL DEFAULT 0 CHECK (cth_inference BETWEEN 0 AND 2),
    cth_explanation SMALLINT NOT NULL DEFAULT 0 CHECK (cth_explanation BETWEEN 0 AND 2),
    cth_self_regulation SMALLINT NOT NULL DEFAULT 0 CHECK (cth_self_regulation BETWEEN 0 AND 2),
    cth_total_score SMALLINT GENERATED ALWAYS AS (
        cth_interpretation + cth_analysis + cth_evaluation +
        cth_inference + cth_explanation + cth_self_regulation
    ) STORED,

    -- Meta
    cognitive_depth_level SMALLINT CHECK (cognitive_depth_level BETWEEN 1 AND 4),
    confidence REAL CHECK (confidence BETWEEN 0 AND 1),
    evidence_summary TEXT,
    assessment_method TEXT NOT NULL DEFAULT 'llm_auto',
    prompt_stage TEXT,
    is_follow_up BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for common query patterns
CREATE INDEX idx_acs_user ON auto_cognitive_scores(user_id);
CREATE INDEX idx_acs_source ON auto_cognitive_scores(source, source_id);
CREATE INDEX idx_acs_course ON auto_cognitive_scores(course_id);
CREATE INDEX idx_acs_user_source ON auto_cognitive_scores(user_id, source);
CREATE INDEX idx_acs_created ON auto_cognitive_scores(created_at);

-- RLS: service role only
ALTER TABLE auto_cognitive_scores ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON auto_cognitive_scores FOR ALL USING (true) WITH CHECK (true);

-- Index for follow-up chain queries on ask_question_history
CREATE INDEX IF NOT EXISTS idx_aqh_follow_up ON ask_question_history(follow_up_of) WHERE follow_up_of IS NOT NULL;
;
