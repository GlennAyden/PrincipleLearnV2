/**
 * Research Data Types for Thesis
 * PrincipleLearn V3 - Prompt Development Analysis
 * 
 * Types ini dirancang untuk menjawab:
 * RM 2: Tahapan perkembangan struktur prompt siswa
 * RM 3: Manifestasi indikator CT dan Critical Thinking
 */

// ============================================
// ENUMS AND CONSTANTS
// ============================================

/**
 * Tahap Prompt (Bab 3, Tabel 8)
 * SCP → SRP → MQP → REFLECTIVE
 */
export type PromptStage = 'SCP' | 'SRP' | 'MQP' | 'REFLECTIVE';

export const PROMPT_STAGE_SCORES: Record<PromptStage, number> = {
    SCP: 1,        // Simple Clarification Prompt
    SRP: 2,        // Structured Reformulation Prompt
    MQP: 3,        // Multi-Question Prompt
    REFLECTIVE: 4  // Reflective/Evaluative Prompt
};

export const PROMPT_STAGE_LABELS: Record<PromptStage, string> = {
    SCP: 'Simple Clarification Prompt',
    SRP: 'Structured Reformulation Prompt',
    MQP: 'Multi-Question Prompt',
    REFLECTIVE: 'Reflective Prompt'
};

export const PROMPT_STAGE_DESCRIPTIONS: Record<PromptStage, string> = {
    SCP: 'Pertanyaan tunggal, langsung, minim konteks masalah',
    SRP: 'Prompt direformulasi setelah respons awal AI untuk memperjelas tujuan dan langkah',
    MQP: 'Pertanyaan berlapis dan iteratif dalam satu rangkaian penyelesaian masalah',
    REFLECTIVE: 'Prompt menilai kualitas solusi, membandingkan alternatif, dan menjustifikasi keputusan'
};

/**
 * Penanda Mikro (Bab 3, Tabel 7)
 */
export type MicroMarker = 'GCP' | 'PP' | 'ARP';

export const MICRO_MARKER_LABELS: Record<MicroMarker, string> = {
    GCP: 'Goal and Contextualized Prompting',
    PP: 'Procedural Prompting',
    ARP: 'Analytical and Reflective Prompting'
};

export const MICRO_MARKER_DESCRIPTIONS: Record<MicroMarker, string> = {
    GCP: 'Prompt yang menegaskan tujuan belajar dan konteks masalah sebelum meminta solusi',
    PP: 'Prompt yang meminta langkah prosedural bertahap untuk menyusun, menguji, atau merevisi solusi',
    ARP: 'Prompt yang mengevaluasi kualitas solusi, membandingkan alternatif, dan merefleksikan asumsi keputusan'
};

/**
 * Cognitive Depth Level (Bab 3, Tabel 28)
 */
export type CognitiveDepthLevel = 1 | 2 | 3 | 4;

export const COGNITIVE_DEPTH_LABELS: Record<CognitiveDepthLevel, string> = {
    1: 'Dasar Deskriptif',
    2: 'Analitik Awal',
    3: 'Analitik-Reflektif',
    4: 'Metakognitif Mendalam'
};

export const COGNITIVE_DEPTH_DESCRIPTIONS: Record<CognitiveDepthLevel, string> = {
    1: 'Bertanya fakta/definisi tanpa elaborasi alasan',
    2: 'Mulai membandingkan opsi atau menanyakan sebab-akibat sederhana',
    3: 'Menyusun justifikasi, mengevaluasi ketepatan, dan memperbaiki strategi',
    4: 'Menunjukkan kontrol diri berpikir: verifikasi asumsi, validasi hasil, refleksi keputusan'
};

/**
 * Transition Status (Bab 3, Tabel 30)
 */
export type TransitionStatus = 'naik_stabil' | 'fluktuatif' | 'stagnan' | 'anomali' | 'turun';

/**
 * Classification Method
 */
export type ClassificationMethod = 'rule_based' | 'llm_assisted' | 'manual_coding';

/**
 * Classifier Identity
 */
export type ClassifiedBy = 'auto' | 'manual' | 'researcher_1' | 'researcher_2' | string;

/**
 * Prompt Source
 */
export type PromptSource = 'ask_question' | 'discussion' | 'challenge';

/**
 * Revision Type
 */
export type RevisionType = 'clarification' | 'elaboration' | 'correction' | 'refinement' | 'follow_up';

/**
 * Quality Change
 */
export type QualityChange = 'improved' | 'same' | 'degraded';

/**
 * Artifact Type
 */
export type ArtifactType = 'pseudocode' | 'flowchart' | 'algorithm' | 'solution';

/**
 * Evidence Status for Triangulation
 */
export type EvidenceStatus = 'supports' | 'neutral' | 'contradicts';

/**
 * Convergence Status
 */
export type ConvergenceStatus = 'convergen' | 'partial' | 'contradictory';

/**
 * Agreement Status
 */
export type AgreementStatus = 'agreed' | 'disagreed' | 'resolved';

// ============================================
// MAIN INTERFACES
// ============================================

/**
 * Learning Session - Sesi pembelajaran longitudinal
 */
export interface LearningSession {
    id: string;
    user_id: string;
    course_id: string;

    // Session identification
    session_number: number;
    session_date: string;  // ISO date string
    session_start?: string;
    session_end?: string;

    // Session metrics
    total_prompts: number;
    total_revisions: number;

    // Dominant stage per session
    dominant_stage?: PromptStage;
    dominant_stage_score?: number;

    // Cognitive metrics
    avg_cognitive_depth?: number;
    avg_ct_score?: number;
    avg_cth_score?: number;

    // Longitudinal transition
    stage_transition?: number;  // -3 to +3
    transition_status?: TransitionStatus;

    // Session context
    topic_focus?: string;
    duration_minutes?: number;
    status?: 'active' | 'completed' | 'paused';

    // Quality gate
    is_valid_for_analysis: boolean;
    validity_note?: string;

    // Notes
    researcher_notes?: string;

    created_at: string;
    updated_at: string;
}

/**
 * Prompt Classification - Klasifikasi tahap prompt
 */
export interface PromptClassification {
    id: string;

    // Source reference
    prompt_source: PromptSource;
    prompt_id: string;

    // Context
    learning_session_id?: string;
    user_id: string;
    course_id: string;

    // Prompt data
    prompt_text: string;
    prompt_sequence?: number;

    // Classification (Bab 3, Tabel 8)
    prompt_stage: PromptStage;
    prompt_stage_score: number;  // 1-4

    // Micro markers (Bab 3, Tabel 7)
    micro_markers?: MicroMarker[];
    primary_marker?: MicroMarker;

    // Metadata
    classified_by: ClassifiedBy;
    classification_method?: ClassificationMethod;
    confidence_score?: number;  // 0-1

    // Inter-rater
    secondary_classification_id?: string;
    agreement_status?: AgreementStatus;

    // Evidence
    classification_evidence?: string;
    researcher_notes?: string;

    created_at: string;
    updated_at: string;
}

/**
 * Cognitive Indicators - Indikator CT dan Critical Thinking
 */
export interface CognitiveIndicators {
    id: string;

    // References
    prompt_classification_id: string;
    prompt_id: string;
    user_id: string;

    // CT Indicators (Bab 3, Tabel 10) - Scale 0-2
    ct_decomposition: number;
    ct_pattern_recognition: number;
    ct_abstraction: number;
    ct_algorithm_design: number;
    ct_evaluation_debugging: number;
    ct_generalization: number;
    ct_total_score: number;  // 0-12 (computed)

    // Critical Thinking Indicators (Bab 3, Tabel 9) - Scale 0-2
    cth_interpretation: number;
    cth_analysis: number;
    cth_evaluation: number;
    cth_inference: number;
    cth_explanation: number;
    cth_self_regulation: number;
    cth_total_score: number;  // 0-12 (computed)

    // Cognitive Depth (Bab 3, Tabel 28)
    cognitive_depth_level?: CognitiveDepthLevel;

    // Evidence
    evidence_text?: string;
    indicator_notes?: string;

    // Metadata
    assessed_by: string;
    assessment_method?: string;

    // Inter-rater
    secondary_assessment_id?: string;
    agreement_status?: AgreementStatus;

    created_at: string;
    updated_at: string;
}

/**
 * Prompt Revision - Tracking revisi prompt
 */
export interface PromptRevision {
    id: string;
    user_id: string;
    learning_session_id?: string;

    // Episode
    episode_id: string;
    episode_topic?: string;

    // Revision chain
    original_prompt_id: string;
    current_prompt_id: string;
    previous_prompt_id?: string;
    revision_sequence: number;

    // Analysis
    revision_type?: RevisionType;
    quality_change?: QualityChange;

    // Stage transition
    previous_stage?: PromptStage;
    current_stage?: PromptStage;
    stage_improved?: boolean;

    revision_notes?: string;
    created_at: string;
}

/**
 * Research Artifact - Artefak solusi siswa
 */
export interface ResearchArtifact {
    id: string;
    user_id: string;
    course_id: string;
    learning_session_id?: string;

    // Artifact data
    artifact_type: ArtifactType;
    artifact_title?: string;
    artifact_content: string;
    related_prompt_ids?: string[];

    // Quality assessment (Bab 3, Tabel 13)
    decomposition_quality?: number;  // 0-2
    algorithm_accuracy?: number;     // 0-2
    abstraction_quality?: number;    // 0-2
    evaluation_revision?: number;    // 0-2
    decision_justification?: number; // 0-2
    total_artifact_score?: number;   // 0-10 (computed)

    // Metadata
    assessed_by?: string;
    assessment_notes?: string;

    created_at: string;
    updated_at: string;
}

/**
 * Triangulation Record - Rekaman triangulasi
 */
export interface TriangulationRecord {
    id: string;
    user_id: string;
    learning_session_id?: string;

    // Finding
    finding_type: string;
    finding_description: string;

    // Evidence sources (Bab 3, Tabel 22)
    log_evidence?: string;
    log_evidence_status?: EvidenceStatus;

    observation_evidence?: string;
    observation_evidence_status?: EvidenceStatus;

    artifact_evidence?: string;
    artifact_evidence_status?: EvidenceStatus;

    interview_evidence?: string;
    interview_evidence_status?: EvidenceStatus;

    // Result
    convergence_status: ConvergenceStatus;
    convergence_score?: number;

    // Decision
    final_decision?: string;
    decision_rationale?: string;

    researcher_notes?: string;
    created_at: string;
    updated_at: string;
}

export interface ResearchAnalytics {
  total_sessions: number;
  total_classifications: number;
  total_indicators: number;
  total_students: number;
  stage_distribution: Record<PromptStage, number>;
  stage_heatmap: Record<PromptStage, { sessions: number; avg_ct: number; avg_cth: number }>;
  user_progression: Array<{
    user_id: string;
    sessions: number;
    avg_stage_score: number;
    stage_distribution: Record<PromptStage, number>;
    ct_progression: number[];
    cth_progression: number[];
  }>;
  inter_rater_kappa: {
    prompt_stage: number;
    ct_indicators: number;
    reliability_status: 'excellent' | 'good' | 'fair' | 'poor';
  };
}

/**
 * Inter-Rater Reliability - Reliabilitas antar-penilai
 */
export interface InterRaterReliability {
    id: string;

    // Round info
    coding_round: string;
    coding_type: string;

    // Sample
    total_units_coded: number;
    sample_size: number;
    sample_percentage?: number;

    // Raters
    rater_1_id: string;
    rater_2_id: string;

    // Metrics (Bab 3)
    observed_agreement?: number;  // Po
    expected_agreement?: number;  // Pe
    cohens_kappa?: number;        // κ

    // Threshold check
    meets_po_threshold?: boolean;    // Po >= 0.80
    meets_kappa_threshold?: boolean; // κ >= 0.70
    overall_acceptable?: boolean;

    // Actions
    disagreement_resolution?: string;
    codebook_revisions?: string;

    notes?: string;
    created_at: string;
}

// ============================================
// INPUT TYPES (for API requests)
// ============================================

export interface CreateLearningSessionInput {
    user_id: string;
    course_id: string;
    session_number: number;
    session_date: string;
    session_start?: string;
    topic_focus?: string;
    duration_minutes?: number;
    status?: 'active' | 'completed' | 'paused';
    researcher_notes?: string;
}

export interface UpdateLearningSessionInput {
    session_end?: string;
    total_prompts?: number;
    total_revisions?: number;
    dominant_stage?: PromptStage;
    dominant_stage_score?: number;
    avg_cognitive_depth?: number;
    avg_ct_score?: number;
    avg_cth_score?: number;
    stage_transition?: number;
    transition_status?: TransitionStatus;
    topic_focus?: string;
    duration_minutes?: number;
    status?: 'active' | 'completed' | 'paused';
    is_valid_for_analysis?: boolean;
    validity_note?: string;
    researcher_notes?: string;
}

export interface CreatePromptClassificationInput {
    prompt_source: PromptSource;
    prompt_id: string;
    learning_session_id?: string;
    user_id: string;
    course_id: string;
    prompt_text: string;
    prompt_sequence?: number;
    prompt_stage: PromptStage;
    micro_markers?: MicroMarker[];
    primary_marker?: MicroMarker;
    classified_by: ClassifiedBy;
    classification_method?: ClassificationMethod;
    confidence_score?: number;
    classification_evidence?: string;
    researcher_notes?: string;
}

export interface CreateCognitiveIndicatorsInput {
    prompt_classification_id: string;
    prompt_id: string;
    user_id: string;

    // CT Indicators
    ct_decomposition?: number;
    ct_pattern_recognition?: number;
    ct_abstraction?: number;
    ct_algorithm_design?: number;
    ct_evaluation_debugging?: number;
    ct_generalization?: number;

    // CTh Indicators
    cth_interpretation?: number;
    cth_analysis?: number;
    cth_evaluation?: number;
    cth_inference?: number;
    cth_explanation?: number;
    cth_self_regulation?: number;

    cognitive_depth_level?: CognitiveDepthLevel;
    evidence_text?: string;
    indicator_notes?: string;
    assessed_by: string;
    assessment_method?: string;
}

// ============================================
// RESPONSE TYPES (for API responses)
// ============================================

export interface LongitudinalDevelopmentData {
    user_id: string;
    user_name: string;
    course_id: string;
    course_title: string;
    sessions: LearningSession[];
    overall_progression: {
        start_stage: PromptStage;
        end_stage: PromptStage;
        total_sessions: number;
        valid_sessions: number;
        avg_ct_improvement: number;
        avg_cth_improvement: number;
    };
}

export interface PromptClassificationSummary {
    user_id: string;
    session_number: number;
    stage_distribution: Record<PromptStage, number>;
    marker_distribution: Record<MicroMarker, number>;
    avg_stage_score: number;
    total_prompts: number;
}

export interface CognitiveIndicatorsSummary {
    user_id: string;
    session_number: number;
    avg_ct_score: number;
    avg_cth_score: number;
    avg_depth: number;
    ct_breakdown: {
        decomposition: number;
        pattern_recognition: number;
        abstraction: number;
        algorithm_design: number;
        evaluation_debugging: number;
        generalization: number;
    };
    cth_breakdown: {
        interpretation: number;
        analysis: number;
        evaluation: number;
        inference: number;
        explanation: number;
        self_regulation: number;
    };
}

// ============================================
// API RESPONSE TYPES (generic)
// ============================================

/**
 * Paginated API response wrapper
 */
export interface ApiPaginatedResponse<T> {
    data: T[];
    total: number;
    offset: number;
    limit: number;
}

/**
 * Standard API error response
 */
export interface ApiErrorResponse {
    error: string;
    details?: string;
}

// ============================================
// EXPORT TYPES
// ============================================

export interface ResearchExportOptions {
    format: 'csv' | 'json' | 'xlsx';
    data_type: 'prompts' | 'classifications' | 'indicators' | 'longitudinal' | 'all';
    user_ids?: string[];
    course_ids?: string[];
    session_numbers?: number[];
    date_range?: {
        start: string;
        end: string;
    };
    include_raw_text: boolean;
    anonymize: boolean;
}

export interface ResearchExportResult {
    export_id: string;
    format: string;
    data_type: string;
    record_count: number;
    file_url?: string;
    data?: unknown;
    created_at: string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate prompt stage score from stage name
 */
export function getPromptStageScore(stage: PromptStage): number {
    return PROMPT_STAGE_SCORES[stage];
}

/**
 * Get prompt stage from score
 */
export function getPromptStageFromScore(score: number): PromptStage | null {
    const entry = Object.entries(PROMPT_STAGE_SCORES).find(([, s]) => s === score);
    return entry ? (entry[0] as PromptStage) : null;
}

/**
 * Calculate CT total score
 */
export function calculateCTScore(indicators: Partial<CognitiveIndicators>): number {
    return (
        (indicators.ct_decomposition || 0) +
        (indicators.ct_pattern_recognition || 0) +
        (indicators.ct_abstraction || 0) +
        (indicators.ct_algorithm_design || 0) +
        (indicators.ct_evaluation_debugging || 0) +
        (indicators.ct_generalization || 0)
    );
}

/**
 * Calculate Critical Thinking total score
 */
export function calculateCThScore(indicators: Partial<CognitiveIndicators>): number {
    return (
        (indicators.cth_interpretation || 0) +
        (indicators.cth_analysis || 0) +
        (indicators.cth_evaluation || 0) +
        (indicators.cth_inference || 0) +
        (indicators.cth_explanation || 0) +
        (indicators.cth_self_regulation || 0)
    );
}

/**
 * Determine transition status based on stage scores
 */
export function determineTransitionStatus(
    currentScore: number,
    previousScore: number,
    history: number[] = []
): TransitionStatus {
    const transition = currentScore - previousScore;

    if (transition > 0) {
        // Check if it's stable increase (maintained for 2+ sessions)
        if (history.length >= 2) {
            const recentTransitions = history.slice(-2);
            const hasFluctuation = recentTransitions.some((t, i) =>
                i > 0 && Math.sign(t) !== Math.sign(recentTransitions[i - 1])
            );
            if (hasFluctuation) return 'fluktuatif';
        }
        return 'naik_stabil';
    } else if (transition < 0) {
        return 'turun';
    } else {
        // Check for stagnation (same level for 3+ sessions)
        if (history.length >= 2 && history.slice(-2).every(t => t === 0)) {
            return 'stagnan';
        }
        return 'stagnan';
    }
}

/**
 * Calculate Cohen's Kappa
 */
export function calculateCohensKappa(
    observedAgreement: number,
    expectedAgreement: number
): number {
    if (expectedAgreement === 1) return 1;
    return (observedAgreement - expectedAgreement) / (1 - expectedAgreement);
}

/**
 * Check if reliability meets thresholds (Bab 3)
 */
export function checkReliabilityThresholds(
    observedAgreement: number,
    kappa: number
): { meetsPoThreshold: boolean; meetsKappaThreshold: boolean; overallAcceptable: boolean } {
    const meetsPoThreshold = observedAgreement >= 0.80;
    const meetsKappaThreshold = kappa >= 0.70;
    return {
        meetsPoThreshold,
        meetsKappaThreshold,
        overallAcceptable: meetsPoThreshold && meetsKappaThreshold
    };
}

/**
 * Determine convergence status for triangulation
 */
export function determineConvergenceStatus(
    evidenceStatuses: EvidenceStatus[]
): { status: ConvergenceStatus; score: number } {
    const supports = evidenceStatuses.filter(s => s === 'supports').length;
    const contradicts = evidenceStatuses.filter(s => s === 'contradicts').length;
    const total = evidenceStatuses.length;

    if (contradicts > 0) {
        return { status: 'contradictory', score: supports };
    }
    if (supports >= 2 && supports === total) {
        return { status: 'convergen', score: supports };
    }
    return { status: 'partial', score: supports };
}
