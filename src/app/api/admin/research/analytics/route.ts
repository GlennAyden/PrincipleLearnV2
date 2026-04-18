/**
 * API Route: Research Analytics
 * GET /api/admin/research/analytics
 *
 * Provides RM2/RM3 analytics from raw logs, prompt classifications,
 * cognitive indicators, auto scores, artifacts, and triangulation records.
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import { withCacheHeaders } from '@/lib/api-middleware';
import type { PromptStage, TransitionStatus } from '@/types/research';
import {
  PROMPT_STAGES,
  determineTrajectoryStatus,
  formatAnonParticipant,
  getPromptStageScore,
  getWeekBucket,
  normalizePromptStage,
} from '@/lib/research-normalizers';

interface PromptUnit {
  id: string;
  user_id: string;
  course_id?: string | null;
  learning_session_id?: string | null;
  prompt_stage: PromptStage;
  prompt_stage_score: number;
  created_at?: string | null;
  session_number?: number | null;
  source: 'manual_classification' | 'auto_prompt';
}

interface ScoreRow {
  id: string;
  user_id: string;
  course_id?: string | null;
  prompt_classification_id?: string | null;
  prompt_stage?: string | null;
  created_at?: string | null;
  cognitive_depth_level?: number | null;
  ct_total_score?: number | null;
  cth_total_score?: number | null;
  ct_decomposition?: number | null;
  ct_pattern_recognition?: number | null;
  ct_abstraction?: number | null;
  ct_algorithm_design?: number | null;
  ct_evaluation_debugging?: number | null;
  ct_generalization?: number | null;
  cth_interpretation?: number | null;
  cth_analysis?: number | null;
  cth_evaluation?: number | null;
  cth_inference?: number | null;
  cth_explanation?: number | null;
  cth_self_regulation?: number | null;
}

interface LearningSessionRow {
  id: string;
  user_id: string;
  course_id: string;
  session_number?: number | null;
  session_date?: string | null;
  dominant_stage?: string | null;
  dominant_stage_score?: number | null;
  transition_status?: string | null;
  total_prompts?: number | null;
  is_valid_for_analysis?: boolean | null;
}

interface UserProgression {
  user_id: string;
  anonymous_id: string;
  sessions: number;
  avg_stage_score: number;
  stage_distribution: Record<PromptStage, number>;
  ct_progression: number[];
  cth_progression: number[];
  trajectory_status: TransitionStatus;
  weekly_stage_path: Array<{
    week: string;
    dominant_stage: PromptStage;
    prompt_count: number;
    avg_stage_score: number;
  }>;
}

interface AnalyticsResponse {
  total_sessions: number;
  total_classifications: number;
  total_indicators: number;
  total_students: number;
  stage_distribution: Record<PromptStage, number>;
  stage_heatmap: Record<PromptStage, { sessions: number; avg_ct: number; avg_cth: number }>;
  user_progression: UserProgression[];
  data_readiness: {
    raw_units: number;
    classified_units: number;
    scored_units: number;
    triangulated_findings: number;
    artifacts: number;
    classification_rate: number;
    scoring_rate: number;
    evidence_rate: number;
  };
  trajectory_status_counts: Record<TransitionStatus, number>;
  transition_matrix: Record<PromptStage, Record<PromptStage, number>>;
  inter_rater_kappa: {
    prompt_stage: number;
    ct_indicators: number;
    reliability_status: 'excellent' | 'good' | 'fair' | 'poor';
  };
}

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

export async function GET(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const courseId = searchParams.get('course_id');
    const startDate = searchParams.get('start_date') ?? searchParams.get('startDate');
    const endDate = searchParams.get('end_date') ?? searchParams.get('endDate');

    const [
      sessionsResult,
      classificationsResult,
      indicatorsResult,
      autoPromptsResult,
      autoScoresResult,
      evidenceItemsResult,
      artifactsResult,
      triangulationResult,
    ] = await Promise.all([
      fetchSessions(userId, courseId, startDate, endDate),
      fetchClassifications(userId, courseId, startDate, endDate),
      fetchIndicators(userId, startDate, endDate),
      fetchAutoPrompts(userId, courseId, startDate, endDate),
      fetchAutoScores(userId, courseId, startDate, endDate),
      fetchCount('research_evidence_items', userId, courseId),
      fetchCount('research_artifacts', userId, courseId),
      fetchCount('triangulation_records', userId, null),
    ]);

    const sessions = sessionsResult;
    const classifications = classificationsResult;
    const classIdsForCourse = new Set(classifications.map((row) => row.id));
    const indicators = courseId
      ? indicatorsResult.filter((row) => classIdsForCourse.has(row.prompt_classification_id ?? ''))
      : indicatorsResult;
    const autoPrompts = autoPromptsResult;
    const autoScores = autoScoresResult;
    const evidenceItems = evidenceItemsResult;

    const promptUnits = buildPromptUnits(classifications, autoPrompts, sessions);
    const scores = [...indicators, ...autoScores];
    const uniqueStudents = new Set<string>([
      ...sessions.map((row) => row.user_id),
      ...promptUnits.map((row) => row.user_id),
      ...scores.map((row) => row.user_id),
    ].filter(Boolean));

    const totalSessions = countSessions(sessions, autoPrompts);
    const totalClassifications = promptUnits.length;
    const totalIndicators = indicators.length + autoScores.length;
    const stageDistribution = buildStageDistribution(promptUnits);
    const stageHeatmap = buildStageHeatmap(classifications, indicators, autoScores);
    const transitionMatrix = buildTransitionMatrix(promptUnits);
    const userProgression = buildUserProgression(promptUnits, scores, totalSessions);
    const trajectoryStatusCounts = buildTrajectoryStatusCounts(userProgression);
    const interRaterKappa = await buildInterRaterKappa();

    const dataReadiness = {
      raw_units: autoPrompts.length,
      classified_units: totalClassifications,
      scored_units: totalIndicators,
      evidence_items: evidenceItems,
      triangulated_findings: triangulationResult,
      artifacts: artifactsResult,
      valid_sessions: sessions.filter((row) => row.is_valid_for_analysis !== false).length,
      classification_rate: pct(totalClassifications, Math.max(autoPrompts.length, totalClassifications)),
      scoring_rate: pct(totalIndicators, Math.max(totalClassifications, totalIndicators)),
      evidence_rate: pct(evidenceItems + artifactsResult + triangulationResult, Math.max(1, uniqueStudents.size * 3)),
    };

    const response: AnalyticsResponse = {
      total_sessions: totalSessions,
      total_classifications: totalClassifications,
      total_indicators: totalIndicators,
      total_students: uniqueStudents.size,
      stage_distribution: stageDistribution,
      stage_heatmap: stageHeatmap,
      user_progression: userProgression,
      data_readiness: dataReadiness,
      trajectory_status_counts: trajectoryStatusCounts,
      transition_matrix: transitionMatrix,
      inter_rater_kappa: interRaterKappa,
    };

    return withCacheHeaders(NextResponse.json({ success: true, data: response }), 60);
  } catch (error) {
    console.error('Analytics error:', error);
    return NextResponse.json({ error: 'Failed to generate analytics' }, { status: 500 });
  }
}

async function fetchSessions(userId?: string | null, courseId?: string | null, startDate?: string | null, endDate?: string | null) {
  let query = adminDb
    .from('learning_sessions')
    .select('id, user_id, course_id, session_number, session_date, dominant_stage, dominant_stage_score, transition_status, total_prompts, is_valid_for_analysis');
  if (userId) query = query.eq('user_id', userId);
  if (courseId) query = query.eq('course_id', courseId);
  if (startDate) query = query.gte('session_date', startDate);
  if (endDate) query = query.lte('session_date', endDate);
  query = query.order('session_date', { ascending: true });
  const { data } = await query;
  return (data ?? []) as LearningSessionRow[];
}

async function fetchClassifications(userId?: string | null, courseId?: string | null, startDate?: string | null, endDate?: string | null) {
  let query = adminDb
    .from('prompt_classifications')
    .select('id, prompt_stage, prompt_stage_score, user_id, course_id, learning_session_id, created_at, prompt_text, prompt_source, prompt_id');
  if (userId) query = query.eq('user_id', userId);
  if (courseId) query = query.eq('course_id', courseId);
  if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
  if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
  query = query.order('created_at', { ascending: true });
  const { data } = await query;
  return (data ?? []) as Array<{
    id: string;
    prompt_stage?: string | null;
    prompt_stage_score?: number | null;
    user_id: string;
    course_id?: string | null;
    learning_session_id?: string | null;
    created_at?: string | null;
  }>;
}

async function fetchIndicators(userId?: string | null, startDate?: string | null, endDate?: string | null) {
  let query = adminDb.from('cognitive_indicators').select('*');
  if (userId) query = query.eq('user_id', userId);
  if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
  if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
  query = query.order('created_at', { ascending: true });
  const { data } = await query;
  return (data ?? []) as ScoreRow[];
}

async function fetchAutoPrompts(userId?: string | null, courseId?: string | null, startDate?: string | null, endDate?: string | null) {
  let query = adminDb
    .from('ask_question_history')
    .select('id, user_id, course_id, prompt_stage, stage_confidence, session_number, created_at, learning_session_id, question, answer');
  if (userId) query = query.eq('user_id', userId);
  if (courseId) query = query.eq('course_id', courseId);
  if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
  if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
  query = query.order('created_at', { ascending: true });
  const { data } = await query;
  return (data ?? []) as Array<{
    id: string;
    user_id: string;
    course_id?: string | null;
    prompt_stage?: string | null;
    session_number?: number | null;
    created_at?: string | null;
    learning_session_id?: string | null;
  }>;
}

async function fetchAutoScores(userId?: string | null, courseId?: string | null, startDate?: string | null, endDate?: string | null) {
  let query = adminDb.from('auto_cognitive_scores').select('*');
  if (userId) query = query.eq('user_id', userId);
  if (courseId) query = query.eq('course_id', courseId);
  if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
  if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);
  query = query.order('created_at', { ascending: true });
  const { data } = await query;
  return (data ?? []) as ScoreRow[];
}

async function fetchCount(table: string, userId?: string | null, courseId?: string | null): Promise<number> {
  try {
    let query = adminDb.from(table).select('id', { count: 'exact', head: true });
    if (userId) query = query.eq('user_id', userId);
    if (courseId) query = query.eq('course_id', courseId);
    const { count, data } = await query;
    if (typeof count === 'number') return count;
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

function buildPromptUnits(
  classifications: Awaited<ReturnType<typeof fetchClassifications>>,
  autoPrompts: Awaited<ReturnType<typeof fetchAutoPrompts>>,
  sessions: LearningSessionRow[],
): PromptUnit[] {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const manualUnits = classifications.map((row) => {
    const stage = normalizePromptStage(row.prompt_stage);
    const session = row.learning_session_id ? sessionsById.get(row.learning_session_id) : null;
    return {
      id: row.id,
      user_id: row.user_id,
      course_id: row.course_id ?? session?.course_id ?? null,
      learning_session_id: row.learning_session_id ?? null,
      prompt_stage: stage,
      prompt_stage_score: Number(row.prompt_stage_score ?? getPromptStageScore(stage)),
      created_at: row.created_at ?? session?.session_date ?? null,
      session_number: session?.session_number ?? null,
      source: 'manual_classification' as const,
    };
  });

  const autoUnits = autoPrompts
    .filter((row) => row.prompt_stage)
    .map((row) => {
      const stage = normalizePromptStage(row.prompt_stage);
      return {
        id: row.id,
        user_id: row.user_id,
        course_id: row.course_id ?? null,
        learning_session_id: row.learning_session_id ?? null,
        prompt_stage: stage,
        prompt_stage_score: getPromptStageScore(stage),
        created_at: row.created_at ?? null,
        session_number: row.session_number ?? null,
        source: 'auto_prompt' as const,
      };
    });

  return [...manualUnits, ...autoUnits];
}

function countSessions(sessions: LearningSessionRow[], autoPrompts: Awaited<ReturnType<typeof fetchAutoPrompts>>): number {
  const sessionKeys = new Set<string>();
  sessions.forEach((session) => sessionKeys.add(session.id));
  autoPrompts.forEach((prompt) => {
    const key = prompt.learning_session_id
      ?? `${prompt.user_id}_${prompt.course_id ?? 'course'}_${prompt.session_number ?? getWeekBucket(prompt.created_at)}`;
    sessionKeys.add(key);
  });
  return sessionKeys.size;
}

function buildStageDistribution(promptUnits: PromptUnit[]): Record<PromptStage, number> {
  const distribution = emptyStageRecord(0);
  promptUnits.forEach((unit) => {
    distribution[unit.prompt_stage] += 1;
  });
  return distribution;
}

function buildStageHeatmap(
  classifications: Awaited<ReturnType<typeof fetchClassifications>>,
  indicators: ScoreRow[],
  autoScores: ScoreRow[],
): Record<PromptStage, { sessions: number; avg_ct: number; avg_cth: number }> {
  const classById = new Map(classifications.map((row) => [row.id, row]));
  const stageBuckets = Object.fromEntries(PROMPT_STAGES.map((stage) => [stage, {
    sessions: new Set<string>(),
    ctScores: [] as number[],
    cthScores: [] as number[],
  }])) as Record<PromptStage, { sessions: Set<string>; ctScores: number[]; cthScores: number[] }>;

  classifications.forEach((row) => {
    const stage = normalizePromptStage(row.prompt_stage);
    if (row.learning_session_id) stageBuckets[stage].sessions.add(row.learning_session_id);
  });

  indicators.forEach((row) => {
    const classification = row.prompt_classification_id ? classById.get(row.prompt_classification_id) : null;
    if (!classification) return;
    const stage = normalizePromptStage(classification.prompt_stage);
    stageBuckets[stage].ctScores.push(totalScore(row, CT_KEYS, row.ct_total_score));
    stageBuckets[stage].cthScores.push(totalScore(row, CTH_KEYS, row.cth_total_score));
  });

  autoScores.forEach((row) => {
    if (!row.prompt_stage) return;
    const stage = normalizePromptStage(row.prompt_stage);
    stageBuckets[stage].ctScores.push(totalScore(row, CT_KEYS, row.ct_total_score));
    stageBuckets[stage].cthScores.push(totalScore(row, CTH_KEYS, row.cth_total_score));
  });

  return Object.fromEntries(PROMPT_STAGES.map((stage) => {
    const bucket = stageBuckets[stage];
    return [stage, {
      sessions: bucket.sessions.size,
      avg_ct: average(bucket.ctScores),
      avg_cth: average(bucket.cthScores),
    }];
  })) as Record<PromptStage, { sessions: number; avg_ct: number; avg_cth: number }>;
}

function buildTransitionMatrix(promptUnits: PromptUnit[]): Record<PromptStage, Record<PromptStage, number>> {
  const matrix = Object.fromEntries(PROMPT_STAGES.map((from) => [from, emptyStageRecord(0)])) as Record<PromptStage, Record<PromptStage, number>>;
  const grouped = groupBy(promptUnits, (unit) => `${unit.user_id}_${unit.course_id ?? 'course'}`);
  grouped.forEach((units) => {
    const sorted = sortPromptUnits(units);
    for (let index = 1; index < sorted.length; index += 1) {
      matrix[sorted[index - 1].prompt_stage][sorted[index].prompt_stage] += 1;
    }
  });
  return matrix;
}

function buildUserProgression(promptUnits: PromptUnit[], scores: ScoreRow[], totalSessions: number): UserProgression[] {
  const users = Array.from(new Set(promptUnits.map((unit) => unit.user_id)));
  const scoresByUser = groupBy(scores, (score) => score.user_id);

  return users.map((userId, index) => {
    const units = sortPromptUnits(promptUnits.filter((unit) => unit.user_id === userId));
    const userScores = scoresByUser.get(userId) ?? [];
    const stageDistribution = buildStageDistribution(units);
    const stageScores = units.map((unit) => unit.prompt_stage_score);
    const avgStageScore = average(stageScores);
    const weeklyStagePath = buildWeeklyStagePath(units);
    const sessionKeys = new Set(units.map((unit) => unit.learning_session_id ?? `${unit.course_id}_${unit.session_number ?? getWeekBucket(unit.created_at)}`));

    return {
      user_id: userId,
      anonymous_id: formatAnonParticipant(index),
      sessions: sessionKeys.size || Math.min(totalSessions, 1),
      avg_stage_score: avgStageScore,
      stage_distribution: stageDistribution,
      ct_progression: userScores.map((score) => totalScore(score, CT_KEYS, score.ct_total_score)),
      cth_progression: userScores.map((score) => totalScore(score, CTH_KEYS, score.cth_total_score)),
      trajectory_status: determineTrajectoryStatus(stageScores),
      weekly_stage_path: weeklyStagePath,
    };
  }).sort((a, b) => b.sessions - a.sessions).slice(0, 20);
}

function buildWeeklyStagePath(units: PromptUnit[]) {
  if (units.length === 0) return [];
  const sorted = sortPromptUnits(units);
  const firstDate = parseDate(sorted[0].created_at);
  const grouped = groupBy(sorted, (unit) => getWeekBucket(unit.created_at, firstDate));
  return Array.from(grouped.entries()).map(([week, weekUnits]) => {
    const stageCounts = emptyStageRecord(0);
    weekUnits.forEach((unit) => { stageCounts[unit.prompt_stage] += 1; });
    const dominantStage = PROMPT_STAGES
      .slice()
      .sort((a, b) => stageCounts[b] - stageCounts[a] || getPromptStageScore(b) - getPromptStageScore(a))[0];
    return {
      week,
      dominant_stage: dominantStage,
      prompt_count: weekUnits.length,
      avg_stage_score: average(weekUnits.map((unit) => unit.prompt_stage_score)),
    };
  });
}

function buildTrajectoryStatusCounts(userProgression: UserProgression[]): Record<TransitionStatus, number> {
  const counts: Record<TransitionStatus, number> = {
    naik_stabil: 0,
    stagnan: 0,
    fluktuatif: 0,
    anomali: 0,
    turun: 0,
  };
  userProgression.forEach((progression) => {
    counts[progression.trajectory_status] += 1;
  });
  return counts;
}

async function buildInterRaterKappa() {
  let promptKappa = 0;
  let ctKappa = 0;
  try {
    const { data: reliabilityData } = await adminDb
      .from('inter_rater_reliability')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10);
    const rows = (reliabilityData ?? []) as Array<{ coding_type?: string | null; cohens_kappa?: number | null }>;
    promptKappa = Number(rows.find((row) => row.coding_type === 'prompt_stage' || row.coding_type === 'prompt_classification')?.cohens_kappa ?? 0);
    ctKappa = Number(rows.find((row) => row.coding_type === 'ct_indicators' || row.coding_type === 'cognitive_indicators')?.cohens_kappa ?? 0);
  } catch (error) {
    console.warn('Inter-rater reliability query failed:', error);
  }

  const overall = (promptKappa + ctKappa) / 2;
  return {
    prompt_stage: round(promptKappa),
    ct_indicators: round(ctKappa),
    reliability_status: overall >= 0.7 ? 'excellent' as const
      : overall >= 0.5 ? 'good' as const
        : overall >= 0.3 ? 'fair' as const
          : 'poor' as const,
  };
}

function emptyStageRecord(value: number): Record<PromptStage, number> {
  return { SCP: value, SRP: value, MQP: value, REFLECTIVE: value };
}

function sortPromptUnits(units: PromptUnit[]): PromptUnit[] {
  return [...units].sort((a, b) => {
    const dateDiff = (parseDate(a.created_at)?.getTime() ?? 0) - (parseDate(b.created_at)?.getTime() ?? 0);
    if (dateDiff !== 0) return dateDiff;
    return (a.session_number ?? 0) - (b.session_number ?? 0);
  });
}

function parseDate(value: unknown): Date | null {
  const date = new Date(String(value ?? ''));
  return Number.isNaN(date.getTime()) ? null : date;
}

function groupBy<T>(rows: T[], keyFn: (row: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  rows.forEach((row) => {
    const key = keyFn(row);
    const list = map.get(key) ?? [];
    list.push(row);
    map.set(key, list);
  });
  return map;
}

function totalScore(row: ScoreRow, keys: readonly string[], explicit?: number | null): number {
  const explicitNumber = Number(explicit);
  if (Number.isFinite(explicitNumber) && explicitNumber > 0) return explicitNumber;
  return keys.reduce((sum, key) => sum + (Number((row as unknown as Record<string, unknown>)[key]) || 0), 0);
}

function average(values: number[]): number {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return 0;
  return round(valid.reduce((sum, value) => sum + value, 0) / valid.length);
}

function pct(part: number, total: number): number {
  if (!total) return 0;
  return Math.min(100, round((part / total) * 100));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}
