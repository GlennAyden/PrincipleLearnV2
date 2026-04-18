/**
 * API Route: Unified Research Evidence
 * GET /api/admin/research/evidence
 * POST /api/admin/research/evidence
 * PUT /api/admin/research/evidence
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import {
  EVIDENCE_SOURCE_TYPES,
  formatAnonParticipant,
  isUuid,
  normalizePromptStage,
  normalizeSourceType,
} from '@/lib/research-normalizers';
import type { ResearchEvidenceItem } from '@/types/research';

type EvidenceSourceType = ResearchEvidenceItem['source_type'];
type RmFocus = ResearchEvidenceItem['rm_focus'];
type EvidenceCodingStatus = ResearchEvidenceItem['coding_status'];
type ResearchValidityStatus = ResearchEvidenceItem['research_validity_status'];
type EvidenceStatus = ResearchEvidenceItem['evidence_status'];

interface EvidencePayload extends Partial<ResearchEvidenceItem> {
  id?: string;
}

interface ClientEvidenceItem extends Omit<ResearchEvidenceItem, 'raw_evidence_snapshot' | 'metadata'> {
  student_name?: string | null;
  student_email?: string | null;
  anonymous_id?: string | null;
  session_number?: number | null;
  source_label: string;
  text_preview: string;
  raw_evidence_snapshot?: Record<string, unknown> | null;
  metadata?: Record<string, unknown> | null;
}

interface BaseSourceRow {
  id: string;
  user_id: string;
  course_id?: string | null;
  learning_session_id?: string | null;
  created_at?: string | null;
}

interface AskSourceRow extends BaseSourceRow {
  session_number?: number | null;
  prompt_stage?: string | null;
  question?: string | null;
  answer?: string | null;
  stage_confidence?: number | null;
  research_validity_status?: string | null;
  coding_status?: string | null;
  researcher_notes?: string | null;
  raw_evidence_snapshot?: Record<string, unknown> | null;
  data_collection_week?: string | null;
}

interface ChallengeSourceRow extends BaseSourceRow {
  question?: string | null;
  answer?: string | null;
  feedback?: string | null;
  reasoning_note?: string | null;
  research_validity_status?: string | null;
  coding_status?: string | null;
  researcher_notes?: string | null;
  raw_evidence_snapshot?: Record<string, unknown> | null;
  data_collection_week?: string | null;
}

interface QuizSourceRow extends BaseSourceRow {
  quiz_id?: string | null;
  answer?: string | null;
  is_correct?: boolean | null;
  reasoning_note?: string | null;
  research_validity_status?: string | null;
  coding_status?: string | null;
  researcher_notes?: string | null;
  raw_evidence_snapshot?: Record<string, unknown> | null;
  data_collection_week?: string | null;
}

interface JournalSourceRow extends BaseSourceRow {
  content?: string | null;
  reflection?: string | null;
  type?: string | null;
  research_validity_status?: string | null;
  coding_status?: string | null;
  researcher_notes?: string | null;
  raw_evidence_snapshot?: Record<string, unknown> | null;
  data_collection_week?: string | null;
}

interface DiscussionSourceRow {
  id: string;
  content?: string | null;
  role?: string | null;
  metadata?: Record<string, unknown> | null;
  created_at?: string | null;
  learning_session_id?: string | null;
  research_validity_status?: string | null;
  coding_status?: string | null;
  researcher_notes?: string | null;
  raw_evidence_snapshot?: Record<string, unknown> | null;
  data_collection_week?: string | null;
  discussion_sessions?: {
    user_id?: string | null;
    course_id?: string | null;
    learning_session_id?: string | null;
  } | null;
}

interface ArtifactSourceRow extends BaseSourceRow {
  artifact_type?: string | null;
  artifact_title?: string | null;
  artifact_content?: string | null;
  file_name?: string | null;
  file_url?: string | null;
  evidence_status?: string | null;
  coding_status?: string | null;
  research_validity_status?: string | null;
  assessment_notes?: string | null;
  artifact_metadata?: Record<string, unknown> | null;
  data_collection_week?: string | null;
}

export async function GET(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const limit = Math.min(250, Math.max(1, parseInt(searchParams.get('limit') || '100', 10) || 100));
    const offset = Math.max(0, parseInt(searchParams.get('offset') || '0', 10) || 0);

    const filters = {
      userId: searchParams.get('user_id') || undefined,
      courseId: searchParams.get('course_id') || undefined,
      sessionId: searchParams.get('learning_session_id') || undefined,
      sourceType: normalizeSourceFilter(searchParams.get('source_type')),
      rmFocus: normalizeRmFocus(searchParams.get('rm_focus')),
      codingStatus: normalizeCodingStatus(searchParams.get('coding_status')),
      validityStatus: normalizeValidityStatus(searchParams.get('research_validity_status')),
      search: searchParams.get('search')?.trim().toLowerCase() || '',
    };

    const [ledgerRows, rawRows] = await Promise.all([
      fetchLedgerEvidence(filters, limit, offset),
      collectRawEvidence(filters, Math.max(limit * 3, 250)),
    ]);

    const merged = mergeEvidenceRows(rawRows, ledgerRows);
    const filtered = applyFilters(merged, filters);
    const paged = filtered.slice(offset, offset + limit);
    const enriched = await enrichRows(paged);

    return NextResponse.json({
      success: true,
      summary: buildSummary(filtered),
      rows: enriched,
      data: enriched,
      total: filtered.length,
      offset,
      limit,
    });
  } catch (error) {
    console.error('Error in GET /api/admin/research/evidence:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await request.json() as EvidencePayload;
    const payload = buildPayload(body, admin.email ?? 'admin', false);
    if (isPayloadError(payload)) return NextResponse.json({ error: payload.error }, { status: payload.status });

    const { data, error } = await adminDb.from('research_evidence_items').insert(payload);
    if (error) {
      console.error('Error creating research evidence item:', error);
      return NextResponse.json({ error: 'Failed to save research evidence item' }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const rows = await enrichRows([toClientEvidence(row as ResearchEvidenceItem)]);
    return NextResponse.json({ success: true, data: rows[0], message: 'Research evidence item saved successfully' }, { status: 201 });
  } catch (error) {
    console.error('Error in POST /api/admin/research/evidence:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const body = await request.json() as EvidencePayload;
    const id = body.id ?? searchParams.get('id') ?? undefined;
    if (!id || !isUuid(id)) return NextResponse.json({ error: 'Missing or invalid id' }, { status: 400 });

    const payload = buildPayload(body, admin.email ?? 'admin', true);
    if (isPayloadError(payload)) return NextResponse.json({ error: payload.error }, { status: payload.status });

    const { data, error } = await adminDb
      .from('research_evidence_items')
      .eq('id', id)
      .update(payload);

    if (error) {
      console.error('Error updating research evidence item:', error);
      return NextResponse.json({ error: 'Failed to update research evidence item' }, { status: 500 });
    }

    const row = Array.isArray(data) ? data[0] : data;
    const rows = await enrichRows([toClientEvidence(row as ResearchEvidenceItem)]);
    return NextResponse.json({ success: true, data: rows[0], message: 'Research evidence item updated successfully' });
  } catch (error) {
    console.error('Error in PUT /api/admin/research/evidence:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function fetchLedgerEvidence(
  filters: {
    userId?: string;
    courseId?: string;
    sessionId?: string;
    sourceType?: EvidenceSourceType;
    rmFocus?: RmFocus;
    codingStatus?: EvidenceCodingStatus;
    validityStatus?: ResearchValidityStatus;
  },
  limit: number,
  offset: number,
) {
  try {
    let query = adminDb.from('research_evidence_items').select('*');
    if (filters.userId) query = query.eq('user_id', filters.userId);
    if (filters.courseId) query = query.eq('course_id', filters.courseId);
    if (filters.sessionId) query = query.eq('learning_session_id', filters.sessionId);
    if (filters.sourceType) query = query.eq('source_type', filters.sourceType);
    if (filters.rmFocus) query = query.eq('rm_focus', filters.rmFocus);
    if (filters.codingStatus) query = query.eq('coding_status', filters.codingStatus);
    if (filters.validityStatus) query = query.eq('research_validity_status', filters.validityStatus);
    query = query.order('created_at', { ascending: false }).range(offset, offset + Math.max(limit * 3, 250) - 1);
    const { data, error } = await query;
    if (error) {
      console.warn('Research evidence table unavailable or query failed:', error);
      return [];
    }
    return (data ?? []).map((row: unknown) => toClientEvidence(row as ResearchEvidenceItem));
  } catch (error) {
    console.warn('Research evidence fetch fallback:', error);
    return [];
  }
}

async function collectRawEvidence(
  filters: {
    userId?: string;
    courseId?: string;
    sessionId?: string;
    sourceType?: EvidenceSourceType;
  },
  limit: number,
) {
  const selectedSources = filters.sourceType ? [filters.sourceType] : [...EVIDENCE_SOURCE_TYPES].filter((value) => value !== 'manual_note');
  const tasks: Promise<ClientEvidenceItem[]>[] = [];

  if (selectedSources.includes('ask_question')) tasks.push(fetchAskEvidence(filters, limit));
  if (selectedSources.includes('challenge_response')) tasks.push(fetchChallengeEvidence(filters, limit));
  if (selectedSources.includes('quiz_submission')) tasks.push(fetchQuizEvidence(filters, limit));
  if (selectedSources.includes('journal')) tasks.push(fetchJournalEvidence(filters, limit));
  if (selectedSources.includes('discussion')) tasks.push(fetchDiscussionEvidence(filters, limit));
  if (selectedSources.includes('artifact')) tasks.push(fetchArtifactEvidence(filters, limit));

  const groups = await Promise.all(tasks);
  return groups.flat();
}

async function fetchAskEvidence(filters: { userId?: string; courseId?: string; sessionId?: string }, limit: number) {
  let query = adminDb
    .from('ask_question_history')
    .select('id, user_id, course_id, learning_session_id, session_number, prompt_stage, question, answer, stage_confidence, research_validity_status, coding_status, researcher_notes, raw_evidence_snapshot, data_collection_week, created_at');
  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.courseId) query = query.eq('course_id', filters.courseId);
  if (filters.sessionId) query = query.eq('learning_session_id', filters.sessionId);
  query = query.order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as AskSourceRow[]).map((row) => ({
    id: row.id,
    source_type: 'ask_question' as const,
    source_id: row.id,
    source_table: 'ask_question_history',
    user_id: row.user_id,
    course_id: row.course_id ?? null,
    learning_session_id: row.learning_session_id ?? null,
    prompt_classification_id: null,
    rm_focus: 'RM2_RM3' as const,
    indicator_code: null,
    prompt_stage: row.prompt_stage ? normalizePromptStage(row.prompt_stage) : null,
    unit_sequence: row.session_number ?? null,
    evidence_title: truncate(row.question, 120),
    evidence_text: row.question ?? null,
    ai_response_text: row.answer ?? null,
    artifact_text: null,
    evidence_status: 'raw' as const,
    coding_status: normalizeCodingStatus(row.coding_status) ?? 'uncoded',
    research_validity_status: normalizeValidityStatus(row.research_validity_status) ?? 'valid',
    triangulation_status: null,
    data_collection_week: row.data_collection_week ?? null,
    auto_confidence: normalizeNumber(row.stage_confidence),
    evidence_source_summary: 'Prompt log dan jawaban AI',
    researcher_notes: row.researcher_notes ?? null,
    raw_evidence_snapshot: row.raw_evidence_snapshot ?? null,
    metadata: {},
    coded_by: null,
    coded_at: null,
    reviewed_by: null,
    reviewed_at: null,
    is_auto_generated: true,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.created_at ?? new Date().toISOString(),
    source_label: 'Prompt',
    text_preview: truncate(row.question ?? '', 180),
  }));
}

async function fetchChallengeEvidence(filters: { userId?: string; courseId?: string; sessionId?: string }, limit: number) {
  let query = adminDb
    .from('challenge_responses')
    .select('id, user_id, course_id, learning_session_id, question, answer, feedback, reasoning_note, research_validity_status, coding_status, researcher_notes, raw_evidence_snapshot, data_collection_week, created_at');
  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.courseId) query = query.eq('course_id', filters.courseId);
  if (filters.sessionId) query = query.eq('learning_session_id', filters.sessionId);
  query = query.order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as ChallengeSourceRow[]).map((row) => ({
    id: row.id,
    source_type: 'challenge_response' as const,
    source_id: row.id,
    source_table: 'challenge_responses',
    user_id: row.user_id,
    course_id: row.course_id ?? null,
    learning_session_id: row.learning_session_id ?? null,
    prompt_classification_id: null,
    rm_focus: 'RM3' as const,
    indicator_code: null,
    prompt_stage: null,
    unit_sequence: null,
    evidence_title: truncate(row.question, 120),
    evidence_text: row.question ?? null,
    ai_response_text: row.answer ?? null,
    artifact_text: row.feedback ?? null,
    evidence_status: 'raw' as const,
    coding_status: normalizeCodingStatus(row.coding_status) ?? 'uncoded',
    research_validity_status: normalizeValidityStatus(row.research_validity_status) ?? 'valid',
    triangulation_status: null,
    data_collection_week: row.data_collection_week ?? null,
    auto_confidence: null,
    evidence_source_summary: 'Challenge response',
    researcher_notes: row.researcher_notes ?? row.reasoning_note ?? null,
    raw_evidence_snapshot: row.raw_evidence_snapshot ?? null,
    metadata: { feedback: row.feedback ?? null },
    coded_by: null,
    coded_at: null,
    reviewed_by: null,
    reviewed_at: null,
    is_auto_generated: true,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.created_at ?? new Date().toISOString(),
    source_label: 'Challenge',
    text_preview: truncate(row.question ?? '', 180),
  }));
}

async function fetchQuizEvidence(filters: { userId?: string; courseId?: string; sessionId?: string }, limit: number) {
  let query = adminDb
    .from('quiz_submissions')
    .select('id, user_id, course_id, learning_session_id, quiz_id, answer, is_correct, reasoning_note, research_validity_status, coding_status, researcher_notes, raw_evidence_snapshot, data_collection_week, created_at');
  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.courseId) query = query.eq('course_id', filters.courseId);
  if (filters.sessionId) query = query.eq('learning_session_id', filters.sessionId);
  query = query.order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await query;
  if (error) return [];

  const rows = (data ?? []) as QuizSourceRow[];
  const quizIds = Array.from(new Set(rows.map((row) => row.quiz_id).filter((value): value is string => Boolean(value))));
  const { data: quizData } = quizIds.length > 0
    ? await adminDb.from('quiz').select('id, question, correct_answer').in('id', quizIds)
    : { data: [] };
  const quizMap = new Map<string, { question?: string | null; correct_answer?: string | null }>(
    (quizData ?? []).map((row: { id: string; question?: string | null; correct_answer?: string | null }) => [row.id, row]),
  );

  return rows.map((row) => {
    const quiz = row.quiz_id ? quizMap.get(row.quiz_id) : null;
    return {
      id: row.id,
      source_type: 'quiz_submission' as const,
      source_id: row.id,
      source_table: 'quiz_submissions',
      user_id: row.user_id,
      course_id: row.course_id ?? null,
      learning_session_id: row.learning_session_id ?? null,
      prompt_classification_id: null,
      rm_focus: 'RM3' as const,
      indicator_code: null,
      prompt_stage: null,
      unit_sequence: null,
      evidence_title: truncate(quiz?.question, 120),
      evidence_text: quiz?.question ?? null,
      ai_response_text: row.answer ?? null,
      artifact_text: null,
      evidence_status: 'raw' as const,
      coding_status: normalizeCodingStatus(row.coding_status) ?? 'uncoded',
      research_validity_status: normalizeValidityStatus(row.research_validity_status) ?? 'valid',
      triangulation_status: null,
      data_collection_week: row.data_collection_week ?? null,
      auto_confidence: null,
      evidence_source_summary: 'Quiz submission',
      researcher_notes: row.researcher_notes ?? row.reasoning_note ?? null,
      raw_evidence_snapshot: row.raw_evidence_snapshot ?? {
        student_answer: row.answer ?? null,
        is_correct: row.is_correct ?? null,
        correct_answer: quiz?.correct_answer ?? null,
      },
      metadata: { is_correct: row.is_correct ?? null, correct_answer: quiz?.correct_answer ?? null },
      coded_by: null,
      coded_at: null,
      reviewed_by: null,
      reviewed_at: null,
      is_auto_generated: true,
      created_at: row.created_at ?? new Date().toISOString(),
      updated_at: row.created_at ?? new Date().toISOString(),
      source_label: 'Quiz',
      text_preview: truncate(quiz?.question ?? '', 180),
    };
  });
}

async function fetchJournalEvidence(filters: { userId?: string; courseId?: string; sessionId?: string }, limit: number) {
  let query = adminDb
    .from('jurnal')
    .select('id, user_id, course_id, learning_session_id, content, reflection, type, research_validity_status, coding_status, researcher_notes, raw_evidence_snapshot, data_collection_week, created_at');
  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.courseId) query = query.eq('course_id', filters.courseId);
  if (filters.sessionId) query = query.eq('learning_session_id', filters.sessionId);
  query = query.order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as JournalSourceRow[]).map((row) => ({
    id: row.id,
    source_type: 'journal' as const,
    source_id: row.id,
    source_table: 'jurnal',
    user_id: row.user_id,
    course_id: row.course_id ?? null,
    learning_session_id: row.learning_session_id ?? null,
    prompt_classification_id: null,
    rm_focus: 'RM2_RM3' as const,
    indicator_code: null,
    prompt_stage: null,
    unit_sequence: null,
    evidence_title: truncate(row.type ?? 'Jurnal refleksi', 120),
    evidence_text: row.content ?? null,
    ai_response_text: null,
    artifact_text: row.reflection ?? null,
    evidence_status: 'raw' as const,
    coding_status: normalizeCodingStatus(row.coding_status) ?? 'uncoded',
    research_validity_status: normalizeValidityStatus(row.research_validity_status) ?? 'valid',
    triangulation_status: null,
    data_collection_week: row.data_collection_week ?? null,
    auto_confidence: null,
    evidence_source_summary: 'Jurnal/refleksi',
    researcher_notes: row.researcher_notes ?? null,
    raw_evidence_snapshot: row.raw_evidence_snapshot ?? null,
    metadata: { reflection: row.reflection ?? null, type: row.type ?? null },
    coded_by: null,
    coded_at: null,
    reviewed_by: null,
    reviewed_at: null,
    is_auto_generated: true,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.created_at ?? new Date().toISOString(),
    source_label: 'Jurnal',
    text_preview: truncate(row.content ?? '', 180),
  }));
}

async function fetchDiscussionEvidence(filters: { userId?: string; courseId?: string; sessionId?: string }, limit: number) {
  let query = adminDb
    .from('discussion_messages')
    .select('id, content, role, metadata, created_at, learning_session_id, research_validity_status, coding_status, researcher_notes, raw_evidence_snapshot, data_collection_week, discussion_sessions:session_id(user_id, course_id, learning_session_id)');
  if (filters.sessionId) query = query.eq('learning_session_id', filters.sessionId);
  query = query.order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as DiscussionSourceRow[])
    .filter((row) => {
      const userId = row.discussion_sessions?.user_id ?? null;
      const courseId = row.discussion_sessions?.course_id ?? null;
      if (filters.userId && userId !== filters.userId) return false;
      if (filters.courseId && courseId !== filters.courseId) return false;
      return true;
    })
    .map((row) => ({
      id: row.id,
      source_type: 'discussion' as const,
      source_id: row.id,
      source_table: 'discussion_messages',
      user_id: row.discussion_sessions?.user_id ?? '',
      course_id: row.discussion_sessions?.course_id ?? null,
      learning_session_id: row.learning_session_id ?? row.discussion_sessions?.learning_session_id ?? null,
      prompt_classification_id: null,
      rm_focus: 'RM2_RM3' as const,
      indicator_code: null,
      prompt_stage: null,
      unit_sequence: null,
      evidence_title: truncate(row.role ?? 'discussion', 120),
      evidence_text: row.content ?? null,
      ai_response_text: null,
      artifact_text: null,
      evidence_status: 'raw' as const,
      coding_status: normalizeCodingStatus(row.coding_status) ?? 'uncoded',
      research_validity_status: normalizeValidityStatus(row.research_validity_status) ?? 'valid',
      triangulation_status: null,
      data_collection_week: row.data_collection_week ?? null,
      auto_confidence: null,
      evidence_source_summary: 'Discussion transcript',
      researcher_notes: row.researcher_notes ?? null,
      raw_evidence_snapshot: row.raw_evidence_snapshot ?? row.metadata ?? null,
      metadata: row.metadata ?? {},
      coded_by: null,
      coded_at: null,
      reviewed_by: null,
      reviewed_at: null,
      is_auto_generated: true,
      created_at: row.created_at ?? new Date().toISOString(),
      updated_at: row.created_at ?? new Date().toISOString(),
      source_label: 'Diskusi',
      text_preview: truncate(row.content ?? '', 180),
    }))
    .filter((row) => Boolean(row.user_id));
}

async function fetchArtifactEvidence(filters: { userId?: string; courseId?: string; sessionId?: string }, limit: number) {
  let query = adminDb
    .from('research_artifacts')
    .select('id, user_id, course_id, learning_session_id, artifact_type, artifact_title, artifact_content, file_name, file_url, evidence_status, coding_status, research_validity_status, assessment_notes, artifact_metadata, data_collection_week, created_at');
  if (filters.userId) query = query.eq('user_id', filters.userId);
  if (filters.courseId) query = query.eq('course_id', filters.courseId);
  if (filters.sessionId) query = query.eq('learning_session_id', filters.sessionId);
  query = query.order('created_at', { ascending: false }).limit(limit);
  const { data, error } = await query;
  if (error) return [];
  return ((data ?? []) as ArtifactSourceRow[]).map((row) => ({
    id: row.id,
    source_type: 'artifact' as const,
    source_id: row.id,
    source_table: 'research_artifacts',
    user_id: row.user_id,
    course_id: row.course_id ?? null,
    learning_session_id: row.learning_session_id ?? null,
    prompt_classification_id: null,
    rm_focus: 'RM3' as const,
    indicator_code: null,
    prompt_stage: null,
    unit_sequence: null,
    evidence_title: row.artifact_title ?? row.file_name ?? row.artifact_type ?? 'Artefak',
    evidence_text: row.artifact_content ?? null,
    ai_response_text: row.file_url ?? null,
    artifact_text: row.artifact_content ?? null,
    evidence_status: normalizeEvidenceStatus(row.evidence_status) ?? 'raw',
    coding_status: normalizeCodingStatus(row.coding_status) ?? 'manual_coded',
    research_validity_status: normalizeValidityStatus(row.research_validity_status) ?? 'valid',
    triangulation_status: null,
    data_collection_week: row.data_collection_week ?? null,
    auto_confidence: null,
    evidence_source_summary: 'Artefak solusi',
    researcher_notes: row.assessment_notes ?? null,
    raw_evidence_snapshot: row.artifact_metadata ?? null,
    metadata: { file_name: row.file_name ?? null, file_url: row.file_url ?? null, artifact_type: row.artifact_type ?? null },
    coded_by: null,
    coded_at: null,
    reviewed_by: null,
    reviewed_at: null,
    is_auto_generated: true,
    created_at: row.created_at ?? new Date().toISOString(),
    updated_at: row.created_at ?? new Date().toISOString(),
    source_label: 'Artefak',
    text_preview: truncate(row.artifact_content ?? row.artifact_title ?? '', 180),
  }));
}

function mergeEvidenceRows(rawRows: ClientEvidenceItem[], ledgerRows: ClientEvidenceItem[]) {
  const merged = new Map<string, ClientEvidenceItem>();

  rawRows.forEach((row) => {
    merged.set(rowKey(row), row);
  });

  ledgerRows.forEach((row) => {
    const key = rowKey(row);
    const current = merged.get(key);
    merged.set(key, {
      ...(current ?? {}),
      ...row,
      source_label: row.source_label || current?.source_label || sourceLabel(row.source_type),
      text_preview: row.text_preview || current?.text_preview || buildPreview(row),
      evidence_text: row.evidence_text ?? current?.evidence_text ?? null,
      ai_response_text: row.ai_response_text ?? current?.ai_response_text ?? null,
      artifact_text: row.artifact_text ?? current?.artifact_text ?? null,
      raw_evidence_snapshot: row.raw_evidence_snapshot ?? current?.raw_evidence_snapshot ?? null,
      metadata: row.metadata ?? current?.metadata ?? {},
    });
  });

  return Array.from(merged.values()).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function applyFilters(
  rows: ClientEvidenceItem[],
  filters: {
    sourceType?: EvidenceSourceType;
    rmFocus?: RmFocus;
    codingStatus?: EvidenceCodingStatus;
    validityStatus?: ResearchValidityStatus;
    search?: string;
  },
) {
  return rows.filter((row) => {
    if (filters.sourceType && row.source_type !== filters.sourceType) return false;
    if (filters.rmFocus && row.rm_focus !== filters.rmFocus) return false;
    if (filters.codingStatus && row.coding_status !== filters.codingStatus) return false;
    if (filters.validityStatus && row.research_validity_status !== filters.validityStatus) return false;
    if (filters.search) {
      const haystack = [
        row.evidence_title,
        row.evidence_text,
        row.ai_response_text,
        row.artifact_text,
        row.researcher_notes,
        row.indicator_code,
        row.prompt_stage,
      ].filter(Boolean).join(' ').toLowerCase();
      if (!haystack.includes(filters.search)) return false;
    }
    return true;
  });
}

async function enrichRows(rows: ClientEvidenceItem[]) {
  if (rows.length === 0) return rows;

  const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter(Boolean)));
  const sessionIds = Array.from(new Set(rows.map((row) => row.learning_session_id).filter((value): value is string => Boolean(value))));

  const [{ data: users }, { data: sessions }] = await Promise.all([
    userIds.length > 0
      ? adminDb.from('users').select('id, name, email').in('id', userIds)
      : Promise.resolve({ data: [] }),
    sessionIds.length > 0
      ? adminDb.from('learning_sessions').select('id, session_number').in('id', sessionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const usersById = new Map<string, { id: string; name?: string | null; email?: string | null }>(
    (users ?? []).map((row: { id: string; name?: string | null; email?: string | null }) => [row.id, row]),
  );
  const sessionsById = new Map<string, { id: string; session_number?: number | null }>(
    (sessions ?? []).map((row: { id: string; session_number?: number | null }) => [row.id, row]),
  );

  return rows.map((row, index) => {
    const user = usersById.get(row.user_id);
    const session = row.learning_session_id ? sessionsById.get(row.learning_session_id) : null;
    return {
      ...row,
      student_name: user?.name ?? user?.email ?? `Siswa ${formatAnonParticipant(index)}`,
      student_email: user?.email ?? null,
      anonymous_id: formatAnonParticipant(index),
      session_number: session?.session_number ?? null,
      source_label: row.source_label || sourceLabel(row.source_type),
      text_preview: row.text_preview || buildPreview(row),
    };
  });
}

function buildSummary(rows: ClientEvidenceItem[]) {
  const bySource = Object.fromEntries(EVIDENCE_SOURCE_TYPES.map((key) => [key, 0])) as Record<string, number>;
  const byFocus = { RM2: 0, RM3: 0, RM2_RM3: 0 } as Record<RmFocus, number>;
  const byCodingStatus = { uncoded: 0, auto_coded: 0, manual_coded: 0, reviewed: 0 } as Record<EvidenceCodingStatus, number>;
  const byValidity = { valid: 0, low_information: 0, duplicate: 0, excluded: 0, manual_note: 0 } as Record<ResearchValidityStatus, number>;

  rows.forEach((row) => {
    bySource[row.source_type] = (bySource[row.source_type] || 0) + 1;
    byFocus[row.rm_focus] += 1;
    byCodingStatus[row.coding_status] += 1;
    byValidity[row.research_validity_status] += 1;
  });

  return {
    total_items: rows.length,
    coded_items: rows.filter((row) => row.coding_status !== 'uncoded').length,
    review_needed: rows.filter((row) => row.coding_status === 'uncoded' || row.evidence_status === 'needs_review').length,
    by_source: bySource,
    by_focus: byFocus,
    by_coding_status: byCodingStatus,
    by_validity: byValidity,
  };
}

function buildPayload(body: EvidencePayload, adminEmail: string, partial: boolean) {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (!partial || body.source_type !== undefined) {
    const sourceType = normalizeSourceFilter(body.source_type ?? 'manual_note');
    if (!sourceType) return { error: 'Invalid source_type', status: 400 };
    payload.source_type = sourceType;
  }

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
  if (body.source_id !== undefined) {
    if (body.source_id && !isUuid(body.source_id)) return { error: 'Invalid source_id', status: 400 };
    payload.source_id = body.source_id || null;
  }

  if (body.source_table !== undefined) payload.source_table = body.source_table || null;
  if (body.rm_focus !== undefined) payload.rm_focus = normalizeRmFocus(body.rm_focus) ?? 'RM2_RM3';
  if (body.indicator_code !== undefined) payload.indicator_code = body.indicator_code || null;
  if (body.prompt_stage !== undefined) payload.prompt_stage = body.prompt_stage ? normalizePromptStage(body.prompt_stage) : null;
  if (body.unit_sequence !== undefined) payload.unit_sequence = normalizeInteger(body.unit_sequence);
  if (body.evidence_title !== undefined) payload.evidence_title = body.evidence_title || null;
  if (body.evidence_text !== undefined) payload.evidence_text = body.evidence_text || null;
  if (body.ai_response_text !== undefined) payload.ai_response_text = body.ai_response_text || null;
  if (body.artifact_text !== undefined) payload.artifact_text = body.artifact_text || null;
  if (body.evidence_status !== undefined) payload.evidence_status = normalizeEvidenceStatus(body.evidence_status) ?? 'raw';
  if (body.coding_status !== undefined) payload.coding_status = normalizeCodingStatus(body.coding_status) ?? 'uncoded';
  if (body.research_validity_status !== undefined) payload.research_validity_status = normalizeValidityStatus(body.research_validity_status) ?? 'valid';
  if (body.triangulation_status !== undefined) payload.triangulation_status = body.triangulation_status || null;
  if (body.data_collection_week !== undefined) payload.data_collection_week = body.data_collection_week || null;
  if (body.auto_confidence !== undefined) payload.auto_confidence = normalizeNumber(body.auto_confidence);
  if (body.evidence_source_summary !== undefined) payload.evidence_source_summary = body.evidence_source_summary || null;
  if (body.researcher_notes !== undefined) payload.researcher_notes = body.researcher_notes || null;
  if (body.raw_evidence_snapshot !== undefined) payload.raw_evidence_snapshot = body.raw_evidence_snapshot ?? {};
  if (body.metadata !== undefined) payload.metadata = body.metadata ?? {};

  if (!partial) {
    payload.is_auto_generated = body.is_auto_generated ?? false;
    payload.coded_by = body.coded_by ?? adminEmail;
    payload.created_at = new Date().toISOString();
  }

  if (body.coding_status === 'reviewed' || body.reviewed_by) {
    payload.reviewed_by = body.reviewed_by ?? adminEmail;
    payload.reviewed_at = new Date().toISOString();
  }

  if (body.coding_status && body.coding_status !== 'uncoded') {
    payload.coded_by = body.coded_by ?? adminEmail;
    payload.coded_at = new Date().toISOString();
  }

  return payload;
}

function toClientEvidence(row: ResearchEvidenceItem): ClientEvidenceItem {
  return {
    ...row,
    source_label: sourceLabel(row.source_type),
    text_preview: buildPreview(row),
    raw_evidence_snapshot: asObject(row.raw_evidence_snapshot),
    metadata: asObject(row.metadata),
  };
}

function sourceLabel(sourceType: EvidenceSourceType) {
  switch (sourceType) {
    case 'ask_question': return 'Prompt';
    case 'challenge_response': return 'Challenge';
    case 'quiz_submission': return 'Quiz';
    case 'journal': return 'Jurnal';
    case 'discussion': return 'Diskusi';
    case 'artifact': return 'Artefak';
    case 'observation': return 'Observasi';
    case 'manual_note': return 'Catatan Manual';
    default: return sourceType;
  }
}

function buildPreview(row: Partial<ClientEvidenceItem>) {
  return truncate(row.evidence_text || row.artifact_text || row.ai_response_text || row.evidence_title || '', 180);
}

function rowKey(row: Pick<ClientEvidenceItem, 'id' | 'source_type' | 'source_id' | 'source_table'>) {
  return `${row.source_type}:${row.source_table ?? 'ledger'}:${row.source_id ?? row.id}`;
}

function normalizeSourceFilter(value: unknown): EvidenceSourceType | undefined {
  if (!value) return undefined;
  const normalized = normalizeSourceType(value);
  return normalized === 'manual_entry' ? 'manual_note' : normalized as EvidenceSourceType;
}

function normalizeRmFocus(value: unknown): RmFocus | undefined {
  const raw = String(value ?? '').trim().toUpperCase();
  if (!raw) return undefined;
  if (raw === 'RM2') return 'RM2';
  if (raw === 'RM3') return 'RM3';
  if (raw === 'RM2_RM3' || raw === 'RM2+RM3' || raw === 'BOTH') return 'RM2_RM3';
  return undefined;
}

function normalizeCodingStatus(value: unknown): EvidenceCodingStatus | undefined {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === 'auto' || raw === 'auto_coded') return 'auto_coded';
  if (raw === 'manual' || raw === 'manual_coded') return 'manual_coded';
  if (raw === 'reviewed' || raw === 'review') return 'reviewed';
  if (raw === 'uncoded' || raw === 'raw') return 'uncoded';
  return undefined;
}

function normalizeValidityStatus(value: unknown): ResearchValidityStatus | undefined {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === 'valid') return 'valid';
  if (raw === 'low_information' || raw === 'low info') return 'low_information';
  if (raw === 'duplicate') return 'duplicate';
  if (raw === 'excluded' || raw === 'invalid_for_analysis') return 'excluded';
  if (raw === 'manual_note' || raw === 'manual note') return 'manual_note';
  return undefined;
}

function normalizeEvidenceStatus(value: unknown): EvidenceStatus | undefined {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return undefined;
  if (raw === 'raw') return 'raw';
  if (raw === 'coded') return 'coded';
  if (raw === 'triangulated') return 'triangulated';
  if (raw === 'excluded') return 'excluded';
  if (raw === 'needs_review' || raw === 'review') return 'needs_review';
  return undefined;
}

function normalizeInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed) : null;
}

function normalizeNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : null;
}

function truncate(value: string | null | undefined, maxLength: number) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text.length <= maxLength ? text : `${text.slice(0, maxLength - 1)}...`;
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function isPayloadError(value: Record<string, unknown> | { error: string; status: number }): value is { error: string; status: number } {
  return typeof (value as { error?: unknown }).error === 'string' && typeof (value as { status?: unknown }).status === 'number';
}
