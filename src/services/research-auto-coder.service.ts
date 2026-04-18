import { adminDb } from '@/lib/database';
import {
  getPromptStageScore,
  isUuid,
  normalizeConfidence,
  normalizeDepth,
  normalizeMicroMarkers,
  normalizePromptStage,
  normalizeScore,
  type EvidenceSourceType,
  type NormalizedPromptStage,
} from '@/lib/research-normalizers';
import { scoreCognitive, type CognitiveScores, type InteractionSource, type ScoringInput } from '@/services/cognitive-scoring.service';
import { classifyPromptStage } from '@/services/prompt-classifier';
import { refreshResearchSessionMetrics } from '@/services/research-session.service';
import type { PromptSource, ResearchEvidenceItem } from '@/types/research';

const AUTO_CODER_ID = 'stage4_auto_coder';
const AUTO_CODER_VERSION = 'stage4.1.0';
const AUTO_SCORE_METHOD = 'llm_auto_stage4';
const CLASSIFICATION_METHOD = 'rule_based';
const TRIANGULATION_REVIEW_STATUS = 'needs_review';
const DEFAULT_RUNTIME_BUDGET_MS = 35_000;
const MIN_TRIANGULATION_REMAINING_MS = 8_000;

type EvidenceRow = ResearchEvidenceItem & {
  auto_coding_status?: string | null;
  auto_coding_run_id?: string | null;
  auto_coding_version?: string | null;
  auto_coding_model?: string | null;
  auto_coded_at?: string | null;
  auto_coding_reason?: string | null;
};

type TriangulationStatus = 'kuat' | 'sebagian' | 'bertentangan' | 'belum_muncul';
type SourceEvidenceStatus = 'supports' | 'neutral' | 'contradicts';

const CT_KEYS = [
  'ct_decomposition',
  'ct_pattern_recognition',
  'ct_abstraction',
  'ct_algorithm_design',
  'ct_evaluation_debugging',
  'ct_generalization',
] as const;

const CTH_KEYS = [
  'cth_interpretation',
  'cth_analysis',
  'cth_evaluation',
  'cth_inference',
  'cth_explanation',
  'cth_self_regulation',
] as const;

type CTKey = typeof CT_KEYS[number];
type CTHKey = typeof CTH_KEYS[number];
type IndicatorKey = CTKey | CTHKey;

const INDICATOR_DEFINITIONS: Array<{
  code: IndicatorKey;
  rmFocus: 'RM3';
  label: string;
  family: 'CT' | 'Critical Thinking';
}> = [
  { code: 'ct_decomposition', rmFocus: 'RM3', label: 'Dekomposisi', family: 'CT' },
  { code: 'ct_pattern_recognition', rmFocus: 'RM3', label: 'Pengenalan pola', family: 'CT' },
  { code: 'ct_abstraction', rmFocus: 'RM3', label: 'Abstraksi', family: 'CT' },
  { code: 'ct_algorithm_design', rmFocus: 'RM3', label: 'Perancangan algoritma', family: 'CT' },
  { code: 'ct_evaluation_debugging', rmFocus: 'RM3', label: 'Evaluasi dan debugging', family: 'CT' },
  { code: 'ct_generalization', rmFocus: 'RM3', label: 'Generalisasi solusi', family: 'CT' },
  { code: 'cth_interpretation', rmFocus: 'RM3', label: 'Interpretasi masalah', family: 'Critical Thinking' },
  { code: 'cth_analysis', rmFocus: 'RM3', label: 'Analisis argumen', family: 'Critical Thinking' },
  { code: 'cth_evaluation', rmFocus: 'RM3', label: 'Evaluasi bukti/solusi', family: 'Critical Thinking' },
  { code: 'cth_inference', rmFocus: 'RM3', label: 'Inferensi', family: 'Critical Thinking' },
  { code: 'cth_explanation', rmFocus: 'RM3', label: 'Eksplanasi keputusan', family: 'Critical Thinking' },
  { code: 'cth_self_regulation', rmFocus: 'RM3', label: 'Regulasi diri', family: 'Critical Thinking' },
];

const RM2_STAGE_DEFINITIONS: Array<{
  code: string;
  stage: NormalizedPromptStage;
  label: string;
}> = [
  { code: 'RM2_SCP', stage: 'SCP', label: 'Simple Clarification Prompt' },
  { code: 'RM2_SRP', stage: 'SRP', label: 'Structured Reformulation Prompt' },
  { code: 'RM2_MQP', stage: 'MQP', label: 'Multi-Question Prompt' },
  { code: 'RM2_REFLECTIVE', stage: 'REFLECTIVE', label: 'Reflective Prompt' },
];

export interface ResearchAutoCoderOptions {
  userId?: string;
  courseId?: string;
  learningSessionId?: string;
  limit?: number;
  runtimeBudgetMs?: number;
  dryRun?: boolean;
  includeReviewed?: boolean;
  runTriangulation?: boolean;
  requestedBy?: string | null;
  requestedByEmail?: string | null;
}

interface PromptClassificationUpsertResult {
  id: string | null;
  promptStage: NormalizedPromptStage | null;
  confidence: number | null;
  microMarkers: string[];
  action: 'created' | 'updated' | 'skipped';
  reason?: string;
}

interface CognitiveIndicatorUpsertResult {
  id: string | null;
  action: 'created' | 'updated' | 'skipped';
  reason?: string;
}

interface AutoScoreUpsertResult {
  id: string | null;
  action: 'created' | 'updated' | 'skipped';
  reason?: string;
}

export interface AutoCodedEvidenceResult {
  evidence_id: string;
  source_type: string;
  source_table?: string | null;
  source_id?: string | null;
  user_id: string;
  course_id?: string | null;
  learning_session_id?: string | null;
  prompt_classification_id?: string | null;
  cognitive_indicator_id?: string | null;
  auto_score_id?: string | null;
  prompt_stage?: NormalizedPromptStage | null;
  dominant_indicator?: string | null;
  confidence?: number | null;
  scored: boolean;
  status: 'coded' | 'skipped' | 'needs_review';
  reason: string;
}

export interface AutoTriangulationResult {
  id: string | null;
  user_id: string;
  course_id?: string | null;
  learning_session_id?: string | null;
  rm_focus: 'RM2' | 'RM3';
  indicator_code: string;
  status: TriangulationStatus;
  support_count: number;
  contradiction_count: number;
  evidence_count: number;
  source_count: number;
  action: 'created' | 'updated' | 'skipped';
  rationale: string;
}

export interface ResearchAutoCoderSummary {
  evidence_considered: number;
  evidence_coded: number;
  evidence_needs_review: number;
  evidence_skipped: number;
  classifications_created: number;
  classifications_updated: number;
  indicators_created: number;
  indicators_updated: number;
  auto_scores_created: number;
  auto_scores_updated: number;
  triangulation_created: number;
  triangulation_updated: number;
  missing_indicator_records: number;
}

export interface ResearchAutoCoderResult {
  success: boolean;
  dry_run: boolean;
  run_id: string | null;
  summary: ResearchAutoCoderSummary;
  coded_items: AutoCodedEvidenceResult[];
  triangulation_records: AutoTriangulationResult[];
  missing_indicators: AutoTriangulationResult[];
  message: string;
}

interface TriangulationGroup {
  userId: string;
  courseId: string | null;
  learningSessionId: string | null;
  rows: EvidenceRow[];
}

interface IndicatorEvidence {
  row: EvidenceRow;
  score: number;
  confidence: number | null;
  excerpt: string;
}

function emptySummary(): ResearchAutoCoderSummary {
  return {
    evidence_considered: 0,
    evidence_coded: 0,
    evidence_needs_review: 0,
    evidence_skipped: 0,
    classifications_created: 0,
    classifications_updated: 0,
    indicators_created: 0,
    indicators_updated: 0,
    auto_scores_created: 0,
    auto_scores_updated: 0,
    triangulation_created: 0,
    triangulation_updated: 0,
    missing_indicator_records: 0,
  };
}

export async function runResearchAutoCoder(options: ResearchAutoCoderOptions = {}): Promise<ResearchAutoCoderResult> {
  const normalized = normalizeOptions(options);
  const startedAt = Date.now();
  const summary = emptySummary();
  const codedItems: AutoCodedEvidenceResult[] = [];
  let triangulationRecords: AutoTriangulationResult[] = [];
  let runId: string | null = null;
  let stoppedEarly = false;

  if (!normalized.dryRun) {
    runId = await createAutoCodingRun(normalized);
  }

  try {
    const evidenceRows = await fetchEvidenceRows(normalized);
    summary.evidence_considered = evidenceRows.length;

    for (const [index, row] of evidenceRows.entries()) {
      if (shouldStopForRuntimeBudget(startedAt, normalized.runtimeBudgetMs)) {
        stoppedEarly = true;
        summary.evidence_skipped += evidenceRows.length - index;
        break;
      }

      const item = await codeEvidenceRow(row, normalized, runId);
      codedItems.push(item);

      if (item.status === 'coded') summary.evidence_coded += 1;
      if (item.status === 'needs_review') summary.evidence_needs_review += 1;
      if (item.status === 'skipped') summary.evidence_skipped += 1;

      if (item.status !== 'skipped') {
        if (item.prompt_classification_id && item.reason.includes('classification:created')) summary.classifications_created += 1;
        if (item.prompt_classification_id && item.reason.includes('classification:updated')) summary.classifications_updated += 1;
        if (item.cognitive_indicator_id && item.reason.includes('indicator:created')) summary.indicators_created += 1;
        if (item.cognitive_indicator_id && item.reason.includes('indicator:updated')) summary.indicators_updated += 1;
        if (item.auto_score_id && item.reason.includes('auto_score:created')) summary.auto_scores_created += 1;
        if (item.auto_score_id && item.reason.includes('auto_score:updated')) summary.auto_scores_updated += 1;
      }
    }

    if (normalized.runTriangulation && !stoppedEarly && hasTriangulationBudget(startedAt, normalized.runtimeBudgetMs)) {
      triangulationRecords = await generateTriangulation(normalized, runId);
      summary.triangulation_created = triangulationRecords.filter((record) => record.action === 'created').length;
      summary.triangulation_updated = triangulationRecords.filter((record) => record.action === 'updated').length;
      summary.missing_indicator_records = triangulationRecords.filter((record) => record.status === 'belum_muncul').length;
    } else if (normalized.runTriangulation) {
      stoppedEarly = true;
    }

    if (!normalized.dryRun && runId) {
      await completeAutoCodingRun(runId, 'completed', summary);
    }

    const sessionIds = Array.from(new Set([
      ...codedItems.map((item) => item.learning_session_id).filter((id): id is string => Boolean(id)),
      ...triangulationRecords.map((item) => item.learning_session_id).filter((id): id is string => Boolean(id)),
    ]));
    await Promise.all(sessionIds.map((sessionId) => refreshSessionMetrics(sessionId)));

    return {
      success: true,
      dry_run: normalized.dryRun,
      run_id: runId,
      summary,
      coded_items: codedItems,
      triangulation_records: triangulationRecords,
      missing_indicators: triangulationRecords.filter((record) => record.status === 'belum_muncul'),
      message: buildCompletionMessage(normalized.dryRun, stoppedEarly),
    };
  } catch (error) {
    if (!normalized.dryRun && runId) {
      await completeAutoCodingRun(runId, 'failed', summary, error instanceof Error ? error.message : 'Unknown error');
    }
    throw error;
  }
}

function normalizeOptions(options: ResearchAutoCoderOptions): Required<Omit<ResearchAutoCoderOptions, 'userId' | 'courseId' | 'learningSessionId' | 'requestedBy' | 'requestedByEmail'>> & Pick<ResearchAutoCoderOptions, 'userId' | 'courseId' | 'learningSessionId' | 'requestedBy' | 'requestedByEmail'> {
  return {
    userId: options.userId && isUuid(options.userId) ? options.userId : undefined,
    courseId: options.courseId && isUuid(options.courseId) ? options.courseId : undefined,
    learningSessionId: options.learningSessionId && isUuid(options.learningSessionId) ? options.learningSessionId : undefined,
    limit: Math.min(120, Math.max(1, Number(options.limit ?? 3) || 3)),
    runtimeBudgetMs: Math.min(50_000, Math.max(10_000, Number(options.runtimeBudgetMs ?? DEFAULT_RUNTIME_BUDGET_MS) || DEFAULT_RUNTIME_BUDGET_MS)),
    dryRun: Boolean(options.dryRun),
    includeReviewed: Boolean(options.includeReviewed),
    runTriangulation: options.runTriangulation !== false,
    requestedBy: options.requestedBy ?? null,
    requestedByEmail: options.requestedByEmail ?? null,
  };
}

function shouldStopForRuntimeBudget(startedAt: number, runtimeBudgetMs: number): boolean {
  return Date.now() - startedAt >= runtimeBudgetMs;
}

function hasTriangulationBudget(startedAt: number, runtimeBudgetMs: number): boolean {
  return runtimeBudgetMs - (Date.now() - startedAt) >= MIN_TRIANGULATION_REMAINING_MS;
}

function buildCompletionMessage(dryRun: boolean, stoppedEarly: boolean): string {
  const base = dryRun
    ? 'Preview auto-coding selesai tanpa menulis data.'
    : 'Auto-coding RM2/RM3 selesai dan hasilnya disimpan untuk admin.';
  return stoppedEarly
    ? `${base} Sebagian item ditunda agar request tidak melewati batas runtime; jalankan lagi untuk batch berikutnya.`
    : base;
}

async function createAutoCodingRun(options: ReturnType<typeof normalizeOptions>): Promise<string | null> {
  try {
    const { data, error } = await adminDb.from('research_auto_coding_runs').insert({
      requested_by: options.requestedBy && isUuid(options.requestedBy) ? options.requestedBy : null,
      requested_by_email: options.requestedByEmail ?? null,
      status: 'running',
      scope: {
        user_id: options.userId ?? null,
        course_id: options.courseId ?? null,
        learning_session_id: options.learningSessionId ?? null,
        limit: options.limit,
        include_reviewed: options.includeReviewed,
        run_triangulation: options.runTriangulation,
      },
      summary: {},
      started_at: new Date().toISOString(),
    });

    if (error) {
      console.warn('[ResearchAutoCoder] Run tracking unavailable:', error);
      return null;
    }

    return typeof data?.id === 'string' ? data.id : null;
  } catch (error) {
    console.warn('[ResearchAutoCoder] Failed to create run:', error);
    return null;
  }
}

async function completeAutoCodingRun(
  runId: string,
  status: 'completed' | 'failed',
  summary: ResearchAutoCoderSummary,
  errorMessage?: string,
) {
  try {
    await adminDb
      .from('research_auto_coding_runs')
      .eq('id', runId)
      .update({
        status,
        summary,
        error_message: errorMessage ?? null,
        completed_at: new Date().toISOString(),
      });
  } catch (error) {
    console.warn('[ResearchAutoCoder] Failed to update run:', error);
  }
}

async function fetchEvidenceRows(options: ReturnType<typeof normalizeOptions>): Promise<EvidenceRow[]> {
  let query = adminDb
    .from('research_evidence_items')
    .select('*')
    .neq('research_validity_status', 'excluded');

  if (options.userId) query = query.eq('user_id', options.userId);
  if (options.courseId) query = query.eq('course_id', options.courseId);
  if (options.learningSessionId) query = query.eq('learning_session_id', options.learningSessionId);
  if (!options.includeReviewed) {
    query = query
      .neq('coding_status', 'reviewed')
      .neq('coding_status', 'manual_coded');
  }

  query = query
    .order('created_at', { ascending: false })
    .limit(options.limit);

  const { data, error } = await query;
  if (error) {
    throw new Error(`Gagal memuat evidence untuk auto-coding: ${error.message ?? 'query error'}`);
  }

  const rows = Array.isArray(data) ? data as EvidenceRow[] : [];
  return rows.filter((row) => {
    if (!row.id || !row.user_id) return false;
    if (row.research_validity_status === 'excluded') return false;
    if (!options.includeReviewed && (row.coding_status === 'reviewed' || row.coding_status === 'manual_coded')) return false;
    return true;
  });
}

async function codeEvidenceRow(
  row: EvidenceRow,
  options: ReturnType<typeof normalizeOptions>,
  runId: string | null,
): Promise<AutoCodedEvidenceResult> {
  const baseResult = buildBaseItem(row);
  const text = getPrimaryStudentText(row);

  if (!text || text.trim().length < 8) {
    const reason = 'Bukti terlalu pendek untuk auto-coding yang dapat dipakai.';
    if (!options.dryRun) await markEvidenceNeedsReview(row, runId, reason);
    return { ...baseResult, status: 'needs_review', scored: false, reason };
  }

  if (!row.course_id || !isUuid(row.course_id) || !isUuid(row.user_id)) {
    const reason = 'Bukti belum memiliki user/course yang valid.';
    if (!options.dryRun) await markEvidenceNeedsReview(row, runId, reason);
    return { ...baseResult, status: 'needs_review', scored: false, reason };
  }

  const classification = await upsertPromptClassification(row, options, runId);
  const scoringInput = buildScoringInput(row);
  const existingScores = scoringInput && !options.dryRun ? await getExistingAutoScore(scoringInput) : null;
  const scores = existingScores ?? (scoringInput && !options.dryRun ? await scoreCognitive(scoringInput) : null);
  const scorePayload = scores ?? buildDryRunScore(row);
  const dominant = scorePayload ? getDominantIndicator(scorePayload) : null;

  let autoScore: AutoScoreUpsertResult = { id: null, action: 'skipped', reason: 'no_scores' };
  let indicator: CognitiveIndicatorUpsertResult = { id: null, action: 'skipped', reason: 'no_classification_or_scores' };

  if (scoringInput && scorePayload && classification.id && !options.dryRun) {
    autoScore = await upsertAutoScore(scoringInput, scorePayload);
    indicator = await upsertCognitiveIndicator(row, classification.id, scorePayload);
  }

  const confidence = maxConfidence(classification.confidence, scorePayload?.confidence ?? null, row.auto_confidence ?? null);
  const status: AutoCodedEvidenceResult['status'] = scorePayload ? 'coded' : 'needs_review';
  const reasonParts = [
    `classification:${classification.action}`,
    `indicator:${indicator.action}`,
    `auto_score:${autoScore.action}`,
    dominant ? `dominant:${dominant.code}` : 'dominant:none',
  ];

  if (!options.dryRun) {
    await updateEvidenceWithCoding(row, {
      runId,
      classificationId: classification.id,
      promptStage: classification.promptStage,
      scores: scorePayload,
      dominantIndicator: dominant?.code ?? null,
      confidence,
      status,
      reason: reasonParts.join(';'),
    });
  }

  return {
    ...baseResult,
    prompt_classification_id: classification.id,
    cognitive_indicator_id: indicator.id,
    auto_score_id: autoScore.id,
    prompt_stage: classification.promptStage,
    dominant_indicator: dominant?.code ?? null,
    confidence,
    scored: Boolean(scorePayload),
    status,
    reason: reasonParts.join(';'),
  };
}

function buildBaseItem(row: EvidenceRow): AutoCodedEvidenceResult {
  return {
    evidence_id: row.id,
    source_type: row.source_type,
    source_table: row.source_table ?? null,
    source_id: row.source_id ?? null,
    user_id: row.user_id,
    course_id: row.course_id ?? null,
    learning_session_id: row.learning_session_id ?? null,
    prompt_classification_id: row.prompt_classification_id ?? null,
    cognitive_indicator_id: null,
    auto_score_id: null,
    prompt_stage: row.prompt_stage ? normalizePromptStage(row.prompt_stage) : null,
    dominant_indicator: row.indicator_code ?? null,
    confidence: row.auto_confidence ?? null,
    scored: false,
    status: 'skipped',
    reason: 'not_processed',
  };
}

async function upsertPromptClassification(
  row: EvidenceRow,
  options: ReturnType<typeof normalizeOptions>,
  runId: string | null,
): Promise<PromptClassificationUpsertResult> {
  const promptId = row.source_id && isUuid(row.source_id) ? row.source_id : row.id;
  const promptText = getPromptText(row);

  if (!promptText || !row.course_id || !isUuid(promptId) || !isUuid(row.user_id) || !isUuid(row.course_id)) {
    return { id: null, promptStage: null, confidence: null, microMarkers: [], action: 'skipped', reason: 'invalid_prompt_context' };
  }

  const components = asRecord(asRecord(row.raw_evidence_snapshot).prompt_components);
  const classification = row.prompt_stage
    ? { stage: normalizePromptStage(row.prompt_stage), confidence: normalizeConfidence(row.auto_confidence, 0.72), microMarkers: normalizeMicroMarkers(asRecord(row.raw_evidence_snapshot).micro_markers) }
    : classifyPromptStage(promptText, {
      tujuan: stringOrUndefined(components.tujuan),
      konteks: stringOrUndefined(components.konteks),
      batasan: stringOrUndefined(components.batasan),
      reasoning: stringOrUndefined(components.reasoning),
    });

  const promptStage = normalizePromptStage(classification.stage);
  const microMarkers = normalizeMicroMarkers(classification.microMarkers);
  const payload = {
    prompt_source: evidenceSourceToPromptSource(row.source_type),
    prompt_id: promptId,
    learning_session_id: row.learning_session_id ?? null,
    user_id: row.user_id,
    course_id: row.course_id,
    prompt_text: promptText,
    prompt_sequence: row.unit_sequence ?? null,
    prompt_stage: promptStage,
    prompt_stage_score: getPromptStageScore(promptStage),
    micro_markers: microMarkers,
    primary_marker: microMarkers[0] ?? null,
    classified_by: AUTO_CODER_ID,
    classification_method: CLASSIFICATION_METHOD,
    confidence_score: normalizeConfidence(classification.confidence, 0.72),
    classification_evidence: buildClassificationEvidence(row, promptStage, microMarkers),
    researcher_notes: 'Klasifikasi otomatis tahap 4. Tinjau bila akan dipakai sebagai kutipan tesis.',
    source_snapshot: {
      evidence_id: row.id,
      source_type: row.source_type,
      source_table: row.source_table ?? null,
      source_id: row.source_id ?? null,
      run_id: runId,
      evidence_title: row.evidence_title ?? null,
      raw_evidence_snapshot: asRecord(row.raw_evidence_snapshot),
    },
    auto_stage: promptStage,
    auto_stage_confidence: normalizeConfidence(classification.confidence, 0.72),
    classification_status: 'final',
    research_validity_status: row.research_validity_status ?? 'valid',
    data_collection_week: row.data_collection_week ?? null,
  };

  if (options.dryRun) {
    return { id: null, promptStage, confidence: payload.confidence_score, microMarkers, action: 'skipped', reason: 'dry_run' };
  }

  const { data: existing } = await adminDb
    .from('prompt_classifications')
    .select('id')
    .eq('prompt_source', payload.prompt_source)
    .eq('prompt_id', payload.prompt_id)
    .eq('classified_by', AUTO_CODER_ID)
    .maybeSingle();
  const existingId = idFromRow(existing);

  if (existingId) {
    const { error } = await adminDb.from('prompt_classifications').eq('id', existingId).update(payload);
    if (error) {
      console.warn('[ResearchAutoCoder] Failed to update classification:', error);
      return { id: existingId, promptStage, confidence: payload.confidence_score, microMarkers, action: 'skipped', reason: 'update_failed' };
    }
    return { id: existingId, promptStage, confidence: payload.confidence_score, microMarkers, action: 'updated' };
  }

  const { data, error } = await adminDb.from('prompt_classifications').insert({
    ...payload,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.warn('[ResearchAutoCoder] Failed to insert classification:', error);
    return { id: null, promptStage, confidence: payload.confidence_score, microMarkers, action: 'skipped', reason: 'insert_failed' };
  }

  return { id: idFromRow(data), promptStage, confidence: payload.confidence_score, microMarkers, action: 'created' };
}

async function upsertAutoScore(input: ScoringInput, scores: CognitiveScores): Promise<AutoScoreUpsertResult> {
  const payload = {
    source: input.source,
    source_id: input.source_id,
    user_id: input.user_id,
    course_id: input.course_id,
    ct_decomposition: scores.ct_decomposition,
    ct_pattern_recognition: scores.ct_pattern_recognition,
    ct_abstraction: scores.ct_abstraction,
    ct_algorithm_design: scores.ct_algorithm_design,
    ct_evaluation_debugging: scores.ct_evaluation_debugging,
    ct_generalization: scores.ct_generalization,
    cth_interpretation: scores.cth_interpretation,
    cth_analysis: scores.cth_analysis,
    cth_evaluation: scores.cth_evaluation,
    cth_inference: scores.cth_inference,
    cth_explanation: scores.cth_explanation,
    cth_self_regulation: scores.cth_self_regulation,
    cognitive_depth_level: scores.cognitive_depth_level,
    confidence: scores.confidence,
    evidence_summary: scores.evidence_summary,
    assessment_method: AUTO_SCORE_METHOD,
    prompt_stage: input.prompt_stage ?? null,
    is_follow_up: input.is_follow_up ?? false,
  };

  try {
    const { data: existing } = await adminDb
      .from('auto_cognitive_scores')
      .select('id')
      .eq('source', input.source)
      .eq('source_id', input.source_id)
      .eq('assessment_method', AUTO_SCORE_METHOD)
      .maybeSingle();
    const existingId = idFromRow(existing);

    if (existingId) {
      const { error } = await adminDb.from('auto_cognitive_scores').eq('id', existingId).update(payload);
      if (error) return { id: existingId, action: 'skipped', reason: 'update_failed' };
      return { id: existingId, action: 'updated' };
    }

    const { data, error } = await adminDb.from('auto_cognitive_scores').insert(payload);
    if (error) return { id: null, action: 'skipped', reason: 'insert_failed' };
    return { id: idFromRow(data), action: 'created' };
  } catch (error) {
    console.warn('[ResearchAutoCoder] auto_cognitive_scores unavailable:', error);
    return { id: null, action: 'skipped', reason: 'table_unavailable' };
  }
}

async function getExistingAutoScore(input: ScoringInput): Promise<CognitiveScores | null> {
  try {
    const { data, error } = await adminDb
      .from('auto_cognitive_scores')
      .select('*')
      .eq('source', input.source)
      .eq('source_id', input.source_id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) return null;
    return scoreFromAutoScoreRow(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

function scoreFromAutoScoreRow(row: Record<string, unknown>): CognitiveScores | null {
  const scores: CognitiveScores = {
    ct_decomposition: normalizeScore(row.ct_decomposition),
    ct_pattern_recognition: normalizeScore(row.ct_pattern_recognition),
    ct_abstraction: normalizeScore(row.ct_abstraction),
    ct_algorithm_design: normalizeScore(row.ct_algorithm_design),
    ct_evaluation_debugging: normalizeScore(row.ct_evaluation_debugging),
    ct_generalization: normalizeScore(row.ct_generalization),
    ct_total: 0,
    cth_interpretation: normalizeScore(row.cth_interpretation),
    cth_analysis: normalizeScore(row.cth_analysis),
    cth_evaluation: normalizeScore(row.cth_evaluation),
    cth_inference: normalizeScore(row.cth_inference),
    cth_explanation: normalizeScore(row.cth_explanation),
    cth_self_regulation: normalizeScore(row.cth_self_regulation),
    cth_total: 0,
    cognitive_depth_level: normalizeDepth(row.cognitive_depth_level, 1),
    confidence: normalizeConfidence(row.confidence, 0.6),
    evidence_summary: typeof row.evidence_summary === 'string'
      ? row.evidence_summary
      : 'Skor otomatis diambil dari auto_cognitive_scores yang sudah ada.',
  };

  scores.ct_total = CT_KEYS.reduce((sum, key) => sum + scores[key], 0);
  scores.cth_total = CTH_KEYS.reduce((sum, key) => sum + scores[key], 0);

  const hasSignal = [...CT_KEYS, ...CTH_KEYS].some((key) => scores[key] > 0);
  return hasSignal ? scores : null;
}

async function upsertCognitiveIndicator(
  row: EvidenceRow,
  classificationId: string,
  scores: CognitiveScores,
): Promise<CognitiveIndicatorUpsertResult> {
  const promptId = row.source_id && isUuid(row.source_id) ? row.source_id : row.id;
  const payload = {
    prompt_classification_id: classificationId,
    prompt_id: promptId,
    user_id: row.user_id,
    ct_decomposition: scores.ct_decomposition,
    ct_pattern_recognition: scores.ct_pattern_recognition,
    ct_abstraction: scores.ct_abstraction,
    ct_algorithm_design: scores.ct_algorithm_design,
    ct_evaluation_debugging: scores.ct_evaluation_debugging,
    ct_generalization: scores.ct_generalization,
    cth_interpretation: scores.cth_interpretation,
    cth_analysis: scores.cth_analysis,
    cth_evaluation: scores.cth_evaluation,
    cth_inference: scores.cth_inference,
    cth_explanation: scores.cth_explanation,
    cth_self_regulation: scores.cth_self_regulation,
    cognitive_depth_level: normalizeDepth(scores.cognitive_depth_level),
    evidence_text: buildEvidenceExcerpt(row, 800),
    indicator_notes: scores.evidence_summary,
    assessed_by: AUTO_CODER_ID,
    assessment_method: AUTO_SCORE_METHOD,
    agreement_status: null,
    indicator_evidence: {
      evidence_id: row.id,
      source_type: row.source_type,
      source_table: row.source_table ?? null,
      source_id: row.source_id ?? null,
      scores: scoresToIndicatorRecord(scores),
      confidence: scores.confidence,
      summary: scores.evidence_summary,
    },
    assessment_confidence: normalizeConfidence(scores.confidence),
    research_validity_status: row.research_validity_status ?? 'valid',
  };

  const { data: existing } = await adminDb
    .from('cognitive_indicators')
    .select('id')
    .eq('prompt_classification_id', classificationId)
    .eq('assessed_by', AUTO_CODER_ID)
    .maybeSingle();
  const existingId = idFromRow(existing);

  if (existingId) {
    const { error } = await adminDb.from('cognitive_indicators').eq('id', existingId).update(payload);
    if (error) {
      console.warn('[ResearchAutoCoder] Failed to update cognitive indicator:', error);
      return { id: existingId, action: 'skipped', reason: 'update_failed' };
    }
    return { id: existingId, action: 'updated' };
  }

  const { data, error } = await adminDb.from('cognitive_indicators').insert({
    ...payload,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  if (error) {
    console.warn('[ResearchAutoCoder] Failed to insert cognitive indicator:', error);
    return { id: null, action: 'skipped', reason: 'insert_failed' };
  }

  return { id: idFromRow(data), action: 'created' };
}

async function updateEvidenceWithCoding(
  row: EvidenceRow,
  input: {
    runId: string | null;
    classificationId: string | null;
    promptStage: NormalizedPromptStage | null;
    scores: CognitiveScores | null;
    dominantIndicator: string | null;
    confidence: number | null;
    status: AutoCodedEvidenceResult['status'];
    reason: string;
  },
) {
  const metadata = {
    ...asRecord(row.metadata),
    auto_coding: {
      run_id: input.runId,
      version: AUTO_CODER_VERSION,
      coder: AUTO_CODER_ID,
      prompt_classification_id: input.classificationId,
      prompt_stage: input.promptStage,
      dominant_indicator: input.dominantIndicator,
      cognitive_scores: input.scores ? scoresToIndicatorRecord(input.scores) : null,
      cognitive_depth_level: input.scores?.cognitive_depth_level ?? null,
      confidence: input.confidence,
      evidence_summary: input.scores?.evidence_summary ?? null,
      coded_at: new Date().toISOString(),
      reason: input.reason,
    },
  };

  const evidenceStatus = input.status === 'coded' ? 'coded' : 'needs_review';
  const codingStatus = input.status === 'coded' ? 'auto_coded' : 'uncoded';

  await adminDb
    .from('research_evidence_items')
    .eq('id', row.id)
    .update({
      prompt_classification_id: input.classificationId ?? row.prompt_classification_id ?? null,
      prompt_stage: input.promptStage ?? row.prompt_stage ?? null,
      indicator_code: input.dominantIndicator ?? row.indicator_code ?? null,
      evidence_status: preserveEvidenceStatus(row.evidence_status, evidenceStatus),
      coding_status: preserveCodingStatus(row.coding_status, codingStatus),
      research_validity_status: preserveValidityStatus(row.research_validity_status, input.status === 'coded' ? 'valid' : 'low_information'),
      auto_confidence: input.confidence,
      metadata,
      coded_by: AUTO_CODER_ID,
      coded_at: new Date().toISOString(),
      auto_coding_status: input.status === 'coded' ? 'completed' : 'needs_review',
      auto_coding_run_id: input.runId,
      auto_coding_version: AUTO_CODER_VERSION,
      auto_coding_model: input.scores ? AUTO_SCORE_METHOD : CLASSIFICATION_METHOD,
      auto_coded_at: new Date().toISOString(),
      auto_coding_reason: input.reason,
    });
}

async function markEvidenceNeedsReview(row: EvidenceRow, runId: string | null, reason: string) {
  await adminDb
    .from('research_evidence_items')
    .eq('id', row.id)
    .update({
      evidence_status: preserveEvidenceStatus(row.evidence_status, 'needs_review'),
      research_validity_status: preserveValidityStatus(row.research_validity_status, 'low_information'),
      auto_coding_status: 'needs_review',
      auto_coding_run_id: runId,
      auto_coding_version: AUTO_CODER_VERSION,
      auto_coded_at: new Date().toISOString(),
      auto_coding_reason: reason,
      metadata: {
        ...asRecord(row.metadata),
        auto_coding: {
          run_id: runId,
          version: AUTO_CODER_VERSION,
          coder: AUTO_CODER_ID,
          coded_at: new Date().toISOString(),
          reason,
        },
      },
    });
}

async function generateTriangulation(
  options: ReturnType<typeof normalizeOptions>,
  runId: string | null,
): Promise<AutoTriangulationResult[]> {
  const rows = await fetchTriangulationEvidenceRows(options);
  const groups = groupEvidenceRows(rows);
  const results: AutoTriangulationResult[] = [];

  for (const group of groups) {
    for (const definition of RM2_STAGE_DEFINITIONS) {
      results.push(await upsertTriangulationRecord(buildRm2Triangulation(group, definition), options, runId));
    }

    for (const definition of INDICATOR_DEFINITIONS) {
      results.push(await upsertTriangulationRecord(buildRm3Triangulation(group, definition), options, runId));
    }
  }

  return results;
}

async function fetchTriangulationEvidenceRows(options: ReturnType<typeof normalizeOptions>): Promise<EvidenceRow[]> {
  let query = adminDb
    .from('research_evidence_items')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(Math.max(options.limit, 500));

  if (options.userId) query = query.eq('user_id', options.userId);
  if (options.courseId) query = query.eq('course_id', options.courseId);
  if (options.learningSessionId) query = query.eq('learning_session_id', options.learningSessionId);

  const { data, error } = await query;
  if (error) {
    console.warn('[ResearchAutoCoder] Failed to fetch triangulation evidence:', error);
    return [];
  }

  return (Array.isArray(data) ? data as EvidenceRow[] : [])
    .filter((row) => row.user_id && row.research_validity_status !== 'excluded' && row.evidence_status !== 'excluded');
}

function groupEvidenceRows(rows: EvidenceRow[]): TriangulationGroup[] {
  const groups = new Map<string, TriangulationGroup>();

  rows.forEach((row) => {
    const key = [
      row.user_id,
      row.course_id ?? 'no_course',
      row.learning_session_id ?? 'no_session',
    ].join(':');
    const current = groups.get(key) ?? {
      userId: row.user_id,
      courseId: row.course_id ?? null,
      learningSessionId: row.learning_session_id ?? null,
      rows: [],
    };
    current.rows.push(row);
    groups.set(key, current);
  });

  return Array.from(groups.values());
}

function buildRm2Triangulation(
  group: TriangulationGroup,
  definition: typeof RM2_STAGE_DEFINITIONS[number],
): Omit<AutoTriangulationResult, 'id' | 'action'> & { payload: Record<string, unknown> } {
  const supporting = group.rows.filter((row) => row.prompt_stage && normalizePromptStage(row.prompt_stage) === definition.stage);
  const sourceCount = countDistinctSources(supporting);
  const status: TriangulationStatus = supporting.length >= 2 || sourceCount >= 2
    ? 'kuat'
    : supporting.length === 1
      ? 'sebagian'
      : 'belum_muncul';
  const evidenceExcerpt = buildCombinedExcerpt(supporting);
  const rationale = status === 'belum_muncul'
    ? `${definition.label} belum muncul pada bukti valid dalam cakupan ini.`
    : `${definition.label} muncul pada ${supporting.length} bukti dari ${sourceCount} sumber. Status ${status} karena pola tahap prompt sudah terdeteksi otomatis dari log siswa.`;

  return buildTriangulationPayload({
    group,
    rmFocus: 'RM2',
    indicatorCode: definition.code,
    label: definition.label,
    status,
    supportCount: supporting.length,
    contradictionCount: 0,
    evidenceRows: supporting,
    rationale,
    evidenceExcerpt,
    missingReason: status === 'belum_muncul' ? rationale : null,
  });
}

function buildRm3Triangulation(
  group: TriangulationGroup,
  definition: typeof INDICATOR_DEFINITIONS[number],
): Omit<AutoTriangulationResult, 'id' | 'action'> & { payload: Record<string, unknown> } {
  const indicatorEvidence = group.rows
    .map((row) => extractIndicatorEvidence(row, definition.code))
    .filter((value): value is IndicatorEvidence => Boolean(value));
  const supporting = indicatorEvidence.filter((item) => item.score > 0);
  const contradictionCount = group.rows.filter((row) => row.triangulation_status === 'bertentangan').length;
  const sourceCount = countDistinctSources(supporting.map((item) => item.row));
  const hasStrongScore = supporting.some((item) => item.score >= 2 && (item.confidence ?? 0.5) >= 0.65);
  const status: TriangulationStatus = contradictionCount > 0 && supporting.length > 0
    ? 'bertentangan'
    : supporting.length === 0
      ? 'belum_muncul'
      : sourceCount >= 2 || (supporting.length >= 2 && hasStrongScore)
        ? 'kuat'
        : 'sebagian';

  const evidenceRows = supporting.map((item) => item.row);
  const evidenceExcerpt = supporting.length > 0
    ? supporting.slice(0, 2).map((item) => item.excerpt).filter(Boolean).join('\n\n')
    : '';
  const rationale = status === 'belum_muncul'
    ? `${definition.label} belum tampak pada 12 indikator yang dikodekan otomatis untuk cakupan ini.`
    : `${definition.label} terdeteksi pada ${supporting.length} bukti dari ${sourceCount} sumber dengan skor tertinggi ${maxScore(supporting)}. Status ${status} ditentukan dari jumlah bukti, variasi sumber, dan confidence auto-scoring.`;

  return buildTriangulationPayload({
    group,
    rmFocus: definition.rmFocus,
    indicatorCode: definition.code,
    label: `${definition.family}: ${definition.label}`,
    status,
    supportCount: supporting.length,
    contradictionCount,
    evidenceRows,
    rationale,
    evidenceExcerpt,
    missingReason: status === 'belum_muncul' ? rationale : null,
  });
}

function buildTriangulationPayload(input: {
  group: TriangulationGroup;
  rmFocus: 'RM2' | 'RM3';
  indicatorCode: string;
  label: string;
  status: TriangulationStatus;
  supportCount: number;
  contradictionCount: number;
  evidenceRows: EvidenceRow[];
  rationale: string;
  evidenceExcerpt: string;
  missingReason: string | null;
}): Omit<AutoTriangulationResult, 'id' | 'action'> & { payload: Record<string, unknown> } {
  const sourceMap = buildSourceMap(input.evidenceRows);
  const convergenceStatus = statusToConvergence(input.status);
  const evidenceIds = input.evidenceRows.map((row) => row.id).filter(Boolean);

  return {
    user_id: input.group.userId,
    course_id: input.group.courseId,
    learning_session_id: input.group.learningSessionId,
    rm_focus: input.rmFocus,
    indicator_code: input.indicatorCode,
    status: input.status,
    support_count: input.supportCount,
    contradiction_count: input.contradictionCount,
    evidence_count: input.evidenceRows.length,
    source_count: countDistinctSources(input.evidenceRows),
    rationale: input.rationale,
    payload: {
      user_id: input.group.userId,
      course_id: input.group.courseId,
      learning_session_id: input.group.learningSessionId,
      finding_type: `${input.rmFocus}:${input.indicatorCode}`,
      finding_description: `${input.label} - ${input.status}`,
      rm_focus: input.rmFocus,
      indicator_code: input.indicatorCode,
      triangulation_status: input.status,
      convergence_status: convergenceStatus,
      convergence_score: input.supportCount,
      sources: sourceMap,
      evidence_excerpt: input.evidenceExcerpt || null,
      log_evidence: sourceMap.log_prompt?.excerpt ?? null,
      log_evidence_status: sourceMap.log_prompt ? sourceStatusFromTriangulation(input.status) : null,
      observation_evidence: sourceMap.observasi_longitudinal?.excerpt ?? null,
      observation_evidence_status: sourceMap.observasi_longitudinal ? sourceStatusFromTriangulation(input.status) : null,
      artifact_evidence: sourceMap.artefak_solusi?.excerpt ?? null,
      artifact_evidence_status: sourceMap.artefak_solusi ? sourceStatusFromTriangulation(input.status) : null,
      final_decision: finalDecisionFromStatus(input.status),
      decision_rationale: input.rationale,
      researcher_notes: 'Triangulasi otomatis tahap 4. Peneliti dapat menerima, merevisi, atau menambahkan catatan manual.',
      auto_generated: true,
      generated_by: AUTO_CODER_ID,
      review_status: TRIANGULATION_REVIEW_STATUS,
      support_count: input.supportCount,
      contradiction_count: input.contradictionCount,
      missing_reason: input.missingReason,
      evidence_item_ids: evidenceIds,
    },
  };
}

async function upsertTriangulationRecord(
  record: Omit<AutoTriangulationResult, 'id' | 'action'> & { payload: Record<string, unknown> },
  options: ReturnType<typeof normalizeOptions>,
  runId: string | null,
): Promise<AutoTriangulationResult> {
  if (options.dryRun) {
    return { ...stripPayload(record), id: null, action: 'skipped' };
  }

  const payload = {
    ...record.payload,
    auto_coding_run_id: runId,
  };

  let query = adminDb
    .from('triangulation_records')
    .select('id')
    .eq('user_id', record.user_id)
    .eq('rm_focus', record.rm_focus)
    .eq('indicator_code', record.indicator_code)
    .eq('generated_by', AUTO_CODER_ID);

  query = record.course_id ? query.eq('course_id', record.course_id) : query.is('course_id', null);
  query = record.learning_session_id ? query.eq('learning_session_id', record.learning_session_id) : query.is('learning_session_id', null);

  const { data: existing } = await query.maybeSingle();
  const existingId = idFromRow(existing);

  if (existingId) {
    const { error } = await adminDb.from('triangulation_records').eq('id', existingId).update(payload);
    if (error) {
      console.warn('[ResearchAutoCoder] Failed to update triangulation:', error);
      return { ...stripPayload(record), id: existingId, action: 'skipped' };
    }
    return { ...stripPayload(record), id: existingId, action: 'updated' };
  }

  const { data, error } = await adminDb.from('triangulation_records').insert({
    ...payload,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.warn('[ResearchAutoCoder] Failed to insert triangulation:', error);
    return { ...stripPayload(record), id: null, action: 'skipped' };
  }

  return { ...stripPayload(record), id: idFromRow(data), action: 'created' };
}

function stripPayload(record: Omit<AutoTriangulationResult, 'id' | 'action'> & { payload: Record<string, unknown> }): Omit<AutoTriangulationResult, 'id' | 'action'> {
  return {
    user_id: record.user_id,
    course_id: record.course_id,
    learning_session_id: record.learning_session_id,
    rm_focus: record.rm_focus,
    indicator_code: record.indicator_code,
    status: record.status,
    support_count: record.support_count,
    contradiction_count: record.contradiction_count,
    evidence_count: record.evidence_count,
    source_count: record.source_count,
    rationale: record.rationale,
  };
}

async function refreshSessionMetrics(sessionId: string) {
  await refreshResearchSessionMetrics(sessionId);
  await refreshPromptSessionMetrics(sessionId);
  await refreshCognitiveSessionMetrics(sessionId);
}

async function refreshPromptSessionMetrics(sessionId: string) {
  try {
    const { data } = await adminDb
      .from('prompt_classifications')
      .select('prompt_stage, prompt_stage_score')
      .eq('learning_session_id', sessionId);
    const rows = Array.isArray(data) ? data as Array<{ prompt_stage?: string | null; prompt_stage_score?: number | null }> : [];
    const totalPrompts = rows.length;
    const stageCounts = new Map<string, { count: number; score: number }>();
    rows.forEach((row) => {
      if (!row.prompt_stage) return;
      const stage = normalizePromptStage(row.prompt_stage);
      const current = stageCounts.get(stage) ?? { count: 0, score: row.prompt_stage_score ?? getPromptStageScore(stage) };
      current.count += 1;
      stageCounts.set(stage, current);
    });
    const dominant = Array.from(stageCounts.entries()).sort((a, b) => b[1].count - a[1].count || b[1].score - a[1].score)[0];
    const avgScore = average(rows.map((row) => Number(row.prompt_stage_score ?? 0)).filter(Boolean));
    await adminDb.from('learning_sessions').eq('id', sessionId).update({
      total_prompts: totalPrompts,
      dominant_stage: dominant?.[0] ?? null,
      dominant_stage_score: avgScore ? Math.round(avgScore) : null,
    });
  } catch (error) {
    console.warn('[ResearchAutoCoder] Failed to refresh prompt metrics:', error);
  }
}

async function refreshCognitiveSessionMetrics(sessionId: string) {
  try {
    const { data: classifications } = await adminDb
      .from('prompt_classifications')
      .select('id')
      .eq('learning_session_id', sessionId);
    const classIds = (Array.isArray(classifications) ? classifications as Array<{ id: string }> : []).map((row) => row.id);
    if (classIds.length === 0) return;

    const { data: indicators } = await adminDb.from('cognitive_indicators').select('*').in('prompt_classification_id', classIds);
    const rows = Array.isArray(indicators) ? indicators as Array<Record<string, unknown>> : [];
    await adminDb.from('learning_sessions').eq('id', sessionId).update({
      avg_ct_score: average(rows.map((row) => total(row, CT_KEYS))),
      avg_cth_score: average(rows.map((row) => total(row, CTH_KEYS))),
      avg_cognitive_depth: average(rows.map((row) => Number(row.cognitive_depth_level ?? 0)).filter(Boolean)),
    });
  } catch (error) {
    console.warn('[ResearchAutoCoder] Failed to refresh cognitive metrics:', error);
  }
}

function buildScoringInput(row: EvidenceRow): ScoringInput | null {
  const source = evidenceSourceToInteractionSource(row.source_type);
  const sourceId = row.source_id && isUuid(row.source_id) ? row.source_id : row.id;
  const userText = getPrimaryStudentText(row);

  if (!source || !row.course_id || !isUuid(sourceId) || !isUuid(row.user_id) || !isUuid(row.course_id) || !userText) {
    return null;
  }

  return {
    source,
    user_id: row.user_id,
    course_id: row.course_id,
    source_id: sourceId,
    user_text: userText,
    prompt_or_question: getPromptText(row) || row.evidence_source_summary || row.source_type,
    ai_response: row.source_type === 'ask_question' ? row.ai_response_text ?? undefined : undefined,
    context_summary: row.evidence_source_summary ?? undefined,
    prompt_stage: row.prompt_stage ?? undefined,
    is_follow_up: Boolean(asRecord(row.metadata).is_follow_up),
  };
}

function buildDryRunScore(row: EvidenceRow): CognitiveScores | null {
  const metadataScore = asRecord(asRecord(row.metadata).auto_coding).cognitive_scores;
  const record = asRecord(metadataScore);
  const hasScore = [...CT_KEYS, ...CTH_KEYS].some((key) => Number(record[key] ?? 0) > 0);
  if (!hasScore) return null;

  const scores: CognitiveScores = {
    ct_decomposition: normalizeScore(record.ct_decomposition),
    ct_pattern_recognition: normalizeScore(record.ct_pattern_recognition),
    ct_abstraction: normalizeScore(record.ct_abstraction),
    ct_algorithm_design: normalizeScore(record.ct_algorithm_design),
    ct_evaluation_debugging: normalizeScore(record.ct_evaluation_debugging),
    ct_generalization: normalizeScore(record.ct_generalization),
    ct_total: 0,
    cth_interpretation: normalizeScore(record.cth_interpretation),
    cth_analysis: normalizeScore(record.cth_analysis),
    cth_evaluation: normalizeScore(record.cth_evaluation),
    cth_inference: normalizeScore(record.cth_inference),
    cth_explanation: normalizeScore(record.cth_explanation),
    cth_self_regulation: normalizeScore(record.cth_self_regulation),
    cth_total: 0,
    cognitive_depth_level: normalizeDepth(asRecord(row.metadata).cognitive_depth_level, 1),
    confidence: normalizeConfidence(asRecord(row.metadata).confidence, row.auto_confidence ?? 0.5),
    evidence_summary: String(asRecord(row.metadata).evidence_summary ?? 'Preview dari metadata auto-coding sebelumnya.'),
  };
  scores.ct_total = CT_KEYS.reduce((sum, key) => sum + scores[key], 0);
  scores.cth_total = CTH_KEYS.reduce((sum, key) => sum + scores[key], 0);
  return scores;
}

function extractIndicatorEvidence(row: EvidenceRow, indicator: IndicatorKey): IndicatorEvidence | null {
  const metadata = asRecord(row.metadata);
  const autoCoding = asRecord(metadata.auto_coding);
  const scores = asRecord(autoCoding.cognitive_scores);
  const score = normalizeScore(scores[indicator], 0);
  const directMatch = row.indicator_code === indicator;

  if (score <= 0 && !directMatch) return null;

  return {
    row,
    score: directMatch ? Math.max(score, 1) : score,
    confidence: normalizeConfidence(autoCoding.confidence, row.auto_confidence ?? 0.5),
    excerpt: buildEvidenceExcerpt(row, 280),
  };
}

function getPromptText(row: EvidenceRow): string {
  return firstText(row.evidence_text, row.evidence_title, row.artifact_text, row.ai_response_text);
}

function getPrimaryStudentText(row: EvidenceRow): string {
  if (row.source_type === 'ask_question') return firstText(row.evidence_text, row.artifact_text);
  if (row.source_type === 'challenge_response' || row.source_type === 'quiz_submission') {
    return firstText(row.ai_response_text, row.artifact_text, row.evidence_text);
  }
  return firstText(row.evidence_text, row.artifact_text, row.ai_response_text);
}

function buildEvidenceExcerpt(row: EvidenceRow, maxLength: number): string {
  const parts = [
    row.evidence_text ? `Bukti: ${row.evidence_text}` : '',
    row.ai_response_text ? `Respons/Jawaban: ${row.ai_response_text}` : '',
    row.artifact_text ? `Artefak: ${row.artifact_text}` : '',
  ].filter(Boolean).join('\n');
  return truncate(parts || row.evidence_title || '', maxLength);
}

function buildCombinedExcerpt(rows: EvidenceRow[]): string {
  return rows.slice(0, 2).map((row) => buildEvidenceExcerpt(row, 260)).filter(Boolean).join('\n\n');
}

function buildClassificationEvidence(row: EvidenceRow, stage: NormalizedPromptStage, markers: string[]): string {
  const markerText = markers.length > 0 ? markers.join(', ') : 'tanpa marker mikro eksplisit';
  return `Auto-coder tahap 4 mengklasifikasikan bukti ${row.source_type} sebagai ${stage} dengan marker ${markerText}.`;
}

function evidenceSourceToPromptSource(source: EvidenceSourceType): PromptSource {
  if (source === 'manual_note') return 'manual_entry';
  if (source === 'challenge_response') return 'challenge_response';
  if (source === 'quiz_submission') return 'quiz_submission';
  return source as PromptSource;
}

function evidenceSourceToInteractionSource(source: EvidenceSourceType): InteractionSource | null {
  if (source === 'ask_question') return 'ask_question';
  if (source === 'challenge_response') return 'challenge_response';
  if (source === 'quiz_submission') return 'quiz_submission';
  if (source === 'journal') return 'journal';
  if (source === 'discussion') return 'discussion';
  if (source === 'artifact') return 'challenge_response';
  return null;
}

function getDominantIndicator(scores: CognitiveScores): { code: IndicatorKey; score: number } | null {
  const candidates = INDICATOR_DEFINITIONS
    .map((definition) => ({ code: definition.code, score: scores[definition.code] }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

function scoresToIndicatorRecord(scores: CognitiveScores): Record<IndicatorKey, number> {
  return [...CT_KEYS, ...CTH_KEYS].reduce((acc, key) => {
    acc[key] = normalizeScore(scores[key]);
    return acc;
  }, {} as Record<IndicatorKey, number>);
}

function buildSourceMap(rows: EvidenceRow[]): Record<string, { count: number; status: SourceEvidenceStatus; excerpt: string; source_types: string[] } | null> {
  const buckets: Record<string, EvidenceRow[]> = {
    log_prompt: [],
    observasi_longitudinal: [],
    artefak_solusi: [],
    wawancara_manual: [],
  };

  rows.forEach((row) => {
    buckets[sourceBucket(row.source_type)].push(row);
  });

  return Object.fromEntries(
    Object.entries(buckets).map(([key, value]) => [
      key,
      value.length > 0
        ? {
          count: value.length,
          status: 'supports' as const,
          excerpt: buildCombinedExcerpt(value),
          source_types: Array.from(new Set(value.map((row) => row.source_type))),
        }
        : null,
    ]),
  );
}

function sourceBucket(source: EvidenceSourceType): 'log_prompt' | 'observasi_longitudinal' | 'artefak_solusi' | 'wawancara_manual' {
  if (source === 'ask_question') return 'log_prompt';
  if (source === 'challenge_response' || source === 'artifact') return 'artefak_solusi';
  return 'observasi_longitudinal';
}

function statusToConvergence(status: TriangulationStatus): string {
  if (status === 'kuat') return 'convergen';
  if (status === 'bertentangan') return 'contradictory';
  if (status === 'belum_muncul') return 'missing';
  return 'partial';
}

function sourceStatusFromTriangulation(status: TriangulationStatus): SourceEvidenceStatus {
  if (status === 'bertentangan') return 'contradicts';
  if (status === 'belum_muncul') return 'neutral';
  return 'supports';
}

function finalDecisionFromStatus(status: TriangulationStatus): string {
  if (status === 'kuat') return 'accepted';
  if (status === 'bertentangan') return 'revised';
  if (status === 'belum_muncul') return 'pending';
  return 'accepted_with_notes';
}

function preserveEvidenceStatus(current: unknown, next: 'coded' | 'needs_review'): string {
  if (current === 'triangulated' || current === 'excluded') return current;
  return next;
}

function preserveCodingStatus(current: unknown, next: 'auto_coded' | 'uncoded'): string {
  if (current === 'reviewed' || current === 'manual_coded') return current;
  return next;
}

function preserveValidityStatus(current: unknown, next: 'valid' | 'low_information'): string {
  if (current === 'excluded' || current === 'manual_note' || current === 'duplicate') return current;
  return next;
}

function countDistinctSources(rows: Array<EvidenceRow | IndicatorEvidence>): number {
  const sourceTypes = rows.map((row) => 'source_type' in row ? row.source_type : row.row.source_type);
  return new Set(sourceTypes).size;
}

function maxScore(items: IndicatorEvidence[]): number {
  return items.reduce((max, item) => Math.max(max, item.score), 0);
}

function maxConfidence(...values: Array<number | null | undefined>): number | null {
  const valid = values
    .map((value) => normalizeConfidence(value, Number.NaN))
    .filter((value) => Number.isFinite(value));
  if (valid.length === 0) return null;
  return Math.max(...valid);
}

function total(row: Record<string, unknown>, keys: readonly string[]): number {
  return keys.reduce((sum, key) => sum + normalizeScore(row[key]), 0);
}

function average(values: number[]): number | null {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 100) / 100;
}

function firstText(...values: Array<string | null | undefined>): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function stringOrUndefined(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === 'object' && !Array.isArray(value)) return value as Record<string, unknown>;
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

function idFromRow(value: unknown): string | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' ? id : null;
  }
  return null;
}

function truncate(value: string, maxLength: number): string {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 1).trimEnd()}...`;
}
