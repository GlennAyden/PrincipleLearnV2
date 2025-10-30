import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';

const DEFAULT_LIMIT = 100;

async function getHandler(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload || tokenPayload.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { searchParams } = request.nextUrl;
    const status = searchParams.get('status');
    const courseId = searchParams.get('courseId');
    const subtopicId = searchParams.get('subtopicId');
    const userId = searchParams.get('userId');
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
        subtopics:subtopic_id(title)
      `
      )
      .order('updated_at', { ascending: false })
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

    const response = (data ?? []).map((item) => ({
      id: item.id,
      status: item.status,
      phase: item.phase,
      learningGoals: Array.isArray(item.learning_goals) ? item.learning_goals : [],
      createdAt: item.created_at,
      updatedAt: item.updated_at,
      user: {
        id: item.user_id,
        email: (item as any)?.users?.email ?? null,
      },
      course: {
        id: item.course_id,
        title: (item as any)?.courses?.title ?? null,
      },
      subtopic: {
        id: item.subtopic_id,
        title: (item as any)?.subtopics?.title ?? null,
      },
    }));

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
