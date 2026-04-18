import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { buildDiscussionHealthScore } from '@/lib/discussion/serializers';

const DEFAULT_LIMIT = 100;
const DISCUSSION_SESSION_SELECT = `
  id,
  status,
  phase,
  learning_goals,
  completed_at,
  completion_reason,
  completion_summary,
  created_at,
  updated_at,
  user_id,
  course_id,
  subtopic_id,
  users:user_id(email),
  courses:course_id(title),
  subtopics:subtopic_id(title),
  count_messages:discussion_messages(id)
`;
const DISCUSSION_SESSION_BASE_SELECT = `
  id,
  status,
  phase,
  learning_goals,
  created_at,
  updated_at,
  user_id,
  course_id,
  subtopic_id,
  users:user_id(email),
  courses:course_id(title),
  subtopics:subtopic_id(title),
  count_messages:discussion_messages(id)
`;

function isSchemaMismatchError(error: unknown): boolean {
  const err = error as { code?: string; message?: string } | null;
  return err?.code === '42703' || err?.code === 'PGRST204' || Boolean(err?.message?.includes('completion_'));
}

async function getHandler(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload || (tokenPayload.role ?? '').toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const courseId = searchParams.get('courseId');
    const subtopicId = searchParams.get('subtopicId');
    const userId = searchParams.get('userId');
    const sortBy = searchParams.get('sortBy') || 'updated_at';
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT;

    const buildQuery = (select: string) => {
      let builtQuery = adminDb
        .from('discussion_sessions')
        .select(select)
        .order(sortBy, { ascending: false })
        .limit(limit);

      if (status) builtQuery = builtQuery.eq('status', status);
      if (courseId) builtQuery = builtQuery.eq('course_id', courseId);
      if (subtopicId) builtQuery = builtQuery.eq('subtopic_id', subtopicId);
      if (userId) builtQuery = builtQuery.eq('user_id', userId);
      return builtQuery;
    };

    let { data, error } = await buildQuery(DISCUSSION_SESSION_SELECT);
    if (error && isSchemaMismatchError(error)) {
      ({ data, error } = await buildQuery(DISCUSSION_SESSION_BASE_SELECT));
    }

    if (error) {
      console.error('[AdminDiscussions] Failed to fetch sessions', error);
      return NextResponse.json(
        { error: 'Failed to load discussions' },
        { status: 500 }
      );
    }

    interface DiscussionQueryRow {
      id: string; status: string; phase: string; learning_goals: unknown;
      completed_at?: string | null; completion_reason?: string | null;
      completion_summary?: unknown;
      created_at: string; updated_at: string; user_id: string; course_id: string;
      subtopic_id: string; users?: { email: string } | null;
      courses?: { title: string } | null; subtopics?: { title: string } | null;
      count_messages?: unknown;
    }
    const response = (data ?? [] as DiscussionQueryRow[]).map((item: DiscussionQueryRow) => {
      const messageCount = Number(item.count_messages || 0);
      const goals = Array.isArray(item.learning_goals) ? item.learning_goals : [];
      const healthScore = buildDiscussionHealthScore({
        goals,
        messageCount,
        updatedAt: item.updated_at,
      });

      return {
        id: item.id,
        status: item.status,
        phase: item.phase,
        learningGoals: goals,
        completedAt: item.completed_at ?? null,
        completionReason: item.completion_reason ?? null,
        completionSummary: item.completion_summary ?? null,
        createdAt: item.created_at,
        updatedAt: item.updated_at,
        user: {
          id: item.user_id,
          email: item.users?.email ?? null,
        },
        course: {
          id: item.course_id,
          title: item.courses?.title ?? null,
        },
        subtopic: {
          id: item.subtopic_id,
          title: item.subtopics?.title ?? null,
        },
        healthScore,
        messageCount,
      };
    });

    return NextResponse.json({ sessions: response });
  } catch (error) {
    console.error('[AdminDiscussions] Unexpected error', error);
    return NextResponse.json(
      { error: 'Unexpected error retrieving discussions' },
      { status: 500 }
    );
  }
}

export const GET = withApiLogging(getHandler, {
  label: 'admin.discussions.list',
});
