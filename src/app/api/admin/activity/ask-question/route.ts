// src/app/api/admin/activity/ask-question/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { adminDb, DatabaseService } from '@/lib/database';
import { ensureAskQuestionHistorySeeded } from '@/lib/activitySeed';
import { withProtection } from '@/lib/api-middleware';
import { normalizeMicroMarkers } from '@/lib/research-normalizers';

interface AskQuestionHistory {
  id: string;
  user_id: string | null;
  course_id: string | null;
  module_index: number | null;
  subtopic_index: number | null;
  page_number: number | null;
  subtopic_label: string | null;
  question: string;
  answer: string;
  prompt_components?: Record<string, unknown>;
  reasoning_note?: string | null;
  learning_session_id?: string | null;
  session_number?: number | null;
  prompt_stage?: string | null;
  stage_confidence?: number | string | null;
  micro_markers?: unknown;
  coding_status?: string | null;
  research_validity_status?: string | null;
  researcher_notes?: string | null;
  raw_evidence_snapshot?: Record<string, unknown> | null;
  data_collection_week?: string | null;
  is_follow_up?: boolean | null;
  created_at: string;
}

interface User {
  id: string;
  email: string | null;
}

interface Course {
  id: string;
  title: string | null;
}

interface ResearchEvidenceRow {
  id: string;
  source_id?: string | null;
  prompt_id?: string | null;
  source_type?: string | null;
  prompt_source?: string | null;
  coding_status?: string | null;
  research_validity_status?: string | null;
  validity_status?: string | null;
  researcher_notes?: string | null;
  data_collection_week?: string | null;
  raw_evidence_snapshot?: Record<string, unknown> | null;
  evidence_text?: string | null;
  evidence_excerpt?: string | null;
  summary_excerpt?: string | null;
  created_at?: string | null;
  metadata?: Record<string, unknown> | null;
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01']);
const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204']);
type QueryBuilder = ReturnType<typeof adminDb.from>;

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function isMissingTableError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code ? MISSING_TABLE_CODES.has(code) : false;
}

function isSchemaGapError(error: unknown): boolean {
  const code = getErrorCode(error);
  return code ? MISSING_TABLE_CODES.has(code) || MISSING_COLUMN_CODES.has(code) : false;
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function firstObject(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (!value) continue;
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>;
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>;
        }
      } catch {
        // Ignore invalid JSON fallback.
      }
    }
  }
  return null;
}

function toBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true') return true;
    if (normalized === 'false') return false;
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function buildDateRange(dateFromValue?: string | null, dateToValue?: string | null) {
  const fromValue = dateFromValue?.trim() || '';
  const toValue = dateToValue?.trim() || fromValue;
  if (!fromValue && !toValue) return null;

  const startSource = fromValue || toValue;
  const endSource = toValue || fromValue;
  const start = new Date(startSource);
  const end = new Date(endSource);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function getEvidenceSourceId(row: ResearchEvidenceRow): string | null {
  const directId = firstString(row.source_id, row.prompt_id);
  if (directId) return directId;

  const metadata = firstObject(row.metadata);
  return firstString(metadata?.source_id, metadata?.prompt_id);
}

async function fetchAskQuestionEvidence(promptIds: string[]): Promise<Map<string, ResearchEvidenceRow[]>> {
  if (promptIds.length === 0) {
    return new Map();
  }

  const attempts: Array<() => QueryBuilder> = [
    () =>
      adminDb
        .from('research_evidence_items')
        .select('*')
        .eq('source_type', 'ask_question')
        .in('source_id', promptIds)
        .order('created_at', { ascending: true }),
    () =>
      adminDb
        .from('research_evidence_items')
        .select('*')
        .in('source_id', promptIds)
        .order('created_at', { ascending: true }),
    () =>
      adminDb
        .from('research_evidence_items')
        .select('*')
        .eq('prompt_source', 'ask_question')
        .in('prompt_id', promptIds)
        .order('created_at', { ascending: true }),
    () =>
      adminDb
        .from('research_evidence_items')
        .select('*')
        .in('prompt_id', promptIds)
        .order('created_at', { ascending: true }),
  ];

  for (const attempt of attempts) {
    const { data, error } = await attempt();

    if (error) {
      if (isMissingTableError(error)) {
        return new Map();
      }
      if (isSchemaGapError(error)) {
        continue;
      }
      console.warn('[Activity][AskQuestion] Failed to fetch research evidence:', error);
      return new Map();
    }

    const evidenceMap = new Map<string, ResearchEvidenceRow[]>();
    const rows = (Array.isArray(data) ? data : []) as ResearchEvidenceRow[];

    for (const row of rows) {
      const sourceId = getEvidenceSourceId(row);
      if (!sourceId || !promptIds.includes(sourceId)) {
        continue;
      }

      if (!evidenceMap.has(sourceId)) {
        evidenceMap.set(sourceId, []);
      }
      evidenceMap.get(sourceId)?.push(row);
    }

    return evidenceMap;
  }

  return new Map();
}

async function handler(req: NextRequest) {
  try {
    await ensureAskQuestionHistorySeeded();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const date = searchParams.get('date');
    const dateFrom = searchParams.get('dateFrom') ?? date;
    const dateTo = searchParams.get('dateTo');
    const courseId = searchParams.get('course');
    const topic = searchParams.get('topic');

    let records: AskQuestionHistory[] = [];
    try {
      records = await DatabaseService.getRecords<AskQuestionHistory>('ask_question_history', {
        orderBy: { column: 'created_at', ascending: false },
      });
    } catch (error) {
      console.error('[Activity][AskQuestion] Failed to fetch ask_question_history:', error);
      return NextResponse.json([], { status: 200 });
    }

    if (userId) {
      records = records.filter((row) => row.user_id === userId);
    }

    if (courseId) {
      records = records.filter((row) => row.course_id === courseId);
    }

    const dateRange = buildDateRange(dateFrom, dateTo);
    if (dateRange) {
      records = records.filter((row) => {
        const createdAt = new Date(row.created_at);
        return createdAt >= dateRange.start && createdAt <= dateRange.end;
      });
    }

    const evidenceByPromptId = await fetchAskQuestionEvidence(records.map((record) => record.id));

    const userCache = new Map<string, User | null>();
    const courseCache = new Map<string, Course | null>();

    async function getUser(userIdValue?: string | null) {
      if (!userIdValue) return null;
      if (userCache.has(userIdValue)) return userCache.get(userIdValue) ?? null;
      const users = await DatabaseService.getRecords<User>('users', {
        filter: { id: userIdValue },
        limit: 1,
      });
      const user = users[0] ?? null;
      userCache.set(userIdValue, user);
      return user;
    }

    async function getCourse(courseIdValue?: string | null) {
      if (!courseIdValue) return null;
      if (courseCache.has(courseIdValue)) return courseCache.get(courseIdValue) ?? null;
      const courses = await DatabaseService.getRecords<Course>('courses', {
        filter: { id: courseIdValue },
        limit: 1,
      });
      const course = courses[0] ?? null;
      courseCache.set(courseIdValue, course);
      return course;
    }

    const payload = [];
    for (const record of records) {
      const topicLabel =
        record.subtopic_label ||
        `Module ${Number(record.module_index ?? 0) + 1}, Subtopic ${Number(record.subtopic_index ?? 0) + 1}`;

      if (topic && !topicLabel.toLowerCase().includes(topic.toLowerCase())) {
        continue;
      }

      const [user, course] = await Promise.all([getUser(record.user_id), getCourse(record.course_id)]);
      const evidenceRecords = evidenceByPromptId.get(record.id) ?? [];
      const codingStatus =
        firstString(record.coding_status) ??
        firstString(...evidenceRecords.map((item) => item.coding_status));
      const researchValidityStatus =
        firstString(record.research_validity_status) ??
        firstString(...evidenceRecords.map((item) => item.research_validity_status ?? item.validity_status));
      const researcherNotes =
        firstString(record.researcher_notes) ??
        firstString(...evidenceRecords.map((item) => item.researcher_notes));
      const dataCollectionWeek =
        firstString(record.data_collection_week) ??
        firstString(...evidenceRecords.map((item) => item.data_collection_week));
      const rawEvidenceSnapshot =
        firstObject(record.raw_evidence_snapshot) ??
        firstObject(...evidenceRecords.map((item) => item.raw_evidence_snapshot), ...evidenceRecords.map((item) => item.metadata));

      payload.push({
        id: record.id,
        timestamp: new Date(record.created_at).toLocaleString('id-ID', DATE_OPTIONS),
        userEmail: user?.email ?? 'Unknown User',
        userId: record.user_id ?? 'unknown',
        topic: topicLabel,
        courseTitle: course?.title ?? 'Tanpa Kursus',
        question: record.question,
        answer: record.answer,
        promptComponents: record.prompt_components ?? null,
        reasoningNote: record.reasoning_note ?? '',
        moduleIndex: record.module_index ?? 0,
        subtopicIndex: record.subtopic_index ?? 0,
        pageNumber: record.page_number ?? 0,
        promptStage: firstString(record.prompt_stage),
        stageConfidence: toNumber(record.stage_confidence),
        microMarkers: normalizeMicroMarkers(record.micro_markers),
        learningSessionId: record.learning_session_id ?? null,
        isFollowUp: toBoolean(record.is_follow_up),
        codingStatus: codingStatus ?? null,
        researchValidityStatus: researchValidityStatus ?? null,
        researcherNotes: researcherNotes ?? null,
        dataCollectionWeek: dataCollectionWeek ?? null,
        rawEvidenceSnapshot,
        evidenceCount: evidenceRecords.length,
        evidenceRecords: evidenceRecords.map((item) => ({
          id: item.id,
          sourceId: getEvidenceSourceId(item),
          sourceType: firstString(item.source_type, item.prompt_source),
          codingStatus: firstString(item.coding_status),
          researchValidityStatus: firstString(item.research_validity_status, item.validity_status),
          researcherNotes: firstString(item.researcher_notes),
          dataCollectionWeek: firstString(item.data_collection_week),
          evidenceText: firstString(item.evidence_excerpt, item.summary_excerpt, item.evidence_text),
          rawEvidenceSnapshot: firstObject(item.raw_evidence_snapshot, item.metadata),
          createdAt: firstString(item.created_at),
        })),
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[Activity][AskQuestion] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to fetch ask-question logs' }, { status: 500 });
  }
}

export const GET = withProtection(handler, { adminOnly: true, requireAuth: true, csrfProtection: false });
