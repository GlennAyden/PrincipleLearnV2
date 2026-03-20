-- ============================================
-- RESEARCH DATA TABLES FOR THESIS
-- PrincipleLearn V3 - Prompt Development Analysis
-- ============================================
-- Tabel-tabel ini dirancang untuk menjawab:
-- RM 2: Tahapan perkembangan struktur prompt siswa
-- RM 3: Manifestasi indikator CT dan Critical Thinking
-- ============================================

-- 1. LEARNING SESSIONS TABLE
-- Tracking sesi pembelajaran longitudinal per siswa
-- ============================================
CREATE TABLE IF NOT EXISTS learning_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    
    -- Session identification
    session_number INT NOT NULL,              -- Sesi ke-1, ke-2, dst
    session_date DATE NOT NULL,
    session_start TIMESTAMP WITH TIME ZONE,
    session_end TIMESTAMP WITH TIME ZONE,
    
    -- Session metrics (akan diupdate setelah sesi selesai)
    total_prompts INT DEFAULT 0,
    total_revisions INT DEFAULT 0,
    
    -- Dominant stage per session (Bab 3, Tabel 29)
    -- SCP=1, SRP=2, MQP=3, REFLECTIVE=4
    dominant_stage VARCHAR(20),               -- 'SCP', 'SRP', 'MQP', 'REFLECTIVE'
    dominant_stage_score INT,                 -- 1-4
    
    -- Cognitive metrics
    avg_cognitive_depth DECIMAL(3,2),         -- 1.00 - 4.00
    avg_ct_score DECIMAL(4,2),                -- 0.00 - 12.00
    avg_cth_score DECIMAL(4,2),               -- 0.00 - 12.00
    
    -- Longitudinal transition (dari sesi sebelumnya)
    stage_transition INT,                     -- -3 s.d. +3
    transition_status VARCHAR(20),            -- 'naik_stabil', 'fluktuatif', 'stagnan', 'anomali'
    
    -- Quality gate (Bab 3)
    is_valid_for_analysis BOOLEAN DEFAULT TRUE,
    validity_note TEXT,                       -- Alasan jika tidak valid
    
    -- Researcher notes
    researcher_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: satu user hanya punya satu session number per course
    UNIQUE(user_id, course_id, session_number)
);

-- Indexes for learning_sessions
CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_id ON learning_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_course_id ON learning_sessions(course_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_date ON learning_sessions(session_date);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_user_course ON learning_sessions(user_id, course_id);

-- 2. PROMPT CLASSIFICATIONS TABLE
-- Klasifikasi tahap prompt (SCP/SRP/MQP/Reflektif)
-- Referensi: Bab 3, Tabel 7 & 8
-- ============================================
CREATE TABLE IF NOT EXISTS prompt_classifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source prompt reference (polymorphic)
    prompt_source VARCHAR(30) NOT NULL,       -- 'ask_question', 'discussion', 'challenge'
    prompt_id UUID NOT NULL,                  -- FK ke tabel sumber
    
    -- Session context
    learning_session_id UUID REFERENCES learning_sessions(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    
    -- Prompt text (denormalized for analysis convenience)
    prompt_text TEXT NOT NULL,
    prompt_sequence INT,                      -- Urutan prompt dalam sesi
    
    -- ============================================
    -- TAHAP PROMPT (Bab 3, Tabel 8)
    -- ============================================
    -- SCP (Simple Clarification Prompt): Pertanyaan tunggal, langsung, minim konteks
    -- SRP (Structured Reformulation Prompt): Prompt direformulasi dengan konteks
    -- MQP (Multi-Question Prompt): Pertanyaan berlapis dan iteratif
    -- REFLECTIVE: Prompt evaluatif, membandingkan alternatif, justifikasi
    prompt_stage VARCHAR(20) NOT NULL,        -- 'SCP', 'SRP', 'MQP', 'REFLECTIVE'
    prompt_stage_score INT NOT NULL CHECK (prompt_stage_score BETWEEN 1 AND 4),
    
    -- ============================================
    -- PENANDA MIKRO (Bab 3, Tabel 7)
    -- ============================================
    -- GCP (Goal and Contextualized Prompting): Menegaskan tujuan dan konteks
    -- PP (Procedural Prompting): Meminta langkah prosedural bertahap
    -- ARP (Analytical and Reflective Prompting): Evaluasi dan refleksi
    micro_markers TEXT[],                     -- Array: ['GCP', 'PP', 'ARP']
    primary_marker VARCHAR(10),               -- Kode primer: 'GCP', 'PP', atau 'ARP'
    
    -- ============================================
    -- CLASSIFICATION METADATA
    -- ============================================
    classified_by VARCHAR(20) NOT NULL,       -- 'auto', 'manual', 'researcher_1', 'researcher_2'
    classification_method VARCHAR(50),        -- 'rule_based', 'llm_assisted', 'manual_coding'
    confidence_score DECIMAL(3,2),            -- 0.00 - 1.00 (untuk klasifikasi otomatis)
    
    -- Inter-rater reliability (jika ada multiple coders)
    secondary_classification_id UUID,         -- FK ke klasifikasi coder kedua
    agreement_status VARCHAR(20),             -- 'agreed', 'disagreed', 'resolved'
    
    -- Evidence and notes
    classification_evidence TEXT,             -- Bukti/alasan klasifikasi
    researcher_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- Unique constraint: satu prompt hanya diklasifikasi sekali per classifier
    UNIQUE(prompt_source, prompt_id, classified_by)
);

-- Indexes for prompt_classifications
CREATE INDEX IF NOT EXISTS idx_prompt_class_user_id ON prompt_classifications(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_class_course_id ON prompt_classifications(course_id);
CREATE INDEX IF NOT EXISTS idx_prompt_class_session ON prompt_classifications(learning_session_id);
CREATE INDEX IF NOT EXISTS idx_prompt_class_stage ON prompt_classifications(prompt_stage);
CREATE INDEX IF NOT EXISTS idx_prompt_class_source ON prompt_classifications(prompt_source, prompt_id);

-- 3. COGNITIVE INDICATORS TABLE
-- Indikator CT dan Critical Thinking per prompt
-- Referensi: Bab 3, Tabel 9 & 10
-- ============================================
CREATE TABLE IF NOT EXISTS cognitive_indicators (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- References
    prompt_classification_id UUID NOT NULL REFERENCES prompt_classifications(id) ON DELETE CASCADE,
    prompt_id UUID NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    
    -- ============================================
    -- COMPUTATIONAL THINKING INDICATORS (Bab 3, Tabel 10)
    -- Skala: 0 = tidak ada, 1 = ada sebagian, 2 = ada jelas
    -- ============================================
    ct_decomposition INT DEFAULT 0 CHECK (ct_decomposition BETWEEN 0 AND 2),
        -- Memecah masalah kompleks menjadi submasalah
    ct_pattern_recognition INT DEFAULT 0 CHECK (ct_pattern_recognition BETWEEN 0 AND 2),
        -- Mengidentifikasi kemiripan struktur kasus
    ct_abstraction INT DEFAULT 0 CHECK (ct_abstraction BETWEEN 0 AND 2),
        -- Menyederhanakan detail, menonjolkan prinsip inti
    ct_algorithm_design INT DEFAULT 0 CHECK (ct_algorithm_design BETWEEN 0 AND 2),
        -- Menyusun langkah solusi secara logis
    ct_evaluation_debugging INT DEFAULT 0 CHECK (ct_evaluation_debugging BETWEEN 0 AND 2),
        -- Menguji, mengecek error, memperbaiki solusi
    ct_generalization INT DEFAULT 0 CHECK (ct_generalization BETWEEN 0 AND 2),
        -- Menerapkan strategi pada konteks lain
    
    ct_total_score INT GENERATED ALWAYS AS (
        ct_decomposition + ct_pattern_recognition + ct_abstraction + 
        ct_algorithm_design + ct_evaluation_debugging + ct_generalization
    ) STORED,  -- 0-12
    
    -- ============================================
    -- CRITICAL THINKING INDICATORS (Bab 3, Tabel 9)
    -- Skala: 0 = tidak ada, 1 = ada sebagian, 2 = ada jelas
    -- ============================================
    cth_interpretation INT DEFAULT 0 CHECK (cth_interpretation BETWEEN 0 AND 2),
        -- Memaknai persoalan dan batasan tugas
    cth_analysis INT DEFAULT 0 CHECK (cth_analysis BETWEEN 0 AND 2),
        -- Memecah alasan dan menguji struktur penjelasan
    cth_evaluation INT DEFAULT 0 CHECK (cth_evaluation BETWEEN 0 AND 2),
        -- Menilai ketepatan dan kelemahan jawaban
    cth_inference INT DEFAULT 0 CHECK (cth_inference BETWEEN 0 AND 2),
        -- Menarik kesimpulan atau alternatif
    cth_explanation INT DEFAULT 0 CHECK (cth_explanation BETWEEN 0 AND 2),
        -- Menjelaskan alasan memilih strategi
    cth_self_regulation INT DEFAULT 0 CHECK (cth_self_regulation BETWEEN 0 AND 2),
        -- Merevisi cara berpikir setelah umpan balik
    
    cth_total_score INT GENERATED ALWAYS AS (
        cth_interpretation + cth_analysis + cth_evaluation + 
        cth_inference + cth_explanation + cth_self_regulation
    ) STORED,  -- 0-12
    
    -- ============================================
    -- COGNITIVE DEPTH LEVEL (Bab 3, Tabel 28)
    -- ============================================
    -- 1 = Dasar deskriptif (bertanya fakta tanpa elaborasi)
    -- 2 = Analitik awal (membandingkan opsi, sebab-akibat sederhana)
    -- 3 = Analitik-reflektif (justifikasi, evaluasi ketepatan)
    -- 4 = Metakognitif mendalam (verifikasi asumsi, validasi hasil)
    cognitive_depth_level INT CHECK (cognitive_depth_level BETWEEN 1 AND 4),
    
    -- ============================================
    -- EVIDENCE AND METADATA
    -- ============================================
    evidence_text TEXT,                       -- Kutipan bukti dari prompt
    indicator_notes TEXT,                     -- Catatan penilai
    
    assessed_by VARCHAR(50) NOT NULL,         -- 'researcher_1', 'researcher_2', 'auto'
    assessment_method VARCHAR(50),            -- 'manual_rubric', 'llm_assisted'
    
    -- Inter-rater reliability
    secondary_assessment_id UUID,
    agreement_status VARCHAR(20),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for cognitive_indicators
CREATE INDEX IF NOT EXISTS idx_cog_ind_classification ON cognitive_indicators(prompt_classification_id);
CREATE INDEX IF NOT EXISTS idx_cog_ind_user ON cognitive_indicators(user_id);
CREATE INDEX IF NOT EXISTS idx_cog_ind_ct_score ON cognitive_indicators(ct_total_score);
CREATE INDEX IF NOT EXISTS idx_cog_ind_cth_score ON cognitive_indicators(cth_total_score);
CREATE INDEX IF NOT EXISTS idx_cog_ind_depth ON cognitive_indicators(cognitive_depth_level);

-- 4. PROMPT REVISIONS TABLE
-- Tracking revisi prompt dalam satu episode
-- ============================================
CREATE TABLE IF NOT EXISTS prompt_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    learning_session_id UUID REFERENCES learning_sessions(id) ON DELETE SET NULL,
    
    -- Episode identification (satu episode = satu masalah yang diselesaikan)
    episode_id UUID NOT NULL,                 -- Group ID untuk satu episode
    episode_topic TEXT,                       -- Topik/masalah yang sedang diselesaikan
    
    -- Revision chain
    original_prompt_id UUID NOT NULL,         -- Prompt pertama dalam episode
    current_prompt_id UUID NOT NULL,          -- Prompt saat ini
    previous_prompt_id UUID,                  -- Prompt sebelumnya (NULL jika ini yang pertama)
    revision_sequence INT NOT NULL,           -- Urutan: 1, 2, 3...
    
    -- Revision analysis
    revision_type VARCHAR(30),                -- 'clarification', 'elaboration', 'correction', 'refinement', 'follow_up'
    quality_change VARCHAR(20),               -- 'improved', 'same', 'degraded'
    
    -- Stage transition within episode
    previous_stage VARCHAR(20),
    current_stage VARCHAR(20),
    stage_improved BOOLEAN,
    
    -- Notes
    revision_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for prompt_revisions
CREATE INDEX IF NOT EXISTS idx_prompt_rev_user ON prompt_revisions(user_id);
CREATE INDEX IF NOT EXISTS idx_prompt_rev_session ON prompt_revisions(learning_session_id);
CREATE INDEX IF NOT EXISTS idx_prompt_rev_episode ON prompt_revisions(episode_id);
CREATE INDEX IF NOT EXISTS idx_prompt_rev_original ON prompt_revisions(original_prompt_id);

-- 5. RESEARCH ARTIFACTS TABLE
-- Artefak solusi siswa (pseudocode, algoritma)
-- ============================================
CREATE TABLE IF NOT EXISTS research_artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id UUID NOT NULL REFERENCES courses(id) ON DELETE CASCADE,
    learning_session_id UUID REFERENCES learning_sessions(id) ON DELETE SET NULL,
    
    -- Artifact identification
    artifact_type VARCHAR(30) NOT NULL,       -- 'pseudocode', 'flowchart', 'algorithm', 'solution'
    artifact_title TEXT,
    artifact_content TEXT NOT NULL,
    
    -- Related prompts
    related_prompt_ids UUID[],                -- Array of prompt IDs yang menghasilkan artefak ini
    
    -- Quality assessment (Bab 3, Tabel 13)
    decomposition_quality INT CHECK (decomposition_quality BETWEEN 0 AND 2),
    algorithm_accuracy INT CHECK (algorithm_accuracy BETWEEN 0 AND 2),
    abstraction_quality INT CHECK (abstraction_quality BETWEEN 0 AND 2),
    evaluation_revision INT CHECK (evaluation_revision BETWEEN 0 AND 2),
    decision_justification INT CHECK (decision_justification BETWEEN 0 AND 2),
    
    total_artifact_score INT GENERATED ALWAYS AS (
        COALESCE(decomposition_quality, 0) + COALESCE(algorithm_accuracy, 0) + 
        COALESCE(abstraction_quality, 0) + COALESCE(evaluation_revision, 0) + 
        COALESCE(decision_justification, 0)
    ) STORED,
    
    -- Metadata
    assessed_by VARCHAR(50),
    assessment_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for research_artifacts
CREATE INDEX IF NOT EXISTS idx_artifacts_user ON research_artifacts(user_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_session ON research_artifacts(learning_session_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON research_artifacts(artifact_type);

-- 6. TRIANGULATION RECORDS TABLE
-- Rekaman triangulasi lintas sumber data
-- Referensi: Bab 3, Tabel 22
-- ============================================
CREATE TABLE IF NOT EXISTS triangulation_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    learning_session_id UUID REFERENCES learning_sessions(id) ON DELETE SET NULL,
    
    -- Finding being triangulated
    finding_type VARCHAR(50) NOT NULL,        -- 'prompt_stage_change', 'ct_increase', 'cth_increase', 'anomaly'
    finding_description TEXT NOT NULL,
    
    -- Evidence from different sources (Bab 3, Tabel 22)
    log_evidence TEXT,                        -- Bukti dari digital log
    log_evidence_status VARCHAR(20),          -- 'supports', 'neutral', 'contradicts'
    
    observation_evidence TEXT,                -- Bukti dari observasi kelas
    observation_evidence_status VARCHAR(20),
    
    artifact_evidence TEXT,                   -- Bukti dari artefak solusi
    artifact_evidence_status VARCHAR(20),
    
    interview_evidence TEXT,                  -- Bukti dari wawancara (jika ada)
    interview_evidence_status VARCHAR(20),
    
    -- Triangulation result
    convergence_status VARCHAR(20) NOT NULL,  -- 'convergen', 'partial', 'contradictory'
    convergence_score INT,                    -- Jumlah sumber yang mendukung
    
    -- Decision
    final_decision VARCHAR(50),               -- 'accepted', 'revised', 'rejected', 'pending'
    decision_rationale TEXT,
    
    researcher_notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for triangulation_records
CREATE INDEX IF NOT EXISTS idx_triangulation_user ON triangulation_records(user_id);
CREATE INDEX IF NOT EXISTS idx_triangulation_session ON triangulation_records(learning_session_id);
CREATE INDEX IF NOT EXISTS idx_triangulation_status ON triangulation_records(convergence_status);

-- 7. INTER-RATER RELIABILITY TABLE
-- Rekaman reliabilitas antar-penilai
-- Referensi: Bab 3, Tabel 25
-- ============================================
CREATE TABLE IF NOT EXISTS inter_rater_reliability (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Coding round identification
    coding_round VARCHAR(50) NOT NULL,        -- 'round_1', 'round_2', etc.
    coding_type VARCHAR(50) NOT NULL,         -- 'prompt_classification', 'cognitive_indicators'
    
    -- Sample information
    total_units_coded INT NOT NULL,
    sample_size INT NOT NULL,                 -- Minimal 25% dari total
    sample_percentage DECIMAL(5,2),
    
    -- Raters
    rater_1_id VARCHAR(50) NOT NULL,
    rater_2_id VARCHAR(50) NOT NULL,
    
    -- Reliability metrics (Bab 3)
    observed_agreement DECIMAL(5,4),          -- Po (0.0000 - 1.0000)
    expected_agreement DECIMAL(5,4),          -- Pe
    cohens_kappa DECIMAL(5,4),                -- κ = (Po - Pe) / (1 - Pe)
    
    -- Threshold check
    meets_po_threshold BOOLEAN,               -- Po >= 0.80
    meets_kappa_threshold BOOLEAN,            -- κ >= 0.70
    overall_acceptable BOOLEAN,               -- Both thresholds met
    
    -- Actions taken
    disagreement_resolution TEXT,             -- Bagaimana ketidaksepakatan diselesaikan
    codebook_revisions TEXT,                  -- Revisi buku kode jika ada
    
    notes TEXT,
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Index for inter_rater_reliability
CREATE INDEX IF NOT EXISTS idx_irr_round ON inter_rater_reliability(coding_round);
CREATE INDEX IF NOT EXISTS idx_irr_type ON inter_rater_reliability(coding_type);

-- ============================================
-- ADDITIONAL COLUMNS FOR EXISTING TABLES
-- ============================================

-- Add learning_session_id to ask_question_history
ALTER TABLE ask_question_history 
ADD COLUMN IF NOT EXISTS learning_session_id UUID REFERENCES learning_sessions(id) ON DELETE SET NULL;

ALTER TABLE ask_question_history 
ADD COLUMN IF NOT EXISTS is_follow_up BOOLEAN DEFAULT FALSE;

ALTER TABLE ask_question_history 
ADD COLUMN IF NOT EXISTS follow_up_of UUID REFERENCES ask_question_history(id);

ALTER TABLE ask_question_history 
ADD COLUMN IF NOT EXISTS response_time_ms INT;

-- Add learning_session_id to discussion_messages
ALTER TABLE discussion_messages 
ADD COLUMN IF NOT EXISTS learning_session_id UUID REFERENCES learning_sessions(id) ON DELETE SET NULL;

ALTER TABLE discussion_messages 
ADD COLUMN IF NOT EXISTS is_prompt_revision BOOLEAN DEFAULT FALSE;

ALTER TABLE discussion_messages 
ADD COLUMN IF NOT EXISTS revision_of_message_id UUID REFERENCES discussion_messages(id);

-- Add learning_session_id to challenge_responses
ALTER TABLE challenge_responses 
ADD COLUMN IF NOT EXISTS learning_session_id UUID REFERENCES learning_sessions(id) ON DELETE SET NULL;

-- ============================================
-- VIEWS FOR RESEARCH ANALYSIS
-- ============================================

-- View: Longitudinal prompt development per user
CREATE OR REPLACE VIEW v_longitudinal_prompt_development AS
SELECT 
    ls.user_id,
    u.name as user_name,
    u.email as user_email,
    ls.course_id,
    c.title as course_title,
    ls.session_number,
    ls.session_date,
    ls.total_prompts,
    ls.dominant_stage,
    ls.dominant_stage_score,
    ls.avg_cognitive_depth,
    ls.avg_ct_score,
    ls.avg_cth_score,
    ls.stage_transition,
    ls.transition_status,
    ls.is_valid_for_analysis
FROM learning_sessions ls
JOIN users u ON ls.user_id = u.id
JOIN courses c ON ls.course_id = c.id
ORDER BY ls.user_id, ls.session_number;

-- View: Prompt classification summary
CREATE OR REPLACE VIEW v_prompt_classification_summary AS
SELECT 
    pc.user_id,
    pc.course_id,
    pc.learning_session_id,
    ls.session_number,
    pc.prompt_stage,
    COUNT(*) as prompt_count,
    AVG(pc.prompt_stage_score) as avg_stage_score,
    array_agg(DISTINCT pc.primary_marker) as markers_used
FROM prompt_classifications pc
LEFT JOIN learning_sessions ls ON pc.learning_session_id = ls.id
GROUP BY pc.user_id, pc.course_id, pc.learning_session_id, ls.session_number, pc.prompt_stage
ORDER BY pc.user_id, ls.session_number, pc.prompt_stage;

-- View: Cognitive indicators summary per session
CREATE OR REPLACE VIEW v_cognitive_indicators_summary AS
SELECT 
    ci.user_id,
    pc.learning_session_id,
    ls.session_number,
    AVG(ci.ct_total_score) as avg_ct_score,
    AVG(ci.cth_total_score) as avg_cth_score,
    AVG(ci.cognitive_depth_level) as avg_depth,
    -- CT breakdown
    AVG(ci.ct_decomposition) as avg_ct_decomposition,
    AVG(ci.ct_pattern_recognition) as avg_ct_pattern,
    AVG(ci.ct_abstraction) as avg_ct_abstraction,
    AVG(ci.ct_algorithm_design) as avg_ct_algorithm,
    AVG(ci.ct_evaluation_debugging) as avg_ct_eval,
    AVG(ci.ct_generalization) as avg_ct_general,
    -- CTh breakdown
    AVG(ci.cth_interpretation) as avg_cth_interpret,
    AVG(ci.cth_analysis) as avg_cth_analysis,
    AVG(ci.cth_evaluation) as avg_cth_eval,
    AVG(ci.cth_inference) as avg_cth_inference,
    AVG(ci.cth_explanation) as avg_cth_explain,
    AVG(ci.cth_self_regulation) as avg_cth_selfreg
FROM cognitive_indicators ci
JOIN prompt_classifications pc ON ci.prompt_classification_id = pc.id
LEFT JOIN learning_sessions ls ON pc.learning_session_id = ls.id
GROUP BY ci.user_id, pc.learning_session_id, ls.session_number
ORDER BY ci.user_id, ls.session_number;

-- ============================================
-- FUNCTIONS FOR RESEARCH ANALYSIS
-- ============================================

-- Function: Calculate session metrics after prompts are classified
CREATE OR REPLACE FUNCTION update_session_metrics(p_session_id UUID)
RETURNS VOID AS $$
DECLARE
    v_total_prompts INT;
    v_dominant_stage VARCHAR(20);
    v_dominant_score INT;
    v_avg_depth DECIMAL(3,2);
    v_avg_ct DECIMAL(4,2);
    v_avg_cth DECIMAL(4,2);
BEGIN
    -- Count total prompts
    SELECT COUNT(*) INTO v_total_prompts
    FROM prompt_classifications
    WHERE learning_session_id = p_session_id;
    
    -- Get dominant stage
    SELECT prompt_stage, prompt_stage_score INTO v_dominant_stage, v_dominant_score
    FROM prompt_classifications
    WHERE learning_session_id = p_session_id
    GROUP BY prompt_stage, prompt_stage_score
    ORDER BY COUNT(*) DESC, prompt_stage_score DESC
    LIMIT 1;
    
    -- Calculate averages from cognitive indicators
    SELECT 
        AVG(ci.cognitive_depth_level),
        AVG(ci.ct_total_score),
        AVG(ci.cth_total_score)
    INTO v_avg_depth, v_avg_ct, v_avg_cth
    FROM cognitive_indicators ci
    JOIN prompt_classifications pc ON ci.prompt_classification_id = pc.id
    WHERE pc.learning_session_id = p_session_id;
    
    -- Update session
    UPDATE learning_sessions
    SET 
        total_prompts = v_total_prompts,
        dominant_stage = v_dominant_stage,
        dominant_stage_score = v_dominant_score,
        avg_cognitive_depth = v_avg_depth,
        avg_ct_score = v_avg_ct,
        avg_cth_score = v_avg_cth,
        updated_at = NOW()
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Calculate stage transition between sessions
CREATE OR REPLACE FUNCTION calculate_stage_transition(p_user_id UUID, p_course_id UUID)
RETURNS VOID AS $$
DECLARE
    r RECORD;
    prev_score INT := NULL;
BEGIN
    FOR r IN 
        SELECT id, session_number, dominant_stage_score
        FROM learning_sessions
        WHERE user_id = p_user_id AND course_id = p_course_id
        ORDER BY session_number
    LOOP
        IF prev_score IS NOT NULL THEN
            UPDATE learning_sessions
            SET 
                stage_transition = r.dominant_stage_score - prev_score,
                transition_status = CASE
                    WHEN r.dominant_stage_score > prev_score THEN 'naik_stabil'
                    WHEN r.dominant_stage_score = prev_score THEN 'stagnan'
                    ELSE 'turun'
                END,
                updated_at = NOW()
            WHERE id = r.id;
        END IF;
        prev_score := r.dominant_stage_score;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- COMMENTS FOR DOCUMENTATION
-- ============================================

COMMENT ON TABLE learning_sessions IS 'Tracking sesi pembelajaran longitudinal per siswa untuk analisis perkembangan prompt (Bab 3)';
COMMENT ON TABLE prompt_classifications IS 'Klasifikasi tahap prompt: SCP, SRP, MQP, Reflektif (Bab 3, Tabel 7 & 8)';
COMMENT ON TABLE cognitive_indicators IS 'Indikator CT dan Critical Thinking per prompt (Bab 3, Tabel 9 & 10)';
COMMENT ON TABLE prompt_revisions IS 'Tracking revisi prompt dalam satu episode penyelesaian masalah';
COMMENT ON TABLE research_artifacts IS 'Artefak solusi siswa: pseudocode, algoritma (Bab 3, Tabel 13)';
COMMENT ON TABLE triangulation_records IS 'Rekaman triangulasi lintas sumber data (Bab 3, Tabel 22)';
COMMENT ON TABLE inter_rater_reliability IS 'Rekaman reliabilitas antar-penilai (Bab 3, Tabel 25)';

-- ============================================
-- END OF MIGRATION
-- ============================================
