import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';

let hasDiscussionAdminActionsTable: boolean | null = null;

function isMissingTableError(error: any, tableName: string): boolean {
  return (
    error?.code === 'PGRST205' &&
    typeof error?.message === 'string' &&
    error.message.includes(`'public.${tableName}'`)
  );
}

function markDiscussionAdminActionsTableUnavailable() {
  hasDiscussionAdminActionsTable = false;
}

interface MentorFeedbackPayload {
  summary: string;
  goals?: { id?: string; note: string }[];
}

async function postHandler(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> }
) {
  try {
    const token = request.cookies.get('access_token')?.value ?? request.cookies.get('token')?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const { sessionId } = await context.params;
    if (!sessionId) {
      return NextResponse.json({ error: 'sessionId is required' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body || typeof body.summary !== 'string') {
      return NextResponse.json(
        { error: 'summary is required' },
        { status: 400 }
      );
    }

    const payloadRecord: MentorFeedbackPayload = {
      summary: body.summary.trim(),
      goals: Array.isArray(body.goals)
        ? body.goals
            .map((item) => ({
              id: typeof item?.id === 'string' ? item.id : undefined,
              note: typeof item?.note === 'string' ? item.note : '',
            }))
            .filter((item) => item.note)
        : undefined,
    };

    if (hasDiscussionAdminActionsTable !== false) {
      const { error: actionLogError } = await adminDb.from('discussion_admin_actions').insert({
        session_id: sessionId,
        admin_id: payload.userId,
        admin_email: payload.email,
        action: 'mentor_feedback',
        payload: payloadRecord,
      });

      if (actionLogError) {
        if (isMissingTableError(actionLogError, 'discussion_admin_actions')) {
          markDiscussionAdminActionsTableUnavailable();
          console.warn(
            '[AdminDiscussions/Feedback] discussion_admin_actions table not found, skipping action log insert'
          );
        } else {
          return NextResponse.json(
            { error: 'Failed to store mentor feedback' },
            { status: 500 }
          );
        }
      } else {
        hasDiscussionAdminActionsTable = true;
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[AdminDiscussions/Feedback] Failed to store mentor feedback', error);
    return NextResponse.json(
      { error: 'Failed to store mentor feedback' },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging(postHandler, {
  label: 'admin.discussions.mentorFeedback',
});
