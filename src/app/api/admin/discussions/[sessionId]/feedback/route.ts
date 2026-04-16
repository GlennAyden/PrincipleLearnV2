import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { withApiLogging } from '@/lib/api-logger';

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const token = request.cookies.get('access_token')?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { sessionId } = await context.params;
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }
    return NextResponse.json(
      { error: 'Admin feedback for discussion is disabled. Monitoring is read-only.' },
      { status: 405 }
    );
  } catch (error) {
    console.error('[AdminDiscussions/Feedback] Failed to enforce monitor-only policy', error);
    return NextResponse.json(
      { error: 'Failed to enforce discussion monitoring policy' },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging(postHandler, {
  label: 'admin.discussions.mentorFeedback',
});
