/**
 * API Route: Cognitive Indicators Management
 * GET /api/admin/research/indicators
 * POST /api/admin/research/indicators
 * PUT /api/admin/research/indicators
 * DELETE /api/admin/research/indicators
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { requireAdminMutation, verifyAdminFromCookie } from '@/lib/admin-auth';
import { isUuid, normalizeDepth, normalizeScore } from '@/lib/research-normalizers';

type IndicatorType = 'computational_thinking' | 'critical_thinking' | 'combined';

interface IndicatorBody {
  id?: string;
  prompt_classification_id?: string;
  classification_id?: string;
  prompt_id?: string;
  user_id?: string;
  indicator_type?: IndicatorType;
  ct_indicators?: Record<string, unknown> | null;
  critical_indicators?: Record<string, unknown> | null;
  cognitive_depth_level?: number | string | null;
  evidence_text?: string | null;
  evidence_notes?: string | null;
  indicator_notes?: string | null;
  assessed_by?: string | null;
  assessment_method?: string | null;
  agreement_status?: string | null;
}

interface CognitiveIndicatorRow {
  id: string;
  prompt_classification_id: string;
  prompt_id: string;
  user_id: string;
  ct_decomposition?: number | null;
  ct_pattern_recognition?: number | null;
  ct_abstraction?: number | null;
  ct_algorithm_design?: number | null;
  ct_evaluation_debugging?: number | null;
  ct_generalization?: number | null;
  ct_total_score?: number | null;
  cth_interpretation?: number | null;
  cth_analysis?: number | null;
  cth_evaluation?: number | null;
  cth_inference?: number | null;
  cth_explanation?: number | null;
  cth_self_regulation?: number | null;
  cth_total_score?: number | null;
  cognitive_depth_level?: number | null;
  evidence_text?: string | null;
  indicator_notes?: string | null;
  assessed_by: string;
  assessment_method?: string | null;
  agreement_status?: string | null;
  created_at: string;
  updated_at: string;
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

const CT_ALIAS: Record<string, typeof CT_KEYS[number]> = {
  decomposition: 'ct_decomposition',
  pattern_recognition: 'ct_pattern_recognition',
  abstraction: 'ct_abstraction',
  algorithm_design: 'ct_algorithm_design',
  evaluation_debugging: 'ct_evaluation_debugging',
  generalization: 'ct_generalization',
};

const CTH_ALIAS: Record<string, typeof CTH_KEYS[number]> = {
  interpretation: 'cth_interpretation',
  analysis: 'cth_analysis',
  evaluation: 'cth_evaluation',
  inference: 'cth_inference',
  explanation: 'cth_explanation',
  self_regulation: 'cth_self_regulation',
};

export async function GET(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const classificationId = searchParams.get('prompt_classification_id') ?? searchParams.get('classification_id');
    const indicatorType = normalizeIndicatorType(searchParams.get('indicator_type') ?? searchParams.get('type'));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10) || 100));

    if (userId && !isUuid(userId)) return NextResponse.json({ error: 'Invalid user_id format' }, { status: 400 });
    if (classificationId && !isUuid(classificationId)) return NextResponse.json({ error: 'Invalid classification_id format' }, { status: 400 });

    let query = adminDb.from('cognitive_indicators').select('*');
    if (userId) query = query.eq('user_id', userId);
    if (classificationId) query = query.eq('prompt_classification_id', classificationId);
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: 'Failed to fetch indicators' }, { status: 500 });

    let rows = (await enrichRows((data ?? []) as CognitiveIndicatorRow[])) as Array<Record<string, unknown>>;
    if (indicatorType && indicatorType !== 'combined') {
      rows = rows.map((row) => projectType(row as ReturnType<typeof toClientRow>, indicatorType) as Record<string, unknown>);
    }

    let countQuery = adminDb.from('cognitive_indicators').select('id');
    if (userId) countQuery = countQuery.eq('user_id', userId);
    if (classificationId) countQuery = countQuery.eq('prompt_classification_id', classificationId);
    const { data: countData } = await countQuery;
    const total = Array.isArray(countData) ? countData.length : rows.length;

    return NextResponse.json({ success: true, data: rows, total, offset, limit });
  } catch (error) {
    console.error('Error in GET /api/admin/research/indicators:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = requireAdminMutation(request);
    if (guard) return guard;

    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as IndicatorBody;
    const payload = await buildPayload(body, admin.email ?? 'admin');
    if (isPayloadError(payload)) return NextResponse.json({ error: payload.error }, { status: payload.status });

    const { data: existing } = await adminDb
      .from('cognitive_indicators')
      .select('id')
      .eq('prompt_classification_id', payload.prompt_classification_id as string)
      .eq('assessed_by', payload.assessed_by as string)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'Assessment already exists for this classification by this assessor.' }, { status: 409 });
    }

    const { data, error } = await adminDb.from('cognitive_indicators').insert(payload);
    if (error) return NextResponse.json({ error: 'Failed to create indicator assessment' }, { status: 500 });

    await updateSessionMetrics(payload.prompt_classification_id as string);
    return NextResponse.json({ success: true, data: toClientRow(((data as CognitiveIndicatorRow) ?? payload) as unknown as Record<string, unknown>) }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/admin/research/indicators:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const guard = requireAdminMutation(request);
    if (guard) return guard;

    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const body = await request.json() as IndicatorBody;
    const id = body.id ?? searchParams.get('id') ?? undefined;
    if (!id || !isUuid(id)) return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });

    const { data: existing } = await adminDb
      .from('cognitive_indicators')
      .select('id, prompt_classification_id')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Indicator assessment not found' }, { status: 404 });

    const payload = await buildUpdatePayload(body, admin.email ?? 'admin');
    if (isPayloadError(payload)) return NextResponse.json({ error: payload.error }, { status: payload.status });

    const { data, error } = await adminDb.from('cognitive_indicators').eq('id', id).update(payload);
    if (error) return NextResponse.json({ error: 'Failed to update indicator assessment' }, { status: 500 });

    const classificationId = (payload.prompt_classification_id as string | undefined)
      ?? (existing as { prompt_classification_id?: string | null }).prompt_classification_id;
    if (classificationId) await updateSessionMetrics(classificationId);
    const row = Array.isArray(data) ? data[0] : data;

    return NextResponse.json({ success: true, data: toClientRow(((row as CognitiveIndicatorRow) ?? payload) as unknown as Record<string, unknown>) });
  } catch (error) {
    console.error('Error in PUT /api/admin/research/indicators:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const guard = requireAdminMutation(request);
    if (guard) return guard;

    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id || !isUuid(id)) return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });

    const { data: existing } = await adminDb
      .from('cognitive_indicators')
      .select('id, prompt_classification_id')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Indicator assessment not found' }, { status: 404 });

    const { error } = await adminDb.from('cognitive_indicators').eq('id', id).delete();
    if (error) return NextResponse.json({ error: 'Failed to delete indicator assessment' }, { status: 500 });

    const classificationId = (existing as { prompt_classification_id?: string | null }).prompt_classification_id;
    if (classificationId) await updateSessionMetrics(classificationId);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error in DELETE /api/admin/research/indicators:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function buildPayload(body: IndicatorBody, adminEmail: string): Promise<Record<string, unknown> | { error: string; status: number }> {
  const classificationId = body.prompt_classification_id ?? body.classification_id;
  if (!classificationId || !isUuid(classificationId)) return { error: 'Missing required field: classification_id', status: 400 };
  const invalidScore = findInvalidScore(body);
  if (invalidScore) return { error: `Invalid indicator score for ${invalidScore}. Use 0, 1, or 2.`, status: 400 };
  const classification = await getClassification(classificationId);
  if (!classification) return { error: 'Prompt classification not found', status: 404 };

  return {
    prompt_classification_id: classification.id,
    prompt_id: body.prompt_id && isUuid(body.prompt_id) ? body.prompt_id : classification.prompt_id,
    user_id: body.user_id && isUuid(body.user_id) ? body.user_id : classification.user_id,
    ...extractScores(body),
    cognitive_depth_level: normalizeDepth(body.cognitive_depth_level, inferDepth(body)),
    evidence_text: body.evidence_text ?? body.evidence_notes ?? null,
    indicator_notes: body.indicator_notes ?? body.evidence_notes ?? null,
    assessed_by: body.assessed_by?.trim() || adminEmail || 'admin',
    assessment_method: body.assessment_method || 'manual_rubric',
    agreement_status: body.agreement_status ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function buildUpdatePayload(body: IndicatorBody, adminEmail: string): Promise<Record<string, unknown> | { error: string; status: number }> {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
  const invalidScore = findInvalidScore(body);
  if (invalidScore) return { error: `Invalid indicator score for ${invalidScore}. Use 0, 1, or 2.`, status: 400 };
  const classificationId = body.prompt_classification_id ?? body.classification_id;
  if (classificationId !== undefined) {
    if (!classificationId || !isUuid(classificationId)) return { error: 'Invalid classification_id', status: 400 };
    const classification = await getClassification(classificationId);
    if (!classification) return { error: 'Prompt classification not found', status: 404 };
    payload.prompt_classification_id = classification.id;
    payload.prompt_id = classification.prompt_id;
    payload.user_id = classification.user_id;
  }
  Object.assign(payload, extractScores(body));
  if (body.cognitive_depth_level !== undefined) payload.cognitive_depth_level = normalizeDepth(body.cognitive_depth_level);
  if (body.evidence_text !== undefined || body.evidence_notes !== undefined) payload.evidence_text = body.evidence_text ?? body.evidence_notes ?? null;
  if (body.indicator_notes !== undefined || body.evidence_notes !== undefined) payload.indicator_notes = body.indicator_notes ?? body.evidence_notes ?? null;
  if (body.assessed_by !== undefined) payload.assessed_by = body.assessed_by?.trim() || adminEmail || 'admin';
  if (body.assessment_method !== undefined) payload.assessment_method = body.assessment_method || 'manual_rubric';
  if (body.agreement_status !== undefined) payload.agreement_status = body.agreement_status;
  return payload;
}

function extractScores(body: IndicatorBody): Record<string, number> {
  const scores: Record<string, number> = {};
  const type = normalizeIndicatorType(body.indicator_type);
  const includeCT = !type || type === 'combined' || type === 'computational_thinking' || body.ct_indicators !== undefined;
  const includeCTh = !type || type === 'combined' || type === 'critical_thinking' || body.critical_indicators !== undefined;

  if (includeCT) {
    Object.entries(CT_ALIAS).forEach(([alias, key]) => {
      scores[key] = normalizeScore(body.ct_indicators?.[alias] ?? body.ct_indicators?.[key] ?? (body as unknown as Record<string, unknown>)[key]);
    });
  }
  if (includeCTh) {
    Object.entries(CTH_ALIAS).forEach(([alias, key]) => {
      scores[key] = normalizeScore(body.critical_indicators?.[alias] ?? body.critical_indicators?.[key] ?? (body as unknown as Record<string, unknown>)[key]);
    });
  }
  return scores;
}

async function getClassification(classificationId: string) {
  const { data } = await adminDb
    .from('prompt_classifications')
    .select('id, prompt_id, user_id, prompt_text, prompt_stage, learning_session_id')
    .eq('id', classificationId)
    .maybeSingle();
  return data as { id: string; prompt_id: string; user_id: string; learning_session_id?: string | null } | null;
}

async function enrichRows(rows: CognitiveIndicatorRow[]) {
  if (rows.length === 0) return [];
  const classificationIds = Array.from(new Set(rows.map((row) => row.prompt_classification_id).filter(Boolean)));
  const { data: classifications } = classificationIds.length > 0
    ? await adminDb.from('prompt_classifications').select('id, prompt_text, prompt_stage, learning_session_id').in('id', classificationIds)
    : { data: [] };
  const classRows = (classifications ?? []) as Array<{ id: string; prompt_text?: string | null; prompt_stage?: string | null; learning_session_id?: string | null }>;
  const sessionIds = Array.from(new Set(classRows.map((row) => row.learning_session_id).filter((id): id is string => Boolean(id))));
  const { data: sessions } = sessionIds.length > 0
    ? await adminDb.from('learning_sessions').select('id, session_number, user_id, course_id').in('id', sessionIds)
    : { data: [] };
  const sessionRows = (sessions ?? []) as Array<{ id: string; session_number?: number | null; user_id: string; course_id: string }>;
  const userIds = Array.from(new Set(sessionRows.map((session) => session.user_id)));
  const [{ data: users }] = await Promise.all([
    userIds.length > 0 ? adminDb.from('users').select('id, name, email').in('id', userIds) : Promise.resolve({ data: [] }),
  ]);
  const usersById = new Map((users ?? []).map((user: { id: string; name?: string | null; email?: string | null }) => [user.id, user]));
  const sessionsById = new Map(sessionRows.map((session) => [session.id, {
    session_number: session.session_number ?? null,
    users: usersById.get(session.user_id) ?? null,
  }]));
  const classesById = new Map(classRows.map((classification) => [classification.id, {
    prompt_text: classification.prompt_text ?? null,
    prompt_stage: classification.prompt_stage ?? null,
    learning_sessions: classification.learning_session_id ? sessionsById.get(classification.learning_session_id) ?? null : null,
  }]));

  return rows.map((row) => toClientRow({
    ...row,
    prompt_classifications: classesById.get(row.prompt_classification_id) ?? null,
  }));
}

function toClientRow(row: Record<string, unknown>) {
  const normalized = row as unknown as CognitiveIndicatorRow;
  return {
    ...normalized,
    classification_id: normalized.prompt_classification_id,
    indicator_type: 'combined' as IndicatorType,
    ct_total_score: Number(normalized.ct_total_score ?? total(normalized as unknown as Record<string, unknown>, CT_KEYS)),
    cth_total_score: Number(normalized.cth_total_score ?? total(normalized as unknown as Record<string, unknown>, CTH_KEYS)),
    ct_indicators: {
      decomposition: normalizeScore(normalized.ct_decomposition),
      pattern_recognition: normalizeScore(normalized.ct_pattern_recognition),
      abstraction: normalizeScore(normalized.ct_abstraction),
      algorithm_design: normalizeScore(normalized.ct_algorithm_design),
      evaluation_debugging: normalizeScore(normalized.ct_evaluation_debugging),
      generalization: normalizeScore(normalized.ct_generalization),
    },
    critical_indicators: {
      interpretation: normalizeScore(normalized.cth_interpretation),
      analysis: normalizeScore(normalized.cth_analysis),
      evaluation: normalizeScore(normalized.cth_evaluation),
      inference: normalizeScore(normalized.cth_inference),
      explanation: normalizeScore(normalized.cth_explanation),
      self_regulation: normalizeScore(normalized.cth_self_regulation),
    },
    evidence_notes: normalized.evidence_text ?? normalized.indicator_notes ?? null,
    assessment_date: normalized.created_at,
  };
}

function projectType(row: ReturnType<typeof toClientRow>, type: Exclude<IndicatorType, 'combined'>) {
  if (type === 'computational_thinking') return { ...row, indicator_type: type, critical_indicators: null };
  return { ...row, indicator_type: type, ct_indicators: null };
}

async function updateSessionMetrics(classificationId: string) {
  try {
    const { data: classification } = await adminDb
      .from('prompt_classifications')
      .select('learning_session_id')
      .eq('id', classificationId)
      .maybeSingle();
    const sessionId = (classification as { learning_session_id?: string | null } | null)?.learning_session_id;
    if (!sessionId) return;

    const { data: classifications } = await adminDb.from('prompt_classifications').select('id').eq('learning_session_id', sessionId);
    const classIds = ((classifications ?? []) as Array<{ id: string }>).map((row) => row.id);
    if (classIds.length === 0) return;

    const { data: indicators } = await adminDb.from('cognitive_indicators').select('*').in('prompt_classification_id', classIds);
    const rows = (indicators ?? []) as CognitiveIndicatorRow[];
    await adminDb.from('learning_sessions').eq('id', sessionId).update({
      avg_ct_score: average(rows.map((row) => Number(row.ct_total_score ?? total(row as unknown as Record<string, unknown>, CT_KEYS)))),
      avg_cth_score: average(rows.map((row) => Number(row.cth_total_score ?? total(row as unknown as Record<string, unknown>, CTH_KEYS)))),
      avg_cognitive_depth: average(rows.map((row) => Number(row.cognitive_depth_level ?? 0)).filter(Boolean)),
    });
  } catch (error) {
    console.error('Error updating session cognitive metrics:', error);
  }
}

function normalizeIndicatorType(value: unknown): IndicatorType | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'ct' || raw === 'computational' || raw === 'computational_thinking') return 'computational_thinking';
  if (raw === 'critical' || raw === 'critical_thinking' || raw === 'crt' || raw === 'cth') return 'critical_thinking';
  if (raw === 'combined' || raw === 'all') return 'combined';
  return null;
}

function inferDepth(body: IndicatorBody): 1 | 2 | 3 | 4 {
  const score = Object.values(extractScores(body)).reduce((sum, value) => sum + value, 0);
  if (score >= 18) return 4;
  if (score >= 10) return 3;
  if (score >= 4) return 2;
  return 1;
}

function findInvalidScore(body: IndicatorBody): string | null {
  const candidates: Array<[string, unknown]> = [];
  CT_KEYS.forEach((key) => candidates.push([key, (body as unknown as Record<string, unknown>)[key]]));
  CTH_KEYS.forEach((key) => candidates.push([key, (body as unknown as Record<string, unknown>)[key]]));
  Object.entries(CT_ALIAS).forEach(([alias, key]) => candidates.push([alias, body.ct_indicators?.[alias] ?? body.ct_indicators?.[key]]));
  Object.entries(CTH_ALIAS).forEach(([alias, key]) => candidates.push([alias, body.critical_indicators?.[alias] ?? body.critical_indicators?.[key]]));

  for (const [key, value] of candidates) {
    if (value === undefined || value === null || value === '') continue;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || parsed > 2) return key;
  }
  return null;
}

function total(row: Record<string, unknown>, keys: readonly string[]): number {
  return keys.reduce((sum, key) => sum + normalizeScore(row[key]), 0);
}

function average(values: number[]): number | null {
  const valid = values.filter((value) => Number.isFinite(value));
  if (valid.length === 0) return null;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 100) / 100;
}

function isPayloadError(value: Record<string, unknown> | { error: string; status: number }): value is { error: string; status: number } {
  return typeof (value as { error?: unknown }).error === 'string' && typeof (value as { status?: unknown }).status === 'number';
}
