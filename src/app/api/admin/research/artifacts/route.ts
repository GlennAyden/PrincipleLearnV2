/**
 * API Route: Research Artifacts
 * GET /api/admin/research/artifacts - List stored student solution artifacts
 * POST /api/admin/research/artifacts - Store artifact evidence from admin
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { requireAdminMutation, verifyAdminFromCookie } from '@/lib/admin-auth';
import { isUuid, normalizeScore } from '@/lib/research-normalizers';

interface ArtifactBody {
  id?: string;
  user_id?: string;
  course_id?: string;
  learning_session_id?: string | null;
  artifact_type?: string;
  artifact_title?: string | null;
  artifact_content?: string;
  source_type?: string | null;
  source_table?: string | null;
  source_id?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  mime_type?: string | null;
  storage_path?: string | null;
  artifact_metadata?: Record<string, unknown> | null;
  evidence_status?: string | null;
  coding_status?: string | null;
  research_validity_status?: string | null;
  data_collection_week?: string | null;
  related_prompt_ids?: string[] | string | null;
  decomposition_quality?: number | string | null;
  algorithm_accuracy?: number | string | null;
  abstraction_quality?: number | string | null;
  evaluation_revision?: number | string | null;
  decision_justification?: number | string | null;
  assessed_by?: string | null;
  assessment_notes?: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');
  const courseId = searchParams.get('course_id');
  const sessionId = searchParams.get('learning_session_id') ?? searchParams.get('session_id');
  const type = searchParams.get('artifact_type');
  const codingStatus = searchParams.get('coding_status');
  const validityStatus = searchParams.get('research_validity_status');
  const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
  const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10) || 100));

  let query = adminDb.from('research_artifacts').select('*');
  if (userId) query = query.eq('user_id', userId);
  if (courseId) query = query.eq('course_id', courseId);
  if (sessionId) query = query.eq('learning_session_id', sessionId);
  if (type) query = query.eq('artifact_type', type);
  if (codingStatus) query = query.eq('coding_status', codingStatus);
  if (validityStatus) query = query.eq('research_validity_status', validityStatus);
  query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) {
      console.warn('Research artifacts table unavailable or query failed:', error);
      return NextResponse.json({ success: true, data: [], total: 0, message: 'Research artifacts table is not available yet.' });
    }

    return NextResponse.json({ success: true, data: data ?? [], total: Array.isArray(data) ? data.length : 0, offset, limit });
  } catch (error) {
    console.error('Error in GET /api/admin/research/artifacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = requireAdminMutation(request);
    if (guard) return guard;

    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as ArtifactBody;
    const payload = buildPayload(body, admin.email ?? 'admin');
    if (isPayloadError(payload)) return NextResponse.json({ error: payload.error }, { status: payload.status });

    const { data, error } = await adminDb.from('research_artifacts').insert(payload);
    if (error) {
      console.error('Error creating research artifact:', error);
      return NextResponse.json({ error: 'Failed to save research artifact' }, { status: 500 });
    }

    await syncArtifactEvidence(data as Record<string, unknown>);

    return NextResponse.json({ success: true, data, message: 'Research artifact saved successfully' }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/admin/research/artifacts:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function buildPayload(body: ArtifactBody, adminEmail: string): Record<string, unknown> | { error: string; status: number } {
  if (!body.user_id || !isUuid(body.user_id)) return { error: 'Missing or invalid user_id', status: 400 };
  if (!body.course_id || !isUuid(body.course_id)) return { error: 'Missing or invalid course_id', status: 400 };
  if (body.learning_session_id && !isUuid(body.learning_session_id)) return { error: 'Invalid learning_session_id', status: 400 };
  if (!body.artifact_content?.trim()) return { error: 'Missing artifact_content', status: 400 };

  return {
    user_id: body.user_id,
    course_id: body.course_id,
    learning_session_id: body.learning_session_id || null,
    artifact_type: body.artifact_type?.trim() || 'solution',
    artifact_title: body.artifact_title?.trim() || null,
    artifact_content: body.artifact_content.trim(),
    source_type: body.source_type?.trim() || 'artifact',
    source_table: body.source_table?.trim() || null,
    source_id: body.source_id && isUuid(body.source_id) ? body.source_id : null,
    file_url: body.file_url?.trim() || null,
    file_name: body.file_name?.trim() || null,
    mime_type: body.mime_type?.trim() || null,
    storage_path: body.storage_path?.trim() || null,
    artifact_metadata: body.artifact_metadata ?? {},
    evidence_status: normalizeEvidenceStatus(body.evidence_status) ?? 'raw',
    coding_status: normalizeCodingStatus(body.coding_status) ?? 'manual_coded',
    research_validity_status: normalizeValidityStatus(body.research_validity_status) ?? 'valid',
    data_collection_week: body.data_collection_week?.trim() || null,
    related_prompt_ids: normalizePromptIds(body.related_prompt_ids),
    decomposition_quality: normalizeNullableScore(body.decomposition_quality),
    algorithm_accuracy: normalizeNullableScore(body.algorithm_accuracy),
    abstraction_quality: normalizeNullableScore(body.abstraction_quality),
    evaluation_revision: normalizeNullableScore(body.evaluation_revision),
    decision_justification: normalizeNullableScore(body.decision_justification),
    assessed_by: body.assessed_by?.trim() || adminEmail || 'admin',
    assessment_notes: body.assessment_notes ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function isPayloadError(value: Record<string, unknown> | { error: string; status: number }): value is { error: string; status: number } {
  return typeof (value as { error?: unknown }).error === 'string' && typeof (value as { status?: unknown }).status === 'number';
}

function normalizePromptIds(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[,;\n]+/)
      : [];
  return raw.map((item) => String(item).trim()).filter((item) => isUuid(item));
}

function normalizeNullableScore(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  return normalizeScore(value);
}

function normalizeCodingStatus(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'review' || raw === 'reviewed') return 'reviewed';
  if (raw === 'manual' || raw === 'manual_coded') return 'manual_coded';
  if (raw === 'auto' || raw === 'auto_coded') return 'auto_coded';
  if (raw === 'uncoded' || raw === 'raw') return 'uncoded';
  return null;
}

function normalizeEvidenceStatus(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'coded' || raw === 'triangulated' || raw === 'excluded' || raw === 'needs_review' || raw === 'raw') {
    return raw;
  }
  return null;
}

function normalizeValidityStatus(value: unknown): string | null {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return null;
  if (raw === 'valid' || raw === 'low_information' || raw === 'duplicate' || raw === 'excluded' || raw === 'manual_note') {
    return raw;
  }
  return null;
}

async function syncArtifactEvidence(row: Record<string, unknown>) {
  const artifactId = typeof row.id === 'string' ? row.id : null;
  const userId = typeof row.user_id === 'string' ? row.user_id : null;
  if (!artifactId || !userId) return;

  const evidencePayload = {
    source_type: 'artifact',
    source_id: artifactId,
    source_table: 'research_artifacts',
    user_id: userId,
    course_id: typeof row.course_id === 'string' ? row.course_id : null,
    learning_session_id: typeof row.learning_session_id === 'string' ? row.learning_session_id : null,
    rm_focus: 'RM3',
    evidence_title: typeof row.artifact_title === 'string' ? row.artifact_title : String(row.artifact_type ?? 'Artefak'),
    evidence_text: typeof row.artifact_content === 'string' ? row.artifact_content : null,
    artifact_text: typeof row.artifact_content === 'string' ? row.artifact_content : null,
    evidence_status: normalizeEvidenceStatus(row.evidence_status) ?? 'coded',
    coding_status: normalizeCodingStatus(row.coding_status) ?? 'manual_coded',
    research_validity_status: normalizeValidityStatus(row.research_validity_status) ?? 'valid',
    data_collection_week: typeof row.data_collection_week === 'string' ? row.data_collection_week : null,
    evidence_source_summary: 'Artefak solusi',
    researcher_notes: typeof row.assessment_notes === 'string' ? row.assessment_notes : null,
    raw_evidence_snapshot: {
      artifact_type: row.artifact_type ?? null,
      related_prompt_ids: row.related_prompt_ids ?? [],
      file_name: row.file_name ?? null,
      file_url: row.file_url ?? null,
      artifact_metadata: row.artifact_metadata ?? {},
    },
    metadata: {
      artifact_type: row.artifact_type ?? null,
      file_name: row.file_name ?? null,
      mime_type: row.mime_type ?? null,
      storage_path: row.storage_path ?? null,
    },
    is_auto_generated: true,
    updated_at: new Date().toISOString(),
  };

  const { data: existing } = await adminDb
    .from('research_evidence_items')
    .select('id')
    .eq('source_type', 'artifact')
    .eq('source_id', artifactId)
    .maybeSingle();

  if (existing?.id) {
    await adminDb.from('research_evidence_items').eq('id', existing.id).update(evidencePayload);
    return;
  }

  await adminDb.from('research_evidence_items').insert({
    ...evidencePayload,
    created_at: new Date().toISOString(),
  });
}
