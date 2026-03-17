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

async function getHandler(
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

    const { data: sessionData, error: sessionError } = await adminDb
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

    let actions: any[] = [];
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
      } catch (actionsError: any) {
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

    return NextResponse.json({
      session: {
        id: sessionData.id,
        status: sessionData.status,
        phase: sessionData.phase,
        learningGoals: Array.isArray(sessionData.learning_goals)
          ? sessionData.learning_goals
          : [],
        createdAt: sessionData.created_at,
        updatedAt: sessionData.updated_at,
        user: {
          id: sessionData.user_id,
          email: (sessionData as any)?.users?.email ?? null,
        },
        course: {
          id: sessionData.course_id,
          title: (sessionData as any)?.courses?.title ?? null,
        },
        subtopic: {
          id: sessionData.subtopic_id,
          title: (sessionData as any)?.subtopics?.title ?? null,
        },
      },
      messages: messages ?? [],
      adminActions: actions,
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
    if (!body || !body.action) {
      return NextResponse.json({ error: 'Action is required' }, { status: 400 });
    }

    if (body.action === 'markGoal') {
      const { goalId, covered, note } = body;
      if (!goalId || typeof covered !== 'boolean') {
        return NextResponse.json(
          { error: 'goalId and covered flag are required' },
          { status: 400 }
        );
      }

      const { data: sessionData, error: sessionError } = await adminDb
        .from('discussion_sessions')
        .select('learning_goals, course_id, subtopic_id')
        .eq('id', sessionId)
        .maybeSingle();

      if (sessionError || !sessionData) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
      }

      const goals = Array.isArray(sessionData.learning_goals)
        ? sessionData.learning_goals
        : [];
      const goalIndex = goals.findIndex((goal: any) => goal?.id === goalId);
      if (goalIndex === -1) {
        return NextResponse.json(
          { error: 'Goal not found in session' },
          { status: 404 }
        );
      }

      const updatedGoals = goals.map((goal: any) =>
        goal?.id === goalId ? { ...goal, covered } : goal
      );

      const { error: updateError } = await adminDb
        .from('discussion_sessions')
        .eq('id', sessionId)
        .update({ learning_goals: updatedGoals });

      if (updateError) {
        console.error('[AdminDiscussions] Failed to update goals', updateError);
        return NextResponse.json(
          { error: 'Failed to update goal status' },
          { status: 500 }
        );
      }

      if (note) {
        await adminDb.from('discussion_messages').insert({
          session_id: sessionId,
          role: 'agent',
          content: note,
          metadata: {
            type: 'manual_intervention',
            goalId,
            covered,
            adminId: payload.userId,
            adminEmail: payload.email,
          },
        });
      }

      if (hasDiscussionAdminActionsTable !== false) {
        const { error: actionLogError } = await adminDb.from('discussion_admin_actions').insert({
          session_id: sessionId,
          admin_id: payload.userId,
          admin_email: payload.email,
          action: 'mark_goal',
          payload: { goalId, covered, note },
        });

        if (actionLogError) {
          if (isMissingTableError(actionLogError, 'discussion_admin_actions')) {
            markDiscussionAdminActionsTableUnavailable();
            console.warn(
              '[AdminDiscussions] discussion_admin_actions table not found, skipping action log insert'
            );
          } else {
            console.error('[AdminDiscussions] Failed to insert admin action log', actionLogError);
          }
        } else {
          hasDiscussionAdminActionsTable = true;
        }
      }

      return NextResponse.json({ success: true });
    }

    if (body.action === 'addCoachNote') {
      const { message, phase } = body;
      if (!message || typeof message !== 'string' || !message.trim()) {
        return NextResponse.json(
          { error: 'message is required' },
          { status: 400 }
        );
      }

      await adminDb.from('discussion_messages').insert({
        session_id: sessionId,
        role: 'agent',
        content: message.trim(),
        metadata: {
          type: 'manual_note',
          phase: phase ?? null,
          adminId: payload.userId,
          adminEmail: payload.email,
        },
      });

      if (hasDiscussionAdminActionsTable !== false) {
        const { error: actionLogError } = await adminDb.from('discussion_admin_actions').insert({
          session_id: sessionId,
          admin_id: payload.userId,
          admin_email: payload.email,
          action: 'add_note',
          payload: { message: message.trim(), phase },
        });

        if (actionLogError) {
          if (isMissingTableError(actionLogError, 'discussion_admin_actions')) {
            markDiscussionAdminActionsTableUnavailable();
            console.warn(
              '[AdminDiscussions] discussion_admin_actions table not found, skipping action log insert'
            );
          } else {
            console.error('[AdminDiscussions] Failed to insert admin action log', actionLogError);
          }
        } else {
          hasDiscussionAdminActionsTable = true;
        }
      }

      return NextResponse.json({ success: true });
    }

    return NextResponse.json(
      { error: `Unknown action: ${body.action}` },
      { status: 400 }
    );
  } catch (error) {
    console.error('[AdminDiscussions] Failed to apply intervention', error);
    return NextResponse.json(
      { error: 'Failed to apply intervention' },
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
