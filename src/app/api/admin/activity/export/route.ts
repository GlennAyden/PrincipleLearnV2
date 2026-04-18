import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withProtection } from '@/lib/api-middleware';

type ExportFormat = 'csv' | 'json';
type ActivityType =
  | 'ask'
  | 'challenge'
  | 'quiz'
  | 'jurnal'
  | 'feedback'
  | 'transcript'
  | 'discussion'
  | 'example';

type DynamicRow = Record<string, unknown>;

interface SourceConfig {
  type: ActivityType;
  table: string;
  select: string;
  topic: (row: DynamicRow) => string;
  detail: (row: DynamicRow) => string;
  extra?: (row: DynamicRow) => Record<string, unknown>;
}

interface ActivityExportRow {
  id: string;
  type: ActivityType;
  userId: string | null;
  userEmail: string;
  courseId: string | null;
  courseTitle: string;
  timestamp: string;
  rawTimestamp: string;
  topic: string;
  detail: string;
  metadata: Record<string, unknown>;
}

const EXPORT_PAGE_SIZE = 1000;
const MAX_EXPORT_ROWS_PER_SOURCE = 10000;

const SOURCES: SourceConfig[] = [
  {
    type: 'ask',
    table: 'ask_question_history',
    select: 'id,user_id,course_id,subtopic_label,question,answer,prompt_stage,stage_confidence,created_at',
    topic: (row) => firstString(row.subtopic_label) ?? 'Tanya Jawab',
    detail: (row) => firstString(row.question, row.answer) ?? 'Pertanyaan materi',
    extra: (row) => ({
      promptStage: firstString(row.prompt_stage),
      stageConfidence: toNumber(row.stage_confidence),
    }),
  },
  {
    type: 'challenge',
    table: 'challenge_responses',
    select: 'id,user_id,course_id,module_index,subtopic_index,question,answer,feedback,reasoning_note,created_at',
    topic: (row) => formatModuleSubtopic(row),
    detail: (row) => firstString(row.question, row.answer, row.feedback) ?? 'Tantangan pemikiran',
    extra: (row) => ({
      hasFeedback: Boolean(firstString(row.feedback)),
      hasReasoning: Boolean(firstString(row.reasoning_note)),
    }),
  },
  {
    type: 'quiz',
    table: 'quiz_submissions',
    select: 'id,user_id,course_id,subtopic_label,module_index,subtopic_index,answer,is_correct,reasoning_note,created_at',
    topic: (row) => firstString(row.subtopic_label) ?? formatModuleSubtopic(row),
    detail: (row) => firstString(row.answer) ?? 'Jawaban kuis',
    extra: (row) => ({
      isCorrect: toBoolean(row.is_correct),
      hasReasoning: Boolean(firstString(row.reasoning_note)),
    }),
  },
  {
    type: 'jurnal',
    table: 'jurnal',
    select: 'id,user_id,course_id,subtopic_label,type,content,reflection,created_at',
    topic: (row) => firstString(row.subtopic_label, row.type) ?? 'Refleksi',
    detail: (row) => firstString(row.content, row.reflection) ?? 'Jurnal refleksi',
    extra: (row) => ({ reflectionType: firstString(row.type) }),
  },
  {
    type: 'feedback',
    table: 'feedback',
    select: 'id,user_id,course_id,subtopic_label,rating,comment,created_at',
    topic: (row) => firstString(row.subtopic_label) ?? 'Feedback',
    detail: (row) => firstString(row.comment) ?? 'Feedback pembelajaran',
    extra: (row) => ({ rating: toNumber(row.rating) }),
  },
  {
    type: 'transcript',
    table: 'transcript',
    select: 'id,user_id,course_id,subtopic_id,content,notes,created_at',
    topic: (row) => extractSubtopicFromNotes(firstString(row.notes)) ?? 'Transkrip',
    detail: (row) => firstString(row.content, row.notes) ?? 'Transkrip belajar',
  },
  {
    type: 'discussion',
    table: 'discussion_sessions',
    select: 'id,user_id,course_id,subtopic_id,status,phase,completion_summary,completed_at,created_at',
    topic: (row) => firstString(row.phase, row.status) ?? 'Diskusi',
    detail: (row) => firstString(row.completion_summary, row.status) ?? 'Diskusi terpandu',
    extra: (row) => ({
      status: firstString(row.status),
      completedAt: firstString(row.completed_at),
    }),
  },
  {
    type: 'example',
    table: 'example_usage_events',
    select: 'id,user_id,course_id,module_index,subtopic_index,page_number,subtopic_label,examples_count,usage_scope,data_collection_week,created_at',
    topic: (row) => firstString(row.subtopic_label) ?? formatModuleSubtopic(row),
    detail: (row) => `Beri Contoh dipakai (${toNumber(row.examples_count) ?? 0} contoh)`,
    extra: (row) => ({
      pageNumber: toNumber(row.page_number),
      examplesCount: toNumber(row.examples_count),
      usageScope: firstString(row.usage_scope),
      dataCollectionWeek: firstString(row.data_collection_week),
    }),
  },
];

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
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

function formatModuleSubtopic(row: DynamicRow): string {
  const moduleIndex = toNumber(row.module_index);
  const subtopicIndex = toNumber(row.subtopic_index);
  if (moduleIndex !== null && subtopicIndex !== null) {
    return `Module ${moduleIndex + 1}, Subtopic ${subtopicIndex + 1}`;
  }
  return 'Aktivitas belajar';
}

function extractSubtopicFromNotes(notes: string | null): string | null {
  if (!notes) return null;
  const match = notes.match(/^Subtopic:\s*(.+)$/i);
  return match?.[1]?.trim() || null;
}

function normalizeStartDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function normalizeEndDate(value: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(23, 59, 59, 999);
  return date.toISOString();
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

async function fetchRowsForSource(
  source: SourceConfig,
  filters: {
    userId: string | null;
    courseId: string | null;
    startDate: string | null;
    endDate: string | null;
    topic: string | null;
  },
): Promise<ActivityExportRow[]> {
  const rows: DynamicRow[] = [];
  for (let offset = 0; offset < MAX_EXPORT_ROWS_PER_SOURCE; offset += EXPORT_PAGE_SIZE) {
    let query = adminDb
      .from(source.table)
      .select(source.select)
      .order('created_at', { ascending: false })
      .range(offset, offset + EXPORT_PAGE_SIZE - 1);

    if (filters.userId) query = query.eq('user_id', filters.userId);
    if (filters.courseId) query = query.eq('course_id', filters.courseId);
    if (filters.startDate) query = query.gte('created_at', filters.startDate);
    if (filters.endDate) query = query.lte('created_at', filters.endDate);

    const { data, error } = await query;
    if (error) {
      throw new Error(`${source.table}: ${error.message}`);
    }

    const pageRows = (Array.isArray(data) ? data : []) as DynamicRow[];
    rows.push(...pageRows);
    if (pageRows.length < EXPORT_PAGE_SIZE) break;
  }

  return rows.map((row, index) => {
    const rawTimestamp = firstString(row.created_at) ?? new Date(0).toISOString();
    const id = firstString(row.id) ?? `${source.type}-${rawTimestamp}-${index}`;

    return {
      id,
      type: source.type,
      userId: firstString(row.user_id),
      userEmail: 'Unknown User',
      courseId: firstString(row.course_id),
      courseTitle: 'Tanpa Kursus',
      timestamp: new Date(rawTimestamp).toLocaleString('id-ID'),
      rawTimestamp,
      topic: source.topic(row),
      detail: source.detail(row),
      metadata: source.extra?.(row) ?? {},
    };
  }).filter((row) => {
    if (!filters.topic) return true;
    const haystack = `${row.topic} ${row.detail}`.toLowerCase();
    return haystack.includes(filters.topic);
  });
}

async function enrichRows(rows: ActivityExportRow[], anonymize: boolean): Promise<ActivityExportRow[]> {
  const userIds = Array.from(new Set(rows.map((row) => row.userId).filter((id): id is string => Boolean(id))));
  const courseIds = Array.from(new Set(rows.map((row) => row.courseId).filter((id): id is string => Boolean(id))));

  const [usersResult, coursesResult] = await Promise.all([
    userIds.length > 0
      ? adminDb.from('users').select('id,email').in('id', userIds)
      : Promise.resolve({ data: [], error: null }),
    courseIds.length > 0
      ? adminDb.from('courses').select('id,title').in('id', courseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (usersResult.error) throw new Error(`users: ${usersResult.error.message}`);
  if (coursesResult.error) throw new Error(`courses: ${coursesResult.error.message}`);

  const userEmailById = new Map(
    ((usersResult.data ?? []) as Array<{ id: string; email: string | null }>).map((user) => [
      user.id,
      user.email ?? 'Unknown User',
    ]),
  );
  const courseTitleById = new Map(
    ((coursesResult.data ?? []) as Array<{ id: string; title: string | null }>).map((course) => [
      course.id,
      course.title ?? 'Tanpa Kursus',
    ]),
  );

  const anonIds = new Map<string, string>();
  let anonCounter = 1;

  return rows.map((row) => {
    let userEmail = row.userId ? userEmailById.get(row.userId) ?? 'Unknown User' : 'Unknown User';
    if (anonymize && row.userId) {
      if (!anonIds.has(row.userId)) {
        anonIds.set(row.userId, `S${String(anonCounter).padStart(3, '0')}`);
        anonCounter += 1;
      }
      userEmail = anonIds.get(row.userId) ?? 'S000';
    }

    return {
      ...row,
      userEmail,
      courseTitle: row.courseId ? courseTitleById.get(row.courseId) ?? 'Tanpa Kursus' : 'Tanpa Kursus',
    };
  });
}

async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = (searchParams.get('format') || 'csv') as ExportFormat;
    if (format !== 'csv' && format !== 'json') {
      return NextResponse.json({ error: 'Invalid format. Use csv or json.' }, { status: 400 });
    }

    const requestedActivity = searchParams.get('activity');
    const allowedSources = requestedActivity && requestedActivity !== 'all'
      ? SOURCES.filter((source) => source.type === requestedActivity)
      : SOURCES;

    if (allowedSources.length === 0) {
      return NextResponse.json({ error: 'Invalid activity type.' }, { status: 400 });
    }

    const filters = {
      userId: searchParams.get('userId') || null,
      courseId: searchParams.get('courseId') || searchParams.get('course') || null,
      startDate: normalizeStartDate(searchParams.get('startDate') || searchParams.get('dateFrom')),
      endDate: normalizeEndDate(searchParams.get('endDate') || searchParams.get('dateTo')),
      topic: searchParams.get('topic')?.trim().toLowerCase() || null,
    };
    const anonymize = searchParams.get('anonymize') === 'true';

    const nestedRows = await Promise.all(
      allowedSources.map((source) => fetchRowsForSource(source, filters)),
    );
    const rows = (await enrichRows(nestedRows.flat(), anonymize))
      .sort((a, b) => new Date(b.rawTimestamp).getTime() - new Date(a.rawTimestamp).getTime());

    const filename = `activity-export-${new Date().toISOString().slice(0, 10)}.${format}`;

    if (format === 'json') {
      return NextResponse.json(rows, {
        headers: { 'Content-Disposition': `attachment; filename="${filename}"` },
      });
    }

    const headers = [
      'ID',
      'Type',
      'User Email',
      'Course Title',
      'Timestamp',
      'Topic',
      'Detail',
      'Metadata',
    ];
    const csv = [
      headers,
      ...rows.map((row) => [
        row.id,
        row.type,
        row.userEmail,
        row.courseTitle,
        row.timestamp,
        row.topic,
        row.detail,
        JSON.stringify(row.metadata),
      ]),
    ].map((line) => line.map(csvCell).join(',')).join('\n');

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('[Activity Export] Failed to export activity data:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to export activity data' },
      { status: 500 },
    );
  }
}

export const GET = withProtection(handler, {
  adminOnly: true,
  requireAuth: true,
  csrfProtection: false,
});
