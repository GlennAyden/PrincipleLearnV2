import { NextRequest, NextResponse } from 'next/server';

import { adminDb } from '@/lib/database';
import { resolveDiscussionSubtopicId } from '@/lib/discussion/resolveSubtopic';
import { verifyToken } from '@/lib/jwt';
import { withApiLogging } from '@/lib/api-logger';
import { assertCourseOwnership, toOwnershipError } from '@/lib/ownership';

interface SessionRecord {
  id: string;
  user_id: string;
  status: string;
  phase: string;
  learning_goals: unknown;
  course_id: string;
  subtopic_id: string;
  created_at: string;
  updated_at: string | null;
}

async function getHandler(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const courseId = searchParams.get('courseId');
    const subtopicId = searchParams.get('subtopicId');
    const subtopicTitle = searchParams.get('subtopicTitle');

    if (!courseId || (!subtopicId && !subtopicTitle)) {
      return NextResponse.json(
        { error: 'courseId and subtopic context are required' },
        { status: 400 }
      );
    }

    try {
      await assertCourseOwnership(tokenPayload.userId, courseId, tokenPayload.role);
    } catch (ownershipErr) {
      const asOwnership = toOwnershipError(ownershipErr);
      if (asOwnership) {
        return NextResponse.json({ error: asOwnership.message }, { status: asOwnership.status });
      }
      throw ownershipErr;
    }

    const resolvedSubtopicId = await resolveDiscussionSubtopicId({
      courseId,
      subtopicId,
      subtopicTitle,
    });

    if (!resolvedSubtopicId) {
      return NextResponse.json(
        {
          code: 'DISCUSSION_CONTEXT_NOT_FOUND',
          error: 'Discussion context not found',
        },
        { status: 404 }
      );
    }

    const session = await fetchLatestSession(
      tokenPayload.userId,
      courseId,
      resolvedSubtopicId
    );

    if (!session) {
      return NextResponse.json(
        {
          code: 'SESSION_NOT_FOUND',
          error: 'Session not found',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      session: serializeSession(session),
    });
  } catch (error) {
    console.error('[DiscussionStatus] Failed to retrieve status', error);
    const response = NextResponse.json(
      { error: 'Failed to load discussion status' },
      { status: 500 }
    );
    response.headers.set(
      'x-log-error-message',
      error instanceof Error ? error.message : String(error)
    );
    return response;
  }
}

export const GET = withApiLogging(getHandler, {
  label: 'discussion.status',
});

async function fetchLatestSession(
  userId: string,
  courseId: string,
  subtopicId: string
): Promise<SessionRecord | null> {
  const { data, error } = await adminDb
    .from('discussion_sessions')
    .select('id, user_id, status, phase, learning_goals, course_id, subtopic_id, created_at, updated_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('subtopic_id', subtopicId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[DiscussionStatus] Failed to fetch latest session', error);
    return null;
  }

  return data?.[0] ?? null;
}

function serializeSession(session: SessionRecord) {
  return {
    id: session.id,
    status: session.status,
    phase: session.phase,
    learningGoals: Array.isArray(session.learning_goals) ? session.learning_goals : [],
    createdAt: session.created_at,
    updatedAt: session.updated_at ?? session.created_at,
    user: {
      id: session.user_id,
      email: null,
    },
    course: {
      id: session.course_id,
      title: null,
    },
    subtopic: {
      id: session.subtopic_id,
      title: null,
    },
    user_id: session.user_id,
    course_id: session.course_id,
    subtopic_id: session.subtopic_id,
  };
}
