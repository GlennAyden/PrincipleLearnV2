import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { evaluateModuleDiscussionPrerequisites } from '@/lib/discussion-prerequisites';
import { resolveDiscussionSubtopicId } from '@/lib/discussion/resolveSubtopic';
import { assertCourseOwnership, toOwnershipError } from '@/lib/ownership';
import {
  serializeDiscussionMessages,
  serializeDiscussionStep,
} from '@/lib/discussion/serializers';
import {
  ThinkingSkillMeta,
  normalizeThinkingSkillMeta,
} from '@/lib/discussion/thinkingSkills';
import {
  DISCUSSION_TEMPLATE_PREPARING_CODE,
  DISCUSSION_TEMPLATE_PREPARING_MESSAGE,
  fetchReadyDiscussionTemplate,
  isDiscussionLabel,
  normalizeIdentifier,
  queueDiscussionTemplatePreparation,
} from '@/services/discussion/templatePreparation';

interface DiscussionStep {
  key: string;
  prompt: string;
  expected_type?: string;
  options?: string[];
  goal_refs?: string[];
}

interface DiscussionTemplate {
  phases?: Array<{
    id?: string;
    steps?: Array<DiscussionStep>;
  }>;
  closing_message?: string;
  learning_goals?: unknown[];
}

interface GoalRubric {
  success_summary?: string;
  checklist?: string[];
  failure_signals?: string[];
}

type TemplateRecord = {
  id: string;
  version: string;
  template: DiscussionTemplate;
  source?: Record<string, unknown>;
};

type SessionRecord = {
  id: string;
  status: string;
  phase: string;
  learning_goals: unknown;
  template_id: string;
  course_id: string;
  subtopic_id: string;
};

interface DiscussionSessionGoal {
  id: string;
  description: string;
  rubric?: GoalRubric | null;
  thinkingSkill?: ThinkingSkillMeta | null;
  covered: boolean;
}

interface DiscussionMessage {
  id: string;
  role: string;
  content: string;
  step_key: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

async function postHandler(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const { courseId, subtopicId: rawSubtopicId, subtopicTitle, moduleTitle } = body || {};

    if (!courseId) {
      return NextResponse.json(
        { error: 'courseId is required' },
        { status: 400 }
      );
    }

    try {
      await assertCourseOwnership(tokenPayload.userId, courseId, tokenPayload.role);
    } catch (ownershipErr) {
      const asOwnership = toOwnershipError(ownershipErr);
      if (asOwnership) {
        return NextResponse.json(
          { error: asOwnership.message },
          { status: asOwnership.status },
        );
      }
      throw ownershipErr;
    }

    const subtopicId = await resolveDiscussionSubtopicId({
      courseId,
      subtopicId: rawSubtopicId,
      subtopicTitle,
    });

    if (!subtopicId) {
      return NextResponse.json(
        {
          code: 'DISCUSSION_CONTEXT_NOT_FOUND',
          error: 'Unable to resolve discussion context for this subtopic',
        },
        { status: 404 }
      );
    }

    const moduleScopeRequested =
      (typeof subtopicTitle === 'string' && isDiscussionLabel(subtopicTitle)) ||
      (typeof moduleTitle === 'string' &&
        typeof subtopicTitle === 'string' &&
        normalizeIdentifier(moduleTitle) === normalizeIdentifier(subtopicTitle));

    if (moduleScopeRequested) {
      const prerequisites = await evaluateModuleDiscussionPrerequisites({
        courseId,
        moduleId: subtopicId,
        userId: tokenPayload.userId,
      });

      if (!prerequisites.ready) {
        return NextResponse.json(
          {
            code: 'PREREQUISITES_INCOMPLETE',
            error: 'Selesaikan materi, kuis, dan refleksi seluruh subtopik modul ini sebelum memulai diskusi.',
            prerequisites,
          },
          { status: 409 },
        );
      }
    }

    const templateRow = await fetchReadyDiscussionTemplate({ subtopicId, courseId, subtopicTitle, moduleTitle });
    if (!templateRow) {
      const preparation = await queueDiscussionTemplatePreparation({
        courseId,
        subtopicId,
        subtopicTitle,
        moduleTitle,
        mode: 'ai_regenerated',
        trigger: 'discussion_start_missing_template',
      });

      const response = NextResponse.json(
        {
          code: DISCUSSION_TEMPLATE_PREPARING_CODE,
          status: preparation.status === 'failed' ? 'failed' : 'preparing',
          error: preparation.message || DISCUSSION_TEMPLATE_PREPARING_MESSAGE,
          message: preparation.message || DISCUSSION_TEMPLATE_PREPARING_MESSAGE,
          retryAfterSeconds: preparation.retryAfterSeconds,
          preparation: {
            jobId: preparation.jobId,
            status: preparation.status,
          },
        },
        { status: 202 }
      );
      response.headers.set('Retry-After', String(preparation.retryAfterSeconds || 30));
      return response;
    }

    const steps = flattenTemplate(templateRow.template);
    if (!steps.length) {
      return NextResponse.json(
        { error: 'Discussion template is missing steps' },
        { status: 500 }
      );
    }

    let session = await fetchExistingSession(tokenPayload.userId, courseId, subtopicId);
    let didCreate = false;
    if (!session) {
      try {
        session = await createSession({
          userId: tokenPayload.userId,
          courseId,
          subtopicId,
          template: templateRow,
          firstPhaseId: steps[0].phaseId,
          goals: buildInitialGoals(templateRow.template?.learning_goals),
        });
        didCreate = true;
      } catch (createError) {
        // TOCTOU: a concurrent request may have already created a session
        // between our fetchExistingSession() and createSession() calls. The
        // partial unique indexes on (user_id, course_id, subtopic_id) will
        // reject the duplicate with Postgres code 23505 — swallow it and
        // re-fetch the winning row so both callers converge on the same
        // session instead of returning a 500.
        if (isUniqueViolationError(createError)) {
          const existing = await fetchExistingSession(
            tokenPayload.userId,
            courseId,
            subtopicId,
          );
          if (!existing) {
            throw createError;
          }
          session = existing;
        } else {
          throw createError;
        }
      }

      if (didCreate && session) {
        const { error: initialMessageError } = await adminDb
          .from('discussion_messages')
          .insert({
            session_id: session.id,
            role: 'agent',
            content: steps[0].step.prompt,
            step_key: steps[0].step.key,
            metadata: {
              type: 'agent_response',
              phase: steps[0].phaseId,
              expected_type: steps[0].step.expected_type ?? 'open',
              options: steps[0].step.options ?? [],
            },
          });

        if (initialMessageError) {
          throw new Error('Failed to persist initial discussion prompt');
        }
      }
    }

    const messages = await fetchMessages(session.id);
    const currentStep = getCurrentStep(templateRow.template, messages);
    await ensureProgressRecord(tokenPayload.userId, session.course_id, session.subtopic_id);

    return NextResponse.json({
      session: serializeSession(session),
      messages: serializeDiscussionMessages(messages),
      currentStep: serializeDiscussionStep(currentStep),
    });
  } catch (error) {
    console.error('[DiscussionStart] Failed to start discussion', error);
    const response = NextResponse.json(
      { error: 'Failed to start discussion session' },
      { status: 500 }
    );
    response.headers.set(
      'x-log-error-message',
      error instanceof Error ? error.message : String(error)
    );
    return response;
  }
}

export const POST = withApiLogging(postHandler, {
  label: 'discussion.start',
});

async function fetchExistingSession(userId: string, courseId: string, subtopicId: string): Promise<SessionRecord | null> {
  const { data, error } = await adminDb
    .from('discussion_sessions')
    .select('id, status, phase, learning_goals, template_id, course_id, subtopic_id')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('subtopic_id', subtopicId)
    .limit(1);

  if (error) {
    console.error('[DiscussionStart] Failed to fetch session', error);
    return null;
  }

  return data?.[0] ?? null;
}

class DiscussionSessionCreateError extends Error {
  public readonly cause?: unknown;
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'DiscussionSessionCreateError';
    this.cause = cause;
  }
}

function isUniqueViolationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  // Direct Postgres/PostgREST error
  const direct = error as { code?: string };
  if (direct.code === '23505') return true;
  // Wrapped in DiscussionSessionCreateError
  const wrapped = error as { cause?: { code?: string } };
  if (wrapped.cause && typeof wrapped.cause === 'object' && wrapped.cause.code === '23505') {
    return true;
  }
  return false;
}

async function createSession(params: {
  userId: string;
  courseId: string;
  subtopicId: string;
  template: TemplateRecord;
  firstPhaseId: string;
  goals: DiscussionSessionGoal[];
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
    });

  const row = Array.isArray(data) ? data[0] : data;

  if (error) {
    // Preserve the Postgres error code so the caller can detect a unique
    // violation (TOCTOU race) and recover by fetching the winning row.
    throw new DiscussionSessionCreateError('Failed to create discussion session', error);
  }

  if (!row) {
    throw new DiscussionSessionCreateError('Failed to create discussion session');
  }

  return row;
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

function buildInitialGoals(goals: DiscussionTemplate['learning_goals']): DiscussionSessionGoal[] {
  if (!Array.isArray(goals)) {
    return [];
  }

  return goals
    .filter((goal): goal is Record<string, unknown> => {
      return Boolean(goal) && typeof goal === 'object' && typeof (goal as Record<string, unknown>).id === 'string';
    })
    .map((goal) => ({
      id: String(goal.id),
      description: typeof goal.description === 'string' ? goal.description : '',
      rubric: isGoalRubric(goal.rubric) ? goal.rubric : null,
      thinkingSkill: normalizeThinkingSkillMeta(goal.thinking_skill ?? goal.thinkingSkill),
      covered: false,
    }));
}

function isGoalRubric(value: unknown): value is GoalRubric {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function serializeSession(session: SessionRecord) {
  return {
    id: session.id,
    status: session.status,
    phase: session.phase,
    learningGoals: Array.isArray(session.learning_goals) ? session.learning_goals : [],
    courseId: session.course_id,
    subtopicId: session.subtopic_id,
  };
}

async function ensureProgressRecord(userId: string, courseId: string, subtopicId: string) {
  try {
    const { data, error } = await adminDb
      .from('user_progress')
      .select('id, is_completed')
      .eq('user_id', userId)
      .eq('course_id', courseId)
      .eq('subtopic_id', subtopicId)
      .limit(1);

    if (error) {
      console.warn('[DiscussionStart] Failed to check user progress', error);
      return;
    }

    if (!data || data.length === 0) {
      const { error: insertError } = await adminDb.from('user_progress').insert({
        user_id: userId,
        course_id: courseId,
        subtopic_id: subtopicId,
        is_completed: false,
      });

      if (insertError) {
        console.warn('[DiscussionStart] Failed to create user progress record', insertError);
      }
    }
  } catch (progressError) {
    console.warn('[DiscussionStart] ensureProgressRecord error', progressError);
  }
}
