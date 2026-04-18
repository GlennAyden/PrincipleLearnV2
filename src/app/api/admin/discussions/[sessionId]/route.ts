import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import {
  serializeDiscussionAdminActions,
  serializeDiscussionMessages,
} from '@/lib/discussion/serializers';

let hasDiscussionAdminActionsTable: boolean | null = null;

function isMissingTableError(error: unknown, tableName: string): boolean {
  const err = error as { code?: string; message?: string } | null
  return (
    err?.code === 'PGRST205' &&
    typeof err?.message === 'string' &&
    err.message.includes(`'public.${tableName}'`)
  );
}

function markDiscussionAdminActionsTableUnavailable() {
  hasDiscussionAdminActionsTable = false;
}

async function getHandler(
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

    const { data: sessionData, error: sessionError } = await adminDb
      .from('discussion_sessions')
      .select(
        `
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
        subtopics:subtopic_id(title)
      `
      )
      .eq('id', sessionId)
      .maybeSingle();

    if (sessionError || !sessionData) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    const { data: messages, error: messageError } = await adminDb
      .from('discussion_messages')
      .select('id, role, content, metadata, step_key, created_at')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (messageError) {
      console.error('[AdminDiscussions] Failed to fetch messages', messageError);
    }

    const { data: assessments, error: assessmentError } = await adminDb
      .from('discussion_assessments')
      .select(
        `
        id,
        session_id,
        student_message_id,
        prompt_message_id,
        step_key,
        phase,
        goal_id,
        goal_description,
        assessment_status,
        proximity_score,
        passed,
        attempt_number,
        remediation_round,
        quality_flag,
        evaluator,
        model,
        evaluation_version,
        coach_feedback,
        ideal_answer,
        scaffold_action,
        advance_allowed,
        evidence_excerpt,
        assessment_raw,
        created_at
      `
      )
      .eq('session_id', sessionId)
      .order('created_at', { ascending: true });

    if (assessmentError) {
      console.error('[AdminDiscussions] Failed to fetch assessments', assessmentError);
    }

    let actions: Record<string, unknown>[] = [];
    if (hasDiscussionAdminActionsTable !== false) {
      try {
        const { data: actionsData, error: actionsError } = await adminDb
          .from('discussion_admin_actions')
          .select('id, action, payload, created_at, admin_id, admin_email')
          .eq('session_id', sessionId)
          .order('created_at', { ascending: true });

        if (actionsError) {
          if (isMissingTableError(actionsError, 'discussion_admin_actions')) {
            markDiscussionAdminActionsTableUnavailable();
            console.warn(
              '[AdminDiscussions] discussion_admin_actions table not found, continuing without admin actions'
            );
          } else {
            console.error('[AdminDiscussions] Failed to fetch admin actions', actionsError);
          }
        } else {
          hasDiscussionAdminActionsTable = true;
          actions = actionsData ?? [];
        }
      } catch (actionsError: unknown) {
        if (isMissingTableError(actionsError, 'discussion_admin_actions')) {
          markDiscussionAdminActionsTableUnavailable();
          console.warn(
            '[AdminDiscussions] discussion_admin_actions table not found, continuing without admin actions'
          );
        } else {
          console.error('[AdminDiscussions] Failed to fetch admin actions', actionsError);
        }
      }
    }

    interface SessionQueryRow {
      id: string; status: string; phase: string; learning_goals: unknown;
      completed_at?: string | null; completion_reason?: string | null;
      completion_summary?: unknown;
      created_at: string; updated_at: string; user_id: string; course_id: string;
      subtopic_id: string; users?: { email: string } | null;
      courses?: { title: string } | null; subtopics?: { title: string } | null;
    }
    const session = sessionData as unknown as SessionQueryRow;

    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        phase: session.phase,
        learningGoals: Array.isArray(session.learning_goals)
          ? session.learning_goals
          : [],
        completedAt: session.completed_at ?? null,
        completionReason: session.completion_reason ?? null,
        completionSummary: session.completion_summary ?? null,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        user: {
          id: session.user_id,
          email: session.users?.email ?? null,
        },
        course: {
          id: session.course_id,
          title: session.courses?.title ?? null,
        },
        subtopic: {
          id: session.subtopic_id,
          title: session.subtopics?.title ?? null,
        },
      },
      messages: serializeDiscussionMessages(messages ?? []),
      assessments: assessments ?? [],
      adminActions: serializeDiscussionAdminActions(actions as Array<{
        id: string;
        action: string;
        payload: unknown;
        created_at: string;
        admin_id: string | null;
        admin_email: string | null;
      }>),
    });
  } catch (error) {
    console.error('[AdminDiscussions] Unexpected error loading session details', error);
    return NextResponse.json(
      { error: 'Failed to load session detail' },
      { status: 500 }
    );
  }
}

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
      { error: 'Admin discussion interventions are disabled. Monitoring is read-only.' },
      { status: 405 }
    );
  } catch (error) {
    console.error('[AdminDiscussions] Failed to handle monitor-only guard', error);
    return NextResponse.json(
      { error: 'Failed to enforce discussion monitoring policy' },
      { status: 500 }
    );
  }
}

export const GET = withApiLogging(getHandler, {
  label: 'admin.discussions.detail',
});

export const POST = withApiLogging(postHandler, {
  label: 'admin.discussions.intervention',
});
