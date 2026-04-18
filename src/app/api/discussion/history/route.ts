import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { resolveDiscussionSubtopicId } from '@/lib/discussion/resolveSubtopic';
import {
  serializeDiscussionMessages,
  serializeDiscussionStep,
} from '@/lib/discussion/serializers';

interface SessionRecord {
  id: string;
  user_id: string;
  status: string;
  phase: string;
  learning_goals: unknown;
  template_id: string | null;
  subtopic_id: string;
  course_id: string;
}

type TemplateRecord = {
  id: string;
  template: DiscussionTemplate;
  version: string;
  source?: {
    generation?: {
      status?: string;
    };
  };
  generated_by?: string | null;
};

interface DiscussionTemplate {
  phases?: Array<{
    id?: string;
    steps?: Array<DiscussionStep>;
  }>;
  closing_message?: string;
  learning_goals?: unknown[];
}

interface DiscussionStep {
  key: string;
  prompt: string;
  expected_type?: string;
  options?: string[];
  goal_refs?: string[];
  answer?: string | number;
  feedback?: { correct?: string; incorrect?: string };
}

interface DiscussionMessage {
  id: string;
  role: string;
  content: string;
  step_key: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

async function getHandler(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const sessionId = searchParams.get('sessionId');
    const courseId = searchParams.get('courseId');
    const subtopicId = searchParams.get('subtopicId');
    const subtopicTitle = searchParams.get('subtopicTitle');

    if (!sessionId && (!courseId || (!subtopicId && !subtopicTitle))) {
      return NextResponse.json(
        { error: 'Provide either sessionId or courseId with subtopic context' },
        { status: 400 }
      );
    }

    let session: SessionRecord | null = null;
    if (sessionId) {
      session = await fetchSessionById(sessionId);
    } else {
      const resolvedSubtopicId = await resolveDiscussionSubtopicId({
        courseId,
        subtopicId,
        subtopicTitle,
      });

      if (!resolvedSubtopicId) {
        return NextResponse.json(
          {
            code: 'DISCUSSION_CONTEXT_NOT_FOUND',
            error: 'Discussion session not found',
          },
          { status: 404 }
        );
      }

      session = await fetchLatestSession(tokenPayload.userId, courseId!, resolvedSubtopicId);
    }

    if (!session || session.user_id !== tokenPayload.userId) {
      return NextResponse.json(
        {
          code: 'SESSION_NOT_FOUND',
          error: 'Session not found',
        },
        { status: 404 }
      );
    }

    const templateRow = await fetchTemplate(session);
    const messages = await fetchMessages(session.id);
    const currentStep = templateRow ? getCurrentStep(templateRow.template, messages) : null;

    return NextResponse.json({
      session: {
        id: session.id,
        status: session.status,
        phase: session.phase,
        learningGoals: Array.isArray(session.learning_goals) ? session.learning_goals : [],
        courseId: session.course_id,
        subtopicId: session.subtopic_id,
      },
      templateVersion: templateRow?.version ?? null,
      messages: serializeDiscussionMessages(messages),
      currentStep: serializeDiscussionStep(currentStep),
    });
  } catch (error) {
    console.error('[DiscussionHistory] Failed to retrieve history', error);
    const response = NextResponse.json(
      { error: 'Failed to load discussion history' },
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
  label: 'discussion.history',
});

async function fetchSessionById(sessionId: string): Promise<SessionRecord | null> {
  const { data, error } = await adminDb
    .from('discussion_sessions')
    .select('id, user_id, status, phase, learning_goals, template_id, subtopic_id, course_id')
    .eq('id', sessionId)
    .limit(1);

  if (error) {
    console.error('[DiscussionHistory] Failed to fetch session by id', error);
    return null;
  }

  return data?.[0] ?? null;
}

async function fetchLatestSession(userId: string, courseId: string, subtopicId: string): Promise<SessionRecord | null> {
  const { data, error } = await adminDb
    .from('discussion_sessions')
    .select('id, user_id, status, phase, learning_goals, template_id, subtopic_id, course_id, created_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('subtopic_id', subtopicId)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(1);

  if (error) {
    console.error('[DiscussionHistory] Failed to fetch latest session', error);
    return null;
  }

  if (data && data[0]) {
    const { created_at: _created_at, ...rest } = data[0] as SessionRecord & { created_at?: string };
    return rest;
  }

  return null;
}

async function fetchTemplate(session: SessionRecord): Promise<TemplateRecord | null> {
  if (session.template_id) {
    const { data, error } = await adminDb
      .from('discussion_templates')
      .select('id, template, version, source, generated_by')
      .eq('id', session.template_id)
      .limit(1);

    if (!error && data?.[0] && isUsableTemplateRow(data[0])) {
      return data[0];
    }
  }

  const { data, error } = await adminDb
    .from('discussion_templates')
    .select('id, template, version, source, generated_by')
    .eq('subtopic_id', session.subtopic_id)
    .in('generated_by', ['auto', 'auto-module'])
    .order('version', { ascending: false })
    .limit(25);

  if (error) {
    console.error('[DiscussionHistory] Failed to fetch template fallback', error);
    return null;
  }

  return (data ?? []).find(isUsableTemplateRow) ?? null;
}

function isUsableTemplateRow(row: TemplateRecord) {
  const generatedBy = String(row.generated_by ?? '');
  if (generatedBy !== 'auto' && generatedBy !== 'auto-module') {
    return false;
  }
  const status = row.source?.generation?.status;
  return (!status || status === 'ready') && Array.isArray(row.template?.phases) && row.template.phases.length > 0;
}

async function fetchMessages(sessionId: string) {
  const { data, error } = await adminDb
    .from('discussion_messages')
    .select('id, role, content, step_key, metadata, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .order('id', { ascending: true });

  if (error) {
    console.error('[DiscussionHistory] Failed to fetch messages', error);
    return [];
  }

  return data ?? [];
}

function flattenTemplate(template: DiscussionTemplate | null | undefined) {
  const phases = Array.isArray(template?.phases) ? template.phases : [];
  const flattened: Array<{ phaseId: string; step: DiscussionStep }> = [];

  phases.forEach((phase) => {
    const steps = Array.isArray(phase?.steps) ? phase.steps : [];
    steps.forEach((step) => {
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

function getCurrentStep(template: DiscussionTemplate, messages: DiscussionMessage[]) {
  const steps = flattenTemplate(template);
  if (!steps.length) return null;

  const pendingPrompt = getPendingPromptStep(messages);
  if (pendingPrompt) {
    return pendingPrompt;
  }

  const agentMessages = messages.filter(
    (message: DiscussionMessage) =>
      message.role === 'agent' &&
      (!message.metadata ||
        (message.metadata.type !== 'coach_feedback' &&
         message.metadata.type !== 'closing' &&
         message.metadata.type !== 'retry_prompt' &&
         message.metadata.type !== 'effort_rejection' &&
         message.metadata.type !== 'remediation_prompt' &&
         message.metadata.type !== 'clarification_response'))
  );
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

function getPendingPromptStep(messages: DiscussionMessage[]) {
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.role !== 'agent' || !lastMessage.metadata) {
    return null;
  }

  const type = lastMessage.metadata.type;
  if (type !== 'retry_prompt' && type !== 'remediation_prompt') {
    return null;
  }

  const metadata = lastMessage.metadata;
  const options = Array.isArray(metadata.options)
    ? metadata.options.filter((option): option is string => typeof option === 'string')
    : [];

  return {
    key:
      typeof metadata.original_step_key === 'string'
        ? metadata.original_step_key
        : lastMessage.step_key ?? 'pending',
    prompt: lastMessage.content,
    expected_type:
      typeof metadata.expected_type === 'string' ? metadata.expected_type : 'open',
    options,
    phase:
      typeof metadata.phase === 'string'
        ? metadata.phase
        : type === 'remediation_prompt'
        ? 'remediation'
        : 'phase',
  };
}
