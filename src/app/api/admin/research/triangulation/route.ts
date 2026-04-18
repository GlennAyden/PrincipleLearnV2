/**
 * API Route: Triangulation Records
 * GET /api/admin/research/triangulation - List RM2/RM3 triangulation findings
 * POST /api/admin/research/triangulation - Create finding
 * PUT /api/admin/research/triangulation - Update finding
 * DELETE /api/admin/research/triangulation - Delete finding
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import { isUuid } from '@/lib/research-normalizers';

type ThesisTriangulationStatus = 'kuat' | 'sebagian' | 'bertentangan' | 'belum_muncul';
type SourceStatus = 'supports' | 'neutral' | 'contradicts';

interface TriangulationBody {
  id?: string;
  user_id?: string;
  course_id?: string | null;
  learning_session_id?: string | null;
  prompt_classification_id?: string | null;
  rm_focus?: 'RM2' | 'RM3' | 'RM2_RM3' | string;
  indicator_code?: string | null;
  finding_type?: string | null;
  finding_description?: string | null;
  status?: ThesisTriangulationStatus | string | null;
  sources?: string[] | string | null;
  rationale?: string | null;
  evidence_excerpt?: string | null;
  log_evidence?: string | null;
  log_evidence_status?: SourceStatus | string | null;
  observation_evidence?: string | null;
  observation_evidence_status?: SourceStatus | string | null;
  artifact_evidence?: string | null;
  artifact_evidence_status?: SourceStatus | string | null;
  interview_evidence?: string | null;
  interview_evidence_status?: SourceStatus | string | null;
  final_decision?: string | null;
  decision_rationale?: string | null;
  researcher_notes?: string | null;
  auto_generated?: boolean | null;
  generated_by?: string | null;
  review_status?: string | null;
}

interface TriangulationRow {
  id: string;
  user_id: string;
  course_id?: string | null;
  learning_session_id?: string | null;
  prompt_classification_id?: string | null;
  finding_type: string;
  finding_description: string;
  log_evidence?: string | null;
  log_evidence_status?: string | null;
  observation_evidence?: string | null;
  observation_evidence_status?: string | null;
  artifact_evidence?: string | null;
  artifact_evidence_status?: string | null;
  interview_evidence?: string | null;
  interview_evidence_status?: string | null;
  convergence_status?: string | null;
  convergence_score?: number | null;
  rm_focus?: string | null;
  indicator_code?: string | null;
  triangulation_status?: string | null;
  sources?: Record<string, unknown> | null;
  evidence_excerpt?: string | null;
  final_decision?: string | null;
  decision_rationale?: string | null;
  researcher_notes?: string | null;
  auto_generated?: boolean | null;
  generated_by?: string | null;
  review_status?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const status = searchParams.get('status');
    const rmFocus = searchParams.get('rm_focus');
    const indicatorCode = searchParams.get('indicator_code');
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10) || 100));

    let query = adminDb.from('triangulation_records').select('*');
    if (userId) query = query.eq('user_id', userId);
    if (rmFocus) query = query.eq('rm_focus', rmFocus);
    if (indicatorCode) query = query.eq('indicator_code', indicatorCode);
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) {
      console.warn('Triangulation table unavailable or query failed:', error);
      return NextResponse.json({
        success: true,
        summary: emptySummary(),
        records: [],
        data: [],
        total: 0,
        message: 'Triangulation table is not available yet.',
      });
    }

    const records = (await enrichRecords((data ?? []) as TriangulationRow[]))
      .filter((record) => !status || record.status === normalizeStatus(status));
    const summary = buildSummary(records);

    return NextResponse.json({ success: true, summary, records, data: records, total: records.length, offset, limit });
  } catch (error) {
    console.error('Error in GET /api/admin/research/triangulation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as TriangulationBody;
    const payload = buildPayload(body);
    if (isPayloadError(payload)) return NextResponse.json({ error: payload.error }, { status: payload.status });

    const { data, error } = await adminDb.from('triangulation_records').insert(payload);
    if (error) {
      console.error('Error creating triangulation record:', error);
      return NextResponse.json({ error: 'Failed to create triangulation record' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: toClientRecord((data as TriangulationRow) ?? payload),
      message: 'Triangulation record created successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/admin/research/triangulation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const body = await request.json() as TriangulationBody;
    const id = body.id ?? searchParams.get('id') ?? undefined;
    if (!id || !isUuid(id)) return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });

    const payload = buildPayload(body, true);
    if (isPayloadError(payload)) return NextResponse.json({ error: payload.error }, { status: payload.status });

    const { data, error } = await adminDb.from('triangulation_records').eq('id', id).update(payload);
    if (error) return NextResponse.json({ error: 'Failed to update triangulation record' }, { status: 500 });

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json({ success: true, data: toClientRecord((row as TriangulationRow) ?? payload) });
  } catch (error) {
    console.error('Error in PUT /api/admin/research/triangulation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    if (!id || !isUuid(id)) return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });

    const { error } = await adminDb.from('triangulation_records').eq('id', id).delete();
    if (error) return NextResponse.json({ error: 'Failed to delete triangulation record' }, { status: 500 });

    return NextResponse.json({ success: true, message: 'Triangulation record deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/admin/research/triangulation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function buildPayload(body: TriangulationBody, partial = false): Record<string, unknown> | { error: string; status: number } {
  const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (!partial || body.user_id !== undefined) {
    if (!body.user_id || !isUuid(body.user_id)) return { error: 'Missing or invalid user_id', status: 400 };
    payload.user_id = body.user_id;
  }

  if (body.course_id !== undefined) {
    if (body.course_id && !isUuid(body.course_id)) return { error: 'Invalid course_id', status: 400 };
    payload.course_id = body.course_id || null;
  }

  if (body.learning_session_id !== undefined) {
    if (body.learning_session_id && !isUuid(body.learning_session_id)) return { error: 'Invalid learning_session_id', status: 400 };
    payload.learning_session_id = body.learning_session_id || null;
  }
  if (body.prompt_classification_id !== undefined) {
    if (body.prompt_classification_id && !isUuid(body.prompt_classification_id)) return { error: 'Invalid prompt_classification_id', status: 400 };
    payload.prompt_classification_id = body.prompt_classification_id || null;
  }

  const status = normalizeStatus(body.status);
  const convergence = statusToConvergence(status);
  const indicatorCode = body.indicator_code?.trim();
  const rmFocus = body.rm_focus?.trim() || inferRmFocus(indicatorCode);
  const findingType = body.finding_type?.trim()
    || [rmFocus, indicatorCode || 'triangulasi'].filter(Boolean).join(':');

  if (!partial || body.finding_type !== undefined || body.indicator_code !== undefined || body.rm_focus !== undefined) {
    payload.finding_type = findingType;
    payload.rm_focus = rmFocus;
    payload.indicator_code = indicatorCode || null;
  }

  if (!partial || body.finding_description !== undefined || body.evidence_excerpt !== undefined) {
    payload.finding_description = body.finding_description?.trim()
      || body.evidence_excerpt?.trim()
      || `Temuan ${rmFocus} dengan status ${status}.`;
  }
  if (body.evidence_excerpt !== undefined) payload.evidence_excerpt = body.evidence_excerpt ?? null;

  const sourceMap = normalizeSources(body.sources);
  payload.sources = sourceMap;

  if (body.log_evidence !== undefined || body.evidence_excerpt !== undefined || Boolean(sourceMap.log_prompt)) {
    payload.log_evidence = body.log_evidence ?? body.evidence_excerpt ?? null;
    payload.log_evidence_status = normalizeSourceStatus(body.log_evidence_status, status);
  }
  if (body.observation_evidence !== undefined || Boolean(sourceMap.observasi_longitudinal)) {
    payload.observation_evidence = body.observation_evidence ?? body.evidence_excerpt ?? null;
    payload.observation_evidence_status = normalizeSourceStatus(body.observation_evidence_status, status);
  }
  if (body.artifact_evidence !== undefined || Boolean(sourceMap.artefak_solusi)) {
    payload.artifact_evidence = body.artifact_evidence ?? body.evidence_excerpt ?? null;
    payload.artifact_evidence_status = normalizeSourceStatus(body.artifact_evidence_status, status);
  }
  if (body.interview_evidence !== undefined) {
    payload.interview_evidence = body.interview_evidence;
    payload.interview_evidence_status = normalizeSourceStatus(body.interview_evidence_status, status);
  }

  if (!partial || body.status !== undefined) {
    payload.convergence_status = convergence;
    payload.convergence_score = scoreConvergence(payload);
    payload.triangulation_status = status;
    payload.final_decision = body.final_decision ?? finalDecisionFromStatus(status);
  }
  if (body.decision_rationale !== undefined || body.rationale !== undefined) {
    payload.decision_rationale = body.decision_rationale ?? body.rationale ?? null;
  }
  if (body.researcher_notes !== undefined) payload.researcher_notes = body.researcher_notes;
  if (body.auto_generated !== undefined) payload.auto_generated = body.auto_generated;
  if (body.generated_by !== undefined) payload.generated_by = body.generated_by;
  if (body.review_status !== undefined) payload.review_status = body.review_status ?? null;

  if (!partial) payload.created_at = new Date().toISOString();
  return payload;
}

async function enrichRecords(rows: TriangulationRow[]) {
  if (rows.length === 0) return [];
  const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
  const sessionIds = Array.from(new Set(rows.map((row) => row.learning_session_id).filter((id): id is string => Boolean(id))));

  const [{ data: users }, { data: sessions }] = await Promise.all([
    userIds.length > 0 ? adminDb.from('users').select('id, name, email').in('id', userIds) : Promise.resolve({ data: [] }),
    sessionIds.length > 0 ? adminDb.from('learning_sessions').select('id, session_number, course_id').in('id', sessionIds) : Promise.resolve({ data: [] }),
  ]);

  const usersById = new Map<string, { name?: string | null; email?: string | null }>(
    (users ?? []).map((user: { id: string; name?: string | null; email?: string | null }) => [user.id, user])
  );
  const sessionsById = new Map<string, { session_number?: number | null; course_id?: string | null }>(
    (sessions ?? []).map((session: { id: string; session_number?: number | null; course_id?: string | null }) => [session.id, session])
  );

  return rows.map((row, index) => toClientRecord(row, usersById.get(row.user_id), row.learning_session_id ? sessionsById.get(row.learning_session_id) : null, index));
}

function toClientRecord(
  row: TriangulationRow | Record<string, unknown>,
  user?: { name?: string | null; email?: string | null } | null,
  session?: { session_number?: number | null; course_id?: string | null } | null,
  index = 0,
) {
  const record = row as TriangulationRow;
  const status = convergenceToStatus(record.convergence_status);
  return {
    ...record,
    rm_focus: record.rm_focus ?? inferRmFocus(record.finding_type),
    indicator_code: record.indicator_code ?? inferIndicatorCode(record.finding_type),
    status: record.triangulation_status ?? status,
    sources: asSourceResponse(record),
    rationale: record.decision_rationale ?? record.researcher_notes ?? null,
    evidence_excerpt: record.evidence_excerpt ?? record.log_evidence ?? record.artifact_evidence ?? record.observation_evidence ?? null,
    student_name: user?.name ?? user?.email ?? `Siswa ${index + 1}`,
    anonymous_id: `S${String(index + 1).padStart(2, '0')}`,
    session_number: session?.session_number ?? null,
  };
}

function buildSummary(records: Array<ReturnType<typeof toClientRecord>>) {
  const summary = emptySummary();
  records.forEach((record) => {
    summary.total_findings += 1;
    if (record.status === 'kuat') summary.strong += 1;
    if (record.status === 'sebagian') summary.partial += 1;
    if (record.status === 'bertentangan') summary.contradictory += 1;
    if (record.status === 'belum_muncul') summary.missing += 1;
  });
  summary.coverage_pct = summary.total_findings > 0
    ? Math.round(((summary.strong + summary.partial + summary.contradictory) / summary.total_findings) * 100)
    : 0;
  return summary;
}

function emptySummary() {
  return {
    total_findings: 0,
    strong: 0,
    partial: 0,
    contradictory: 0,
    missing: 0,
    coverage_pct: 0,
  };
}

function normalizeStatus(value: unknown): ThesisTriangulationStatus {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'kuat' || raw === 'strong' || raw === 'convergen' || raw === 'convergent') return 'kuat';
  if (raw === 'bertentangan' || raw === 'contradictory' || raw === 'contradicts') return 'bertentangan';
  if (raw === 'belum_muncul' || raw === 'missing' || raw === 'absent') return 'belum_muncul';
  return 'sebagian';
}

function statusToConvergence(status: unknown): string {
  const normalized = normalizeStatus(status);
  if (normalized === 'kuat') return 'convergen';
  if (normalized === 'bertentangan') return 'contradictory';
  if (normalized === 'belum_muncul') return 'missing';
  return 'partial';
}

function convergenceToStatus(value: unknown): ThesisTriangulationStatus {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'convergen' || raw === 'convergent' || raw === 'strong') return 'kuat';
  if (raw === 'contradictory' || raw === 'contradicts') return 'bertentangan';
  if (raw === 'missing' || raw === 'belum_muncul') return 'belum_muncul';
  return 'sebagian';
}

function normalizeSources(value: unknown): Record<string, { requested: boolean }> {
  const entries = Array.isArray(value)
    ? value.map(String)
    : typeof value === 'string'
      ? value.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean)
      : value && typeof value === 'object'
        ? Object.keys(value as Record<string, unknown>)
        : [];

  return entries.reduce((acc, item) => {
    acc[item] = { requested: true };
    return acc;
  }, {} as Record<string, { requested: boolean }>);
}

function normalizeSourceStatus(value: unknown, status: ThesisTriangulationStatus): SourceStatus {
  const raw = String(value ?? '').trim().toLowerCase();
  if (raw === 'supports' || raw === 'support' || raw === 'mendukung') return 'supports';
  if (raw === 'contradicts' || raw === 'bertentangan') return 'contradicts';
  if (status === 'kuat') return 'supports';
  if (status === 'bertentangan') return 'contradicts';
  return 'neutral';
}

function scoreConvergence(payload: Record<string, unknown>): number {
  return [
    payload.log_evidence_status,
    payload.observation_evidence_status,
    payload.artifact_evidence_status,
    payload.interview_evidence_status,
  ].filter((status) => status === 'supports').length;
}

function finalDecisionFromStatus(status: ThesisTriangulationStatus): string {
  if (status === 'kuat') return 'accepted';
  if (status === 'bertentangan') return 'revised';
  if (status === 'belum_muncul') return 'pending';
  return 'accepted_with_notes';
}

function asSourceResponse(row: TriangulationRow) {
  const saved = row.sources && typeof row.sources === 'object' ? row.sources : {};
  return {
    ...saved,
    log_prompt: row.log_evidence ? { status: row.log_evidence_status ?? 'neutral', excerpt: row.log_evidence } : null,
    observasi_longitudinal: row.observation_evidence ? { status: row.observation_evidence_status ?? 'neutral', excerpt: row.observation_evidence } : null,
    artefak_solusi: row.artifact_evidence ? { status: row.artifact_evidence_status ?? 'neutral', excerpt: row.artifact_evidence } : null,
    wawancara_manual: row.interview_evidence ? { status: row.interview_evidence_status ?? 'neutral', excerpt: row.interview_evidence } : null,
  };
}

function inferRmFocus(value: unknown): string {
  const raw = String(value ?? '').toUpperCase();
  if (raw.includes('RM2') && raw.includes('RM3')) return 'RM2_RM3';
  if (raw.includes('RM2') || raw.includes('PROMPT') || raw.includes('STAGE')) return 'RM2';
  return 'RM3';
}

function inferIndicatorCode(value: unknown): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'triangulasi';
  const parts = raw.split(':').map((part) => part.trim()).filter(Boolean);
  return parts[1] ?? parts[0] ?? 'triangulasi';
}

function isPayloadError(value: Record<string, unknown> | { error: string; status: number }): value is { error: string; status: number } {
  return typeof (value as { error?: unknown }).error === 'string' && typeof (value as { status?: unknown }).status === 'number';
}
