import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';

type TemplateRecord = {
  id: string;
  version: string;
  template: any;
};

type SessionRecord = {
  id: string;
  status: string;
  phase: string;
  learning_goals: any;
  template_id: string;
};

export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const { courseId, subtopicId } = body || {};

    if (!courseId || !subtopicId) {
      return NextResponse.json(
        { error: 'courseId and subtopicId are required' },
        { status: 400 }
      );
    }

    const templateRow = await fetchLatestTemplate(subtopicId);
    if (!templateRow) {
      return NextResponse.json(
        { error: 'Discussion template not found for this subtopic' },
        { status: 404 }
      );
    }

    const steps = flattenTemplate(templateRow.template);
    if (!steps.length) {
      return NextResponse.json(
        { error: 'Discussion template is missing steps' },
        { status: 500 }
      );
    }

    let session = await fetchExistingSession(tokenPayload.userId, subtopicId);
    if (!session) {
      session = await createSession({
        userId: tokenPayload.userId,
        courseId,
        subtopicId,
        template: templateRow,
        firstPhaseId: steps[0].phaseId,
        goals: buildInitialGoals(templateRow.template?.learning_goals),
      });

      await adminDb.from('discussion_messages').insert({
        session_id: session.id,
        role: 'agent',
        content: steps[0].step.prompt,
        step_key: steps[0].step.key,
        metadata: {
          phase: steps[0].phaseId,
          expected_type: steps[0].step.expected_type ?? 'open',
          options: steps[0].step.options ?? [],
        },
      });
    }

    const messages = await fetchMessages(session.id);
    const currentStep = getCurrentStep(templateRow.template, messages);

    return NextResponse.json({
      session: serializeSession(session),
      messages,
      currentStep,
    });
  } catch (error) {
    console.error('[DiscussionStart] Failed to start discussion', error);
    return NextResponse.json(
      { error: 'Failed to start discussion session' },
      { status: 500 }
    );
  }
}

async function fetchLatestTemplate(subtopicId: string): Promise<TemplateRecord | null> {
  const { data, error } = await adminDb
    .from('discussion_templates')
    .select('id, version, template')
    .eq('subtopic_id', subtopicId)
    .order('version', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[DiscussionStart] Failed to load template', error);
    return null;
  }

  return data?.[0] ?? null;
}

async function fetchExistingSession(userId: string, subtopicId: string): Promise<SessionRecord | null> {
  const { data, error } = await adminDb
    .from('discussion_sessions')
    .select('id, status, phase, learning_goals, template_id')
    .eq('user_id', userId)
    .eq('subtopic_id', subtopicId)
    .limit(1);

  if (error) {
    console.error('[DiscussionStart] Failed to fetch session', error);
    return null;
  }

  return data?.[0] ?? null;
}

async function createSession(params: {
  userId: string;
  courseId: string;
  subtopicId: string;
  template: TemplateRecord;
  firstPhaseId: string;
  goals: any[];
}): Promise<SessionRecord> {
  const { userId, courseId, subtopicId, template, firstPhaseId, goals } = params;

  const { data, error } = await adminDb
    .from('discussion_sessions')
    .insert({
      user_id: userId,
      course_id: courseId,
      subtopic_id: subtopicId,
      template_id: template.id,
      status: 'in_progress',
      phase: firstPhaseId,
      learning_goals: goals,
    })
    .select('id, status, phase, learning_goals, template_id')
    .single();

  if (error || !data) {
    throw new Error('Failed to create discussion session');
  }

  return data;
}

async function fetchMessages(sessionId: string) {
  const { data, error } = await adminDb
    .from('discussion_messages')
    .select('id, role, content, step_key, metadata, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[DiscussionStart] Failed to load messages', error);
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

function getCurrentStep(template: any, messages: any[]) {
  const steps = flattenTemplate(template);
  if (!steps.length) return null;

  const agentMessages = messages.filter((message) => message.role === 'agent');
  const lastAgent = agentMessages[agentMessages.length - 1];

  if (!lastAgent) {
    const first = steps[0];
    return {
      key: first.step.key,
      prompt: first.step.prompt,
      expected_type: first.step.expected_type ?? 'open',
      options: first.step.options ?? [],
      phase: first.phaseId,
    };
  }

  const matched = steps.find((item) => item.step.key === lastAgent.step_key);
  if (!matched) {
    const first = steps[0];
    return {
      key: first.step.key,
      prompt: first.step.prompt,
      expected_type: first.step.expected_type ?? 'open',
      options: first.step.options ?? [],
      phase: first.phaseId,
    };
  }

  return {
    key: matched.step.key,
    prompt: matched.step.prompt,
    expected_type: matched.step.expected_type ?? 'open',
    options: matched.step.options ?? [],
    phase: matched.phaseId,
  };
}

function buildInitialGoals(goals: any) {
  if (!Array.isArray(goals)) {
    return [];
  }

  return goals
    .filter((goal) => goal && typeof goal.id === 'string')
    .map((goal) => ({
      id: goal.id,
      description: goal.description ?? '',
      covered: false,
    }));
}

function serializeSession(session: SessionRecord) {
  return {
    id: session.id,
    status: session.status,
    phase: session.phase,
    learningGoals: Array.isArray(session.learning_goals) ? session.learning_goals : [],
  };
}
