import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { withApiLogging } from '@/lib/api-logger';
import { evaluateModuleDiscussionPrerequisites } from '@/lib/discussion-prerequisites';

async function getHandler(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const courseId = searchParams.get('courseId');
    const moduleId = searchParams.get('moduleId');

    if (!courseId || !moduleId) {
      return NextResponse.json({ error: 'courseId and moduleId are required' }, { status: 400 });
    }

    const prerequisites = await evaluateModuleDiscussionPrerequisites({
      courseId,
      moduleId,
      userId: tokenPayload.userId,
    });

    return NextResponse.json(prerequisites);
  } catch (error) {
    console.error('[DiscussionModuleStatus] Unexpected error', error);
    const message = error instanceof Error ? error.message : 'Failed to evaluate module prerequisites';
    const status =
      message === 'Module not found'
        ? 404
        : message.startsWith('Failed to load')
        ? 500
        : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export const GET = withApiLogging(getHandler, {
  label: 'discussion.module-status',
});
