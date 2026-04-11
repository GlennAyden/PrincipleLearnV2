/**
 * Cognitive Scoring Types
 * PrincipleLearn V3 — Unified CT/CrT measurement across all interaction points
 */

// ── Source types ──

export type InteractionSource =
  | 'ask_question'
  | 'challenge_response'
  | 'quiz_submission'
  | 'journal'
  | 'discussion';

// ── Auto-scored record (from auto_cognitive_scores table) ──

export interface AutoCognitiveScore {
  id: string;
  source: InteractionSource;
  source_id: string;
  user_id: string;
  course_id: string;

  // CT indicators (0-2 each)
  ct_decomposition: number;
  ct_pattern_recognition: number;
  ct_abstraction: number;
  ct_algorithm_design: number;
  ct_evaluation_debugging: number;
  ct_generalization: number;
  ct_total_score: number; // 0-12, DB generated

  // CrT indicators (0-2 each)
  cth_interpretation: number;
  cth_analysis: number;
  cth_evaluation: number;
  cth_inference: number;
  cth_explanation: number;
  cth_self_regulation: number;
  cth_total_score: number; // 0-12, DB generated

  // Meta
  cognitive_depth_level: 1 | 2 | 3 | 4;
  confidence: number;
  evidence_summary: string;
  assessment_method: string;
  prompt_stage: string | null;
  is_follow_up: boolean;
  created_at: string;
}

// ── Aggregated summary for admin views ──

export interface SourceSummary {
  count: number;
  avg_ct: number;
  avg_crt: number;
  avg_depth: number;
}

export interface IndicatorBreakdown {
  ct_decomposition: number;
  ct_pattern_recognition: number;
  ct_abstraction: number;
  ct_algorithm_design: number;
  ct_evaluation_debugging: number;
  ct_generalization: number;
  cth_interpretation: number;
  cth_analysis: number;
  cth_evaluation: number;
  cth_inference: number;
  cth_explanation: number;
  cth_self_regulation: number;
}

export interface ProgressionPoint {
  date: string;
  ct_total: number;
  crt_total: number;
  source: InteractionSource;
}

export interface AutoScoreSummary {
  by_source: Partial<Record<InteractionSource, SourceSummary>>;
  overall: {
    total_count: number;
    avg_ct: number;
    avg_crt: number;
    indicator_breakdown: IndicatorBreakdown;
  };
  progression: ProgressionPoint[];
  follow_up_comparison?: {
    follow_up_count: number;
    follow_up_avg_crt: number;
    non_follow_up_count: number;
    non_follow_up_avg_crt: number;
  };
  stage_correlation?: Array<{
    stage: string;
    count: number;
    avg_ct: number;
    avg_crt: number;
    avg_depth: number;
  }>;
}
