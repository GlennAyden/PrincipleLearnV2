import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';

const DEFAULT_LIMIT = 100;

async function getHandler(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload || (tokenPayload.role ?? '').toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const courseId = searchParams.get('courseId');
    const subtopicId = searchParams.get('subtopicId');
    const userId = searchParams.get('userId');
    const sortBy = searchParams.get('sortBy') || 'updated_at';
    const limitParam = Number(searchParams.get('limit'));
    const limit = Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT;

    let query = adminDb
      .from('discussion_sessions')
      .select(
        `
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
      `
      )
      .order(sortBy, { ascending: false })
      .limit(limit);

    if (status) {
      query = query.eq('status', status);
    }
    if (courseId) {
      query = query.eq('course_id', courseId);
    }
    if (subtopicId) {
      query = query.eq('subtopic_id', subtopicId);
    }
    if (userId) {
      query = query.eq('user_id', userId);
    }
    const { data, error } = await query;

    if (error) {
      console.error('[AdminDiscussions] Failed to fetch sessions', error);
      return NextResponse.json(
        { error: 'Failed to load discussions' },
        { status: 500 }
      );
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
      created_at: string; updated_at: string; user_id: string; course_id: string;
      subtopic_id: string; users?: { email: string } | null;
      courses?: { title: string } | null; subtopics?: { title: string } | null;
      count_messages?: unknown;
    }
    const response = (data ?? [] as DiscussionQueryRow[]).map((item: DiscussionQueryRow) => {
      const messageCount = Number(item.count_messages || 0);
      const goals = Array.isArray(item.learning_goals) ? item.learning_goals : [];
      const goalPct = goals.length ? (goals.filter((g: { covered?: boolean }) => g.covered).length / goals.length) * 100 : 0;
      const now = new Date();
      const daysStalled = (now.getTime() - new Date(item.updated_at).getTime()) / (24 * 60 * 60 * 1000);
      const score = Math.round((goalPct * 0.5) + (messageCount > 3 ? 0.3 : 0) + (daysStalled < 2 ? 0.2 : 0) * 100);
      const color = score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red';
      const reasons = [];
      if (goalPct < 50) reasons.push('Low goal coverage');
      if (messageCount <= 3) reasons.push('Low activity');
      if (daysStalled > 2) reasons.push('Stalled');

      return {
        id: item.id,
        status: item.status,
        phase: item.phase,
        learningGoals: goals,
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
        healthScore: {
          score,
          color,
          reasons,
        },
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
