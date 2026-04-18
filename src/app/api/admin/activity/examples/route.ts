import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withProtection } from '@/lib/api-middleware';

interface ExampleUsageRow {
  id: string;
  user_id: string | null;
  course_id: string | null;
  module_index: number | null;
  subtopic_index: number | null;
  page_number: number | null;
  subtopic_label: string | null;
  examples_count: number | null;
  context_length: number | null;
  usage_scope: string | null;
  data_collection_week: string | null;
  created_at: string;
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

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

function fallbackTopic(moduleIndex: number | null, subtopicIndex: number | null) {
  return `Module ${Number(moduleIndex ?? 0) + 1}, Subtopic ${Number(subtopicIndex ?? 0) + 1}`;
}

async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const date = searchParams.get('date');
    const dateFrom = searchParams.get('dateFrom') ?? date;
    const dateTo = searchParams.get('dateTo');
    const courseId = searchParams.get('course');
    const topic = searchParams.get('topic')?.trim().toLowerCase() || '';

    let query = adminDb
      .from('example_usage_events')
      .select('id,user_id,course_id,module_index,subtopic_index,page_number,subtopic_label,examples_count,context_length,usage_scope,data_collection_week,created_at')
      .order('created_at', { ascending: false })
      .limit(1000);

    if (userId) query = query.eq('user_id', userId);
    if (courseId) query = query.eq('course_id', courseId);

    const dateRange = buildDateRange(dateFrom, dateTo);
    if (dateRange) {
      query = query
        .gte('created_at', dateRange.start.toISOString())
        .lte('created_at', dateRange.end.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      console.error('[Activity][Examples] Failed to fetch example_usage_events:', error);
      return NextResponse.json([], { status: 200 });
    }

    const rows = (Array.isArray(data) ? data : []) as ExampleUsageRow[];
    const userIds = Array.from(new Set(rows.map((row) => row.user_id).filter((id): id is string => Boolean(id))));
    const courseIds = Array.from(new Set(rows.map((row) => row.course_id).filter((id): id is string => Boolean(id))));

    const [usersResult, coursesResult] = await Promise.all([
      userIds.length
        ? adminDb.from('users').select('id,email').in('id', userIds)
        : Promise.resolve({ data: [], error: null }),
      courseIds.length
        ? adminDb.from('courses').select('id,title').in('id', courseIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const emailById = new Map(
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

    const payload = rows
      .map((row) => {
        const topicLabel = row.subtopic_label || fallbackTopic(row.module_index, row.subtopic_index);
        return {
          id: row.id,
          timestamp: new Date(row.created_at).toLocaleString('id-ID', DATE_OPTIONS),
          rawTimestamp: row.created_at,
          userEmail: row.user_id ? emailById.get(row.user_id) ?? 'Unknown User' : 'Unknown User',
          userId: row.user_id ?? 'unknown',
          topic: topicLabel,
          courseTitle: row.course_id ? courseTitleById.get(row.course_id) ?? 'Tanpa Kursus' : 'Tanpa Kursus',
          courseId: row.course_id,
          moduleIndex: row.module_index ?? 0,
          subtopicIndex: row.subtopic_index ?? 0,
          pageNumber: row.page_number ?? 0,
          examplesCount: row.examples_count ?? 0,
          contextLength: row.context_length ?? 0,
          usageScope: row.usage_scope ?? 'used_on_subtopic',
          dataCollectionWeek: row.data_collection_week ?? null,
        };
      })
      .filter((row) => !topic || row.topic.toLowerCase().includes(topic));

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[Activity][Examples] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to fetch example usage logs' }, { status: 500 });
  }
}

export const GET = withProtection(handler, { adminOnly: true, requireAuth: true, csrfProtection: false });
