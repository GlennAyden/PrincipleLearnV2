/**
 * API Route: Prompt Classifications Management
 * GET /api/admin/research/classifications - List with filters + pagination
 * POST /api/admin/research/classifications - Create new classification
 * PUT /api/admin/research/classifications - Update existing classification
 * DELETE /api/admin/research/classifications - Delete classification
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { requireAdminMutation, verifyAdminFromCookie } from '@/lib/admin-auth';
import type { PromptClassification } from '@/types/research';
import {
  coerceUuid,
  getPromptStageScore,
  isUuid,
  normalizeConfidence,
  normalizeMicroMarkers,
  normalizePromptStage,
  normalizeSourceType,
} from '@/lib/research-normalizers';

interface ClassificationBody {
  id?: string;
  prompt_source?: string;
  prompt_id?: string;
  learning_session_id?: string;
  session_id?: string;
  user_id?: string;
  course_id?: string;
  prompt_text?: string;
  prompt_sequence?: number | string | null;
  prompt_stage?: string;
  micro_markers?: unknown;
  primary_marker?: string | null;
  classified_by?: string;
  classification_method?: string | null;
  confidence_score?: number | string | null;
  classification_evidence?: string | null;
  classification_rationale?: string | null;
  researcher_notes?: string | null;
  agreement_status?: string | null;
}

interface SessionContext {
  user_id: string;
  course_id: string;
  session_number?: number | null;
}

interface PromptContext {
  user_id?: string | null;
  course_id?: string | null;
  prompt_text?: string | null;
  prompt_sequence?: number | null;
  learning_session_id?: string | null;
}

interface ClassificationRow extends PromptClassification {
  learning_sessions?: {
    session_number?: number | null;
    users?: { name?: string | null; email?: string | null } | null;
    courses?: { title?: string | null } | null;
  } | null;
}

interface PayloadError {
  error: string;
  status: number;
}

function isPayloadError(value: unknown): value is PayloadError {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PayloadError>;
  return typeof candidate.error === 'string' && typeof candidate.status === 'number';
}

export async function GET(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('user_id');
    const courseId = searchParams.get('course_id');
    const sessionId = searchParams.get('learning_session_id') ?? searchParams.get('session_id');
    const promptStage = searchParams.get('prompt_stage') ?? searchParams.get('stage');
    const promptSource = searchParams.get('prompt_source');
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get('limit') || '100', 10) || 100));

    if (userId && !isUuid(userId)) return NextResponse.json({ error: 'Invalid user_id format' }, { status: 400 });
    if (courseId && !isUuid(courseId)) return NextResponse.json({ error: 'Invalid course_id format' }, { status: 400 });
    if (sessionId && !isUuid(sessionId)) return NextResponse.json({ error: 'Invalid learning_session_id format' }, { status: 400 });

    let query = adminDb.from('prompt_classifications').select('*');
    if (userId) query = query.eq('user_id', userId);
    if (courseId) query = query.eq('course_id', courseId);
    if (sessionId) query = query.eq('learning_session_id', sessionId);
    if (promptStage) query = query.eq('prompt_stage', normalizePromptStage(promptStage));
    if (promptSource) query = query.eq('prompt_source', normalizeSourceType(promptSource));
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error } = await query;
    if (error) return NextResponse.json({ error: 'Failed to fetch classifications' }, { status: 500 });

    const rows = await enrichClassifications((data ?? []) as ClassificationRow[]);

    let countQuery = adminDb.from('prompt_classifications').select('id');
    if (userId) countQuery = countQuery.eq('user_id', userId);
    if (courseId) countQuery = countQuery.eq('course_id', courseId);
    if (sessionId) countQuery = countQuery.eq('learning_session_id', sessionId);
    if (promptStage) countQuery = countQuery.eq('prompt_stage', normalizePromptStage(promptStage));
    if (promptSource) countQuery = countQuery.eq('prompt_source', normalizeSourceType(promptSource));
    const { data: countData } = await countQuery;
    const total = Array.isArray(countData) ? countData.length : rows.length;

    return NextResponse.json({ success: true, data: rows, total, offset, limit });
  } catch (error) {
    console.error('Error in GET /api/admin/research/classifications:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const guard = requireAdminMutation(request);
    if (guard) return guard;

    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as ClassificationBody;
    const normalized = await buildClassificationPayload(body, admin.email ?? 'admin');
    if (isPayloadError(normalized)) return NextResponse.json({ error: normalized.error }, { status: normalized.status });

    const { data: existing } = await adminDb
      .from('prompt_classifications')
      .select('id')
      .eq('prompt_source', normalized.prompt_source)
      .eq('prompt_id', normalized.prompt_id)
      .eq('classified_by', normalized.classified_by)
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: 'Classification already exists for this prompt by this classifier' }, { status: 409 });
    }

    const { data, error } = await adminDb.from('prompt_classifications').insert(normalized);
    if (error) {
      console.error('Error creating prompt classification:', error);
      return NextResponse.json({ error: 'Failed to create classification' }, { status: 500 });
    }

    if (normalized.learning_session_id) await updateSessionPromptCount(normalized.learning_session_id);

    const createdRows = await enrichClassifications(data ? [data as ClassificationRow] : []);
    return NextResponse.json({
      success: true,
      data: createdRows[0] ?? data as PromptClassification,
      message: 'Prompt classification created successfully',
    }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/admin/research/classifications:', error);
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
    const body = await request.json() as ClassificationBody;
    const id = body.id ?? searchParams.get('id') ?? undefined;
    if (!id) return NextResponse.json({ error: 'Missing required field: id' }, { status: 400 });
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id format' }, { status: 400 });

    const { data: existing } = await adminDb
      .from('prompt_classifications')
      .select('id, learning_session_id')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Classification not found' }, { status: 404 });

    const updateData = await buildClassificationUpdatePayload(body, admin.email ?? 'admin');
    if (isPayloadError(updateData)) return NextResponse.json({ error: updateData.error }, { status: updateData.status });

    const { data, error } = await adminDb
      .from('prompt_classifications')
      .eq('id', id)
      .update(updateData);
    if (error) {
      console.error('Error updating prompt classification:', error);
      return NextResponse.json({ error: 'Failed to update classification' }, { status: 500 });
    }

    const previousSessionId = (existing as { learning_session_id?: string | null }).learning_session_id;
    const nextSessionId = updateData.learning_session_id as string | undefined;
    if (previousSessionId) await updateSessionPromptCount(previousSessionId);
    if (nextSessionId && nextSessionId !== previousSessionId) await updateSessionPromptCount(nextSessionId);

    const row = Array.isArray(data) ? data[0] : data;
    const updatedRows = await enrichClassifications(row ? [row as ClassificationRow] : []);
    return NextResponse.json({
      success: true,
      data: updatedRows[0] ?? row as PromptClassification,
      message: 'Classification updated successfully',
    });
  } catch (error) {
    console.error('Error in PUT /api/admin/research/classifications:', error);
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
    if (!id) return NextResponse.json({ error: 'Missing required parameter: id' }, { status: 400 });
    if (!isUuid(id)) return NextResponse.json({ error: 'Invalid id format' }, { status: 400 });

    const { data: existing } = await adminDb
      .from('prompt_classifications')
      .select('id, learning_session_id')
      .eq('id', id)
      .maybeSingle();
    if (!existing) return NextResponse.json({ error: 'Classification not found' }, { status: 404 });

    const { data: deps } = await adminDb
      .from('cognitive_indicators')
      .select('id')
      .eq('prompt_classification_id', id);
    if (deps && Array.isArray(deps) && deps.length > 0) {
      return NextResponse.json({ error: `Cannot delete: ${deps.length} indicator(s) depend on it. Delete indicators first.` }, { status: 409 });
    }

    const { error } = await adminDb.from('prompt_classifications').eq('id', id).delete();
    if (error) return NextResponse.json({ error: 'Failed to delete classification' }, { status: 500 });

    const sessionId = (existing as { learning_session_id?: string | null }).learning_session_id;
    if (sessionId) await updateSessionPromptCount(sessionId);

    return NextResponse.json({ success: true, message: 'Classification deleted successfully' });
  } catch (error) {
    console.error('Error in DELETE /api/admin/research/classifications:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function buildClassificationPayload(body: ClassificationBody, adminEmail: string) {
  const sessionId = body.learning_session_id ?? body.session_id ?? null;
  const session = sessionId ? await getSessionContext(sessionId) : null;
  const source = normalizeSourceType(body.prompt_source);
  const promptId = coerceUuid(body.prompt_id);
  const prompt = body.prompt_id ? await getPromptContext(source, body.prompt_id) : null;
  if (!body.prompt_stage) return { error: 'Missing required field: prompt_stage', status: 400 };
  if (!isPromptStageLike(body.prompt_stage)) return { error: 'Invalid prompt_stage', status: 400 };
  const promptStage = normalizePromptStage(body.prompt_stage);

  const userId = body.user_id ?? prompt?.user_id ?? session?.user_id;
  const courseId = body.course_id ?? prompt?.course_id ?? session?.course_id;
  const promptText = body.prompt_text ?? prompt?.prompt_text;

  if (!userId || !isUuid(userId)) return { error: 'Missing or invalid user_id. Choose a session or raw prompt first.', status: 400 };
  if (!courseId || !isUuid(courseId)) return { error: 'Missing or invalid course_id. Choose a session or raw prompt first.', status: 400 };
  if (!promptText?.trim()) return { error: 'Missing required field: prompt_text', status: 400 };

  const markers = normalizeMicroMarkers(body.micro_markers);

  return {
    prompt_source: source,
    prompt_id: promptId,
    learning_session_id: sessionId && isUuid(sessionId) ? sessionId : prompt?.learning_session_id ?? null,
    user_id: userId,
    course_id: courseId,
    prompt_text: promptText.trim(),
    prompt_sequence: normalizeOptionalInt(body.prompt_sequence ?? prompt?.prompt_sequence),
    prompt_stage: promptStage,
    prompt_stage_score: getPromptStageScore(promptStage),
    micro_markers: markers,
    primary_marker: body.primary_marker ?? markers[0] ?? null,
    classified_by: body.classified_by?.trim() || adminEmail || 'admin',
    classification_method: body.classification_method || (source === 'manual_entry' ? 'manual_coding' : 'llm_assisted'),
    confidence_score: normalizeConfidence(body.confidence_score),
    classification_evidence: body.classification_evidence ?? body.classification_rationale ?? null,
    researcher_notes: body.researcher_notes ?? null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function buildClassificationUpdatePayload(body: ClassificationBody, adminEmail: string) {
  const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.prompt_source !== undefined) updateData.prompt_source = normalizeSourceType(body.prompt_source);
  if (body.prompt_id !== undefined) updateData.prompt_id = coerceUuid(body.prompt_id);
  const sessionId = body.learning_session_id ?? body.session_id;
  if (sessionId !== undefined) {
    if (sessionId && !isUuid(sessionId)) return { error: 'Invalid learning_session_id format', status: 400 };
    updateData.learning_session_id = sessionId || null;
  }
  if (body.user_id !== undefined) {
    if (!isUuid(body.user_id)) return { error: 'Invalid user_id format', status: 400 };
    updateData.user_id = body.user_id;
  }
  if (body.course_id !== undefined) {
    if (!isUuid(body.course_id)) return { error: 'Invalid course_id format', status: 400 };
    updateData.course_id = body.course_id;
  }
  if (body.prompt_text !== undefined) updateData.prompt_text = body.prompt_text.trim();
  if (body.prompt_sequence !== undefined) updateData.prompt_sequence = normalizeOptionalInt(body.prompt_sequence);
  if (body.prompt_stage !== undefined) {
    if (!isPromptStageLike(body.prompt_stage)) return { error: 'Invalid prompt_stage', status: 400 };
    const stage = normalizePromptStage(body.prompt_stage);
    updateData.prompt_stage = stage;
    updateData.prompt_stage_score = getPromptStageScore(stage);
  }
  if (body.micro_markers !== undefined) {
    const markers = normalizeMicroMarkers(body.micro_markers);
    updateData.micro_markers = markers;
    updateData.primary_marker = body.primary_marker ?? markers[0] ?? null;
  } else if (body.primary_marker !== undefined) {
    updateData.primary_marker = body.primary_marker;
  }
  if (body.classified_by !== undefined) updateData.classified_by = body.classified_by?.trim() || adminEmail || 'admin';
  if (body.classification_method !== undefined) updateData.classification_method = body.classification_method;
  if (body.confidence_score !== undefined) updateData.confidence_score = normalizeConfidence(body.confidence_score);
  if (body.classification_evidence !== undefined || body.classification_rationale !== undefined) {
    updateData.classification_evidence = body.classification_evidence ?? body.classification_rationale ?? null;
  }
  if (body.researcher_notes !== undefined) updateData.researcher_notes = body.researcher_notes;
  if (body.agreement_status !== undefined) updateData.agreement_status = body.agreement_status;

  return updateData;
}

async function getSessionContext(sessionId: string): Promise<SessionContext | null> {
  if (!isUuid(sessionId)) return null;
  const { data } = await adminDb
    .from('learning_sessions')
    .select('user_id, course_id, session_number')
    .eq('id', sessionId)
    .maybeSingle();
  return (data ?? null) as SessionContext | null;
}

async function getPromptContext(source: string, promptId: string): Promise<PromptContext | null> {
  if (!isUuid(promptId)) return null;
  if (source === 'ask_question') {
    const { data } = await adminDb
      .from('ask_question_history')
      .select('user_id, course_id, question, session_number, learning_session_id')
      .eq('id', promptId)
      .maybeSingle();
    const row = data as { user_id?: string; course_id?: string; question?: string; session_number?: number; learning_session_id?: string } | null;
    return row ? {
      user_id: row.user_id,
      course_id: row.course_id,
      prompt_text: row.question,
      prompt_sequence: row.session_number ?? null,
      learning_session_id: row.learning_session_id ?? null,
    } : null;
  }
  if (source === 'challenge_response' || source === 'challenge') {
    const { data } = await adminDb
      .from('challenge_responses')
      .select('user_id, course_id, question, learning_session_id')
      .eq('id', promptId)
      .maybeSingle();
    const row = data as { user_id?: string; course_id?: string; question?: string; learning_session_id?: string } | null;
    return row ? {
      user_id: row.user_id,
      course_id: row.course_id,
      prompt_text: row.question,
      learning_session_id: row.learning_session_id ?? null,
    } : null;
  }
  return null;
}

async function enrichClassifications(rows: ClassificationRow[]): Promise<ClassificationRow[]> {
  const sessionIds = Array.from(new Set(rows.map((row) => row.learning_session_id).filter((id): id is string => Boolean(id))));
  if (sessionIds.length === 0) return rows.map((row) => mapClassificationForClient(row, null));

  const { data: sessions } = await adminDb
    .from('learning_sessions')
    .select('id, session_number, user_id, course_id')
    .in('id', sessionIds);
  const sessionRows = (sessions ?? []) as Array<{ id: string; session_number?: number | null; user_id: string; course_id: string }>;

  const userIds = Array.from(new Set(sessionRows.map((session) => session.user_id)));
  const courseIds = Array.from(new Set(sessionRows.map((session) => session.course_id)));
  const [{ data: users }, { data: courses }] = await Promise.all([
    userIds.length > 0 ? adminDb.from('users').select('id, name, email').in('id', userIds) : Promise.resolve({ data: [] }),
    courseIds.length > 0 ? adminDb.from('courses').select('id, title').in('id', courseIds) : Promise.resolve({ data: [] }),
  ]);

  const usersById = new Map((users ?? []).map((user: { id: string; name?: string | null; email?: string | null }) => [user.id, user]));
  const coursesById = new Map((courses ?? []).map((course: { id: string; title?: string | null }) => [course.id, course]));
  const sessionsById = new Map(sessionRows.map((session) => [session.id, {
    session_number: session.session_number ?? null,
    users: usersById.get(session.user_id) ?? null,
    courses: coursesById.get(session.course_id) ?? null,
  }]));

  return rows.map((row) => mapClassificationForClient(
    row,
    row.learning_session_id ? sessionsById.get(row.learning_session_id) ?? null : null,
  ));
}

function mapClassificationForClient(
  row: ClassificationRow,
  learningSession: ClassificationRow['learning_sessions'] | null,
): ClassificationRow {
  return {
    ...row,
    session_id: row.learning_session_id ?? '',
    prompt_stage: normalizePromptStage(row.prompt_stage),
    micro_markers: normalizeMicroMarkers(row.micro_markers) as unknown as PromptClassification['micro_markers'],
    cognitive_depth_level: (row as unknown as { cognitive_depth_level?: number | null }).cognitive_depth_level ?? 1,
    classification_rationale: (row as unknown as { classification_evidence?: string | null }).classification_evidence ?? row.researcher_notes ?? null,
    learning_sessions: learningSession,
  } as ClassificationRow;
}

function normalizeOptionalInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number' ? value : parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function isPromptStageLike(value: unknown): boolean {
  const raw = String(value ?? '').trim().toUpperCase();
  return [
    'SCP',
    'SRP',
    'MQP',
    'REFLECTIVE',
    'REFLEKTIF',
    'REFLECTIF',
    'REFLECTIVE_PROMPT',
    'SIMPLE',
    'SIMPLE_CLARIFICATION_PROMPT',
    'STRUCTURED',
    'STRUCTURED_REFORMULATION_PROMPT',
    'MULTI',
    'MULTI_QUESTION_PROMPT',
  ].includes(raw);
}

async function updateSessionPromptCount(sessionId: string) {
  try {
    const { data: classifications } = await adminDb
      .from('prompt_classifications')
      .select('id, prompt_stage, prompt_stage_score')
      .eq('learning_session_id', sessionId);
    const rows = Array.isArray(classifications)
      ? classifications as Array<{ prompt_stage?: string | null; prompt_stage_score?: number | null }>
      : [];
    const totalPrompts = rows.length;
    const avgScore = totalPrompts > 0
      ? rows.reduce((sum, row) => sum + (row.prompt_stage_score ?? 0), 0) / totalPrompts
      : null;
    const stageCounts = new Map<string, { count: number; score: number }>();
    rows.forEach((row) => {
      const stage = row.prompt_stage ? normalizePromptStage(row.prompt_stage) : null;
      if (!stage) return;
      const current = stageCounts.get(stage) ?? { count: 0, score: row.prompt_stage_score ?? getPromptStageScore(stage) };
      current.count += 1;
      stageCounts.set(stage, current);
    });
    const dominantStage = Array.from(stageCounts.entries())
      .sort((a, b) => b[1].count - a[1].count || b[1].score - a[1].score)[0];
    await adminDb.from('learning_sessions').eq('id', sessionId).update({
      total_prompts: totalPrompts,
      dominant_stage: dominantStage?.[0] ?? null,
      dominant_stage_score: avgScore ? Math.round(avgScore) : null,
    });
  } catch (error) {
    console.error('Error updating session prompt count:', error);
  }
}
