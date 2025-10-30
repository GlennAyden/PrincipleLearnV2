import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';

interface SessionRecord {
  id: string;
  user_id: string;
  status: string;
  phase: string;
  learning_goals: any;
  template_id: string | null;
  subtopic_id: string;
  course_id: string;
}

type TemplateRecord = {
  id: string;
  template: any;
  version: string;
};

export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const { sessionId, message } = body || {};

    if (!sessionId || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json(
        { error: 'sessionId and message are required' },
        { status: 400 }
      );
    }

    const session = await fetchSession(sessionId);
    if (!session || session.user_id !== tokenPayload.userId) {
      return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }

    if (session.status === 'completed') {
      return NextResponse.json(
        { error: 'Discussion already completed' },
        { status: 409 }
      );
    }

    const templateRow = await fetchTemplate(session);
    if (!templateRow) {
      return NextResponse.json(
        { error: 'Discussion template unavailable' },
        { status: 500 }
      );
    }

    const steps = flattenTemplate(templateRow.template);
    if (!steps.length) {
      return NextResponse.json(
        { error: 'Discussion template has no steps' },
        { status: 500 }
      );
    }

    const messages = await fetchMessages(session.id);
    const agentMessages = messages.filter((msg) => msg.role === 'agent');
    const currentStep = agentMessages.length ? steps[Math.min(agentMessages.length - 1, steps.length - 1)] : steps[0];

    await adminDb.from('discussion_messages').insert({
      session_id: session.id,
      role: 'student',
      content: message.trim(),
      step_key: currentStep?.step?.key ?? null,
      metadata: {
        phase: currentStep?.phaseId ?? null,
      },
    });

    let learningGoals = normalizeGoals(session.learning_goals);
    learningGoals = markGoalsCovered(learningGoals, currentStep?.step?.goal_refs);

    const nextStep = agentMessages.length < steps.length ? steps[agentMessages.length] : null;

    if (nextStep) {
      await adminDb.from('discussion_messages').insert({
        session_id: session.id,
        role: 'agent',
        content: nextStep.step.prompt,
        step_key: nextStep.step.key,
        metadata: {
          phase: nextStep.phaseId,
          expected_type: nextStep.step.expected_type ?? 'open',
          options: nextStep.step.options ?? [],
        },
      });

      await adminDb
        .from('discussion_sessions')
        .update({
          phase: nextStep.phaseId,
          learning_goals: learningGoals,
        })
        .eq('id', session.id);
    } else {
      learningGoals = learningGoals.map((goal) => ({ ...goal, covered: true }));

      await adminDb
        .from('discussion_sessions')
        .update({
          phase: 'completed',
          status: 'completed',
          learning_goals: learningGoals,
        })
        .eq('id', session.id);
    }

    const updatedMessages = await fetchMessages(session.id);

    return NextResponse.json({
      session: {
        id: session.id,
        status: nextStep ? 'in_progress' : 'completed',
        phase: nextStep ? nextStep.phaseId : 'completed',
        learningGoals,
      },
      messages: updatedMessages,
      nextStep: nextStep
        ? {
            key: nextStep.step.key,
            prompt: nextStep.step.prompt,
            expected_type: nextStep.step.expected_type ?? 'open',
            options: nextStep.step.options ?? [],
            phase: nextStep.phaseId,
          }
        : null,
    });
  } catch (error) {
    console.error('[DiscussionRespond] Failed to process response', error);
    return NextResponse.json(
      { error: 'Failed to process discussion response' },
      { status: 500 }
    );
  }
}

async function fetchSession(sessionId: string): Promise<SessionRecord | null> {
  const { data, error } = await adminDb
    .from('discussion_sessions')
    .select('id, user_id, status, phase, learning_goals, template_id, subtopic_id, course_id')
    .eq('id', sessionId)
    .limit(1);

  if (error) {
    console.error('[DiscussionRespond] Failed to load session', error);
    return null;
  }

  return data?.[0] ?? null;
}

async function fetchTemplate(session: SessionRecord): Promise<TemplateRecord | null> {
  if (session.template_id) {
    const { data, error } = await adminDb
      .from('discussion_templates')
      .select('id, template, version')
      .eq('id', session.template_id)
      .limit(1);

    if (!error && data?.[0]) {
      return data[0];
    }
  }

  const { data, error } = await adminDb
    .from('discussion_templates')
    .select('id, template, version')
    .eq('subtopic_id', session.subtopic_id)
    .order('version', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[DiscussionRespond] Failed to fallback template', error);
    return null;
  }

  return data?.[0] ?? null;
}

async function fetchMessages(sessionId: string) {
  const { data, error } = await adminDb
    .from('discussion_messages')
    .select('id, role, content, step_key, metadata, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DiscussionRespond] Failed to load messages', error);
    return [];
  }

  return data ?? [];
}

function flattenTemplate(template: any) {
  const phases = Array.isArray(template?.phases) ? template.phases : [];
  const flattened: Array<{ phaseId: string; step: any }> = [];

  phases.forEach((phase: any) => {
    const steps = Array.isArray(phase?.steps) ? phase.steps : [];
    steps.forEach((step: any) => {
      if (step && typeof step.prompt === 'string') {
        flattened.push({
          phaseId: phase?.id || 'phase',
          step,
        });
      }
    });
  });

  return flattened;
}

function normalizeGoals(goals: any): Array<{ id: string; description: string; covered: boolean }> {
  if (!Array.isArray(goals)) {
    return [];
  }

  return goals.map((goal) => ({
    id: goal?.id ?? '',
    description: goal?.description ?? '',
    covered: Boolean(goal?.covered),
  }));
}

function markGoalsCovered(
  goals: Array<{ id: string; description: string; covered: boolean }>,
  refs: string[] | undefined
) {
  if (!Array.isArray(refs) || refs.length === 0) {
    return goals;
  }

  return goals.map((goal) =>
    refs.includes(goal.id) ? { ...goal, covered: true } : goal
  );
}
