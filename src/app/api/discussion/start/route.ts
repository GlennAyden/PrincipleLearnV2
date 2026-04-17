import { after, NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { buildSubtopicCacheKey } from '@/lib/quiz-sync';
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
  generateDiscussionTemplate,
  generateModuleDiscussionTemplate,
} from '@/services/discussion/generateDiscussionTemplate';

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
  learning_goals?: Array<{
    id?: string;
    description?: string;
    rubric?: GoalRubric;
    thinking_skill?: unknown;
    thinkingSkill?: unknown;
  }>;
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

interface SubtopicCacheContent {
  objectives?: string[];
  keyTakeaways?: string[];
  commonPitfalls?: string[];
  misconceptions?: string[];
  whatNext?: { summary?: string };
  pages?: Array<{ paragraphs?: string[] }>;
  [key: string]: unknown;
}

const DISCUSSION_TEMPLATE_PREPARING_CODE = 'DISCUSSION_TEMPLATE_PREPARING';
const DISCUSSION_TEMPLATE_PREPARING_MESSAGE =
  'Diskusi sedang disiapkan. Coba tekan mulai ulang diskusi beberapa saat lagi.';
const TEMPLATE_PREPARATION_COOLDOWN_MS = 30_000;
const templatePreparationLocks = new Set<string>();
const templatePreparationCooldowns = new Map<string, number>();

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

    const templateRow = await fetchLatestTemplate({ subtopicId, courseId, subtopicTitle, moduleTitle });
    if (!templateRow) {
      scheduleTemplatePreparation({
        courseId,
        subtopicId,
        subtopicTitle,
        moduleTitle,
        generationMode: 'ai_regenerated',
        generationTrigger: 'discussion_start_missing_template',
      });

      const response = NextResponse.json(
        {
          code: DISCUSSION_TEMPLATE_PREPARING_CODE,
          status: 'preparing',
          error: DISCUSSION_TEMPLATE_PREPARING_MESSAGE,
          message: DISCUSSION_TEMPLATE_PREPARING_MESSAGE,
        },
        { status: 202 }
      );
      response.headers.set('x-log-error-message', DISCUSSION_TEMPLATE_PREPARING_CODE);
      response.headers.set('Retry-After', '30');
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

async function fetchLatestTemplate(params: {
  subtopicId: string;
  courseId?: string;
  subtopicTitle?: string | null;
  moduleTitle?: string | null;
}): Promise<TemplateRecord | null> {
  const { subtopicId, courseId, subtopicTitle, moduleTitle } = params;

  let templateQuery = adminDb
    .from('discussion_templates')
    .select('id, version, template, source')
    .eq('subtopic_id', subtopicId);

  if (courseId) {
    templateQuery = templateQuery.eq('course_id', courseId);
  }

  const { data, error } = await templateQuery
    .order('version', { ascending: false })
    .limit(25);

  if (!error && data?.length) {
    const exactMatch = findMatchingTemplate(data, { subtopicTitle, moduleTitle });
    if (exactMatch) {
      return exactMatch;
    }
    if (!subtopicTitle) {
      return data[0];
    }
  }

  if (courseId && subtopicTitle) {
    const { data: fallback, error: fallbackError } = await adminDb
      .from('discussion_templates')
      .select('id, version, template, source')
      .eq('course_id', courseId)
      .order('version', { ascending: false })
      .limit(100);

    if (!fallbackError && fallback?.length) {
      const exactMatch = findMatchingTemplate(fallback, { subtopicTitle, moduleTitle });
      if (exactMatch) {
        return exactMatch;
      }
    }
  }

  if (error) {
    console.error('[DiscussionStart] Failed to load template', error);
  }

  return null;
}

function findMatchingTemplate(
  rows: TemplateRecord[],
  params: { subtopicTitle?: string | null; moduleTitle?: string | null },
): TemplateRecord | null {
  const subtopicTitle = normalizeIdentifier(params.subtopicTitle ?? '');
  const moduleTitle = normalizeIdentifier(params.moduleTitle ?? '');

  for (const row of rows) {
    if (sourceMatchesContext(row.source, { subtopicTitle, moduleTitle })) {
      return row;
    }
  }

  return null;
}

function sourceMatchesContext(
  source: Record<string, unknown> | undefined,
  params: { subtopicTitle: string; moduleTitle: string },
) {
  const sourceScope = typeof source?.scope === 'string' ? source.scope : '';
  const sourceSubtopicTitle = normalizeIdentifier(
    typeof source?.subtopicTitle === 'string' ? source.subtopicTitle : '',
  );
  const sourceModuleTitle = normalizeIdentifier(
    typeof source?.moduleTitle === 'string' ? source.moduleTitle : '',
  );
  const wantsModule =
    (params.subtopicTitle && isDiscussionLabel(params.subtopicTitle)) ||
    (params.moduleTitle && params.subtopicTitle === params.moduleTitle);

  if (wantsModule) {
    return (
      sourceScope === 'module' &&
      Boolean(params.moduleTitle) &&
      (sourceModuleTitle === params.moduleTitle || sourceSubtopicTitle === params.moduleTitle)
    );
  }

  if (sourceScope === 'module') {
    return false;
  }

  return Boolean(params.subtopicTitle) && sourceSubtopicTitle === params.subtopicTitle;
}

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

interface TryRegenerateParams {
  courseId: string;
  subtopicId: string;
  subtopicTitle?: string | null;
  moduleTitle?: string | null;
  generationMode?: 'ai_initial' | 'ai_regenerated';
  generationTrigger?: string;
}

function scheduleTemplatePreparation(params: TryRegenerateParams) {
  const lockKey = [
    params.courseId,
    params.subtopicId,
    normalizeIdentifier(params.moduleTitle ?? ''),
    normalizeIdentifier(params.subtopicTitle ?? ''),
  ].join(':');

  if (templatePreparationLocks.has(lockKey)) {
    console.info('[DiscussionStart] Template preparation already queued', {
      courseId: params.courseId,
      subtopicId: params.subtopicId,
    });
    return;
  }

  const lastAttemptAt = templatePreparationCooldowns.get(lockKey) ?? 0;
  if (Date.now() - lastAttemptAt < TEMPLATE_PREPARATION_COOLDOWN_MS) {
    console.info('[DiscussionStart] Template preparation cooldown active', {
      courseId: params.courseId,
      subtopicId: params.subtopicId,
    });
    return;
  }

  templatePreparationCooldowns.set(lockKey, Date.now());
  templatePreparationLocks.add(lockKey);
  after(async () => {
    try {
      const regenerated = await tryRegenerateTemplate(params);
      console.info('[DiscussionStart] Background template preparation finished', {
        courseId: params.courseId,
        subtopicId: params.subtopicId,
        regenerated,
      });
    } catch (error) {
      console.error('[DiscussionStart] Background template preparation failed', error);
    } finally {
      templatePreparationLocks.delete(lockKey);
    }
  });
}

async function tryRegenerateTemplate({
  courseId,
  subtopicId,
  subtopicTitle,
  moduleTitle,
  generationMode = 'ai_regenerated',
  generationTrigger = 'discussion_start_regeneration',
}: TryRegenerateParams): Promise<boolean> {
  try {
    const normalizedModuleTitle = moduleTitle?.trim() || '';
    const normalizedSubtopicTitle = subtopicTitle?.trim() || '';

    const { data: subtopicRecord, error: subtopicError } = await adminDb
      .from('subtopics')
      .select('id, title, content')
      .eq('id', subtopicId)
      .maybeSingle();

    if (subtopicError) {
      console.warn('[DiscussionStart] Failed to load subtopic for regeneration', subtopicError);
      return false;
    }

    if (!subtopicRecord) {
      console.warn('[DiscussionStart] Subtopic not found for regeneration', {
        courseId,
        subtopicId,
      });
      return false;
    }

    const fallbackTitle = typeof subtopicRecord.title === 'string' ? subtopicRecord.title : '';
    const moduleName = (normalizedModuleTitle || fallbackTitle || 'Modul').trim();
    const focusTitle = (normalizedSubtopicTitle || fallbackTitle || moduleName).trim();

    const isModuleScope =
      normalizeIdentifier(focusTitle) === normalizeIdentifier(moduleName) ||
      isDiscussionLabel(focusTitle);

    if (isModuleScope) {
      const context = await assembleModuleDiscussionContextFromDb({
        courseId,
        moduleTitle: moduleName,
        moduleRecord: subtopicRecord,
      });

      if (!context) {
        console.warn('[DiscussionStart] Unable to assemble module discussion context', {
          courseId,
          moduleTitle: moduleName,
        });
        return false;
      }

      const result = await generateModuleDiscussionTemplate({
        courseId,
        subtopicId: context.moduleId,
        moduleTitle: moduleName,
        summary: context.summary,
        learningObjectives: context.learningObjectives,
        keyTakeaways: context.keyTakeaways,
        misconceptions: context.misconceptions,
        subtopics: context.subtopics,
        generationMode,
        generationTrigger,
      });

      return Boolean(result);
    }

    const cacheKey = buildSubtopicCacheKey(courseId, moduleName, focusTitle);
    const { data: cacheRow, error: cacheError } = await adminDb
      .from('subtopic_cache')
      .select('content')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cacheError) {
      console.warn('[DiscussionStart] Failed to load cached subtopic content for regeneration', {
        courseId,
        cacheKey,
        error: cacheError,
      });
      return false;
    }

    const cacheContent = (cacheRow?.content ?? null) as SubtopicCacheContent | null;
    if (!cacheContent) {
      console.warn('[DiscussionStart] Cached content missing for regeneration', { cacheKey });
      return false;
    }

    const learningObjectives = toStringArray(cacheContent?.objectives);
    const keyTakeaways = toStringArray(cacheContent?.keyTakeaways);
    const misconceptions = extractMisconceptions(cacheContent);
    const summary = buildDiscussionSummary(cacheContent);

    const result = await generateDiscussionTemplate({
      courseId,
      subtopicId,
      moduleTitle: moduleName,
      subtopicTitle: focusTitle,
      learningObjectives,
      summary,
      keyTakeaways,
      misconceptions,
      generationMode,
      generationTrigger,
    });

    return Boolean(result);
  } catch (regenerateError) {
    console.error('[DiscussionStart] Failed to regenerate discussion template', regenerateError);
    return false;
  }
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

function buildInitialGoals(goals: DiscussionTemplate['learning_goals']): DiscussionSessionGoal[] {
  if (!Array.isArray(goals)) {
    return [];
  }

  return goals
    .filter((goal) => goal && typeof goal.id === 'string')
    .map((goal) => ({
      id: goal.id!,
      description: goal.description ?? '',
      rubric: goal.rubric ?? null,
      thinkingSkill: normalizeThinkingSkillMeta(goal.thinking_skill ?? goal.thinkingSkill),
      covered: false,
    }));
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

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function buildDiscussionSummary(content: SubtopicCacheContent | null): string {
  const summaryParts: string[] = [];

  if (content?.whatNext?.summary) {
    summaryParts.push(String(content.whatNext.summary));
  }

  if (Array.isArray(content?.keyTakeaways) && content.keyTakeaways.length > 0) {
    summaryParts.push(
      'Poin penting:\n' + content.keyTakeaways.map((item: string) => `- ${item}`).join('\n')
    );
  }

  if (Array.isArray(content?.objectives) && content.objectives.length > 0) {
    summaryParts.push(
      'Tujuan belajar:\n' + content.objectives.map((item: string) => `- ${item}`).join('\n')
    );
  }

  if (Array.isArray(content?.pages) && content.pages.length > 0) {
    const firstPage = content.pages[0];
    if (Array.isArray(firstPage?.paragraphs) && firstPage.paragraphs.length > 0) {
      summaryParts.push(firstPage.paragraphs[0]);
    }
  }

  return summaryParts.join('\n\n');
}

function extractMisconceptions(content: SubtopicCacheContent | null): string[] {
  if (Array.isArray(content?.commonPitfalls) && content.commonPitfalls.length > 0) {
    return toStringArray(content.commonPitfalls);
  }

  if (Array.isArray(content?.misconceptions) && content.misconceptions.length > 0) {
    return toStringArray(content.misconceptions);
  }

  return [];
}

function normalizeIdentifier(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function isDiscussionLabel(label: string): boolean {
  const normalized = normalizeIdentifier(label);
  return (
    normalized.includes('diskusi penutup') ||
    normalized.includes('closing discussion') ||
    normalized.includes('ringkasan diskusi')
  );
}

interface ModuleDiscussionContextParams {
  courseId: string;
  moduleTitle: string;
  moduleRecord: { id: string; title?: string | null; content?: string | null };
}

interface ModuleDiscussionContextResult {
  moduleId: string;
  summary: string;
  learningObjectives: string[];
  keyTakeaways: string[];
  misconceptions: string[];
  subtopics: Array<{
    title: string;
    summary: string;
    objectives: string[];
    keyTakeaways: string[];
    misconceptions: string[];
  }>;
}

async function assembleModuleDiscussionContextFromDb({
  courseId,
  moduleTitle,
  moduleRecord,
}: ModuleDiscussionContextParams): Promise<ModuleDiscussionContextResult | null> {
  let outline: { subtopics?: Array<string | { title?: string; overview?: string }> } | null = null;
  try {
    outline = moduleRecord?.content ? JSON.parse(String(moduleRecord.content)) : null;
  } catch (parseError) {
    console.warn('[DiscussionStart] Failed to parse module content for aggregation', {
      courseId,
      moduleTitle,
      error: parseError,
    });
  }

  const moduleSubtopics = Array.isArray(outline?.subtopics) ? outline.subtopics : [];
  const aggregated: ModuleDiscussionContextResult['subtopics'] = [];
  const learningObjectives: string[] = [];
  const keyTakeaways: string[] = [];
  const misconceptions: string[] = [];

  for (const sub of moduleSubtopics) {
    const candidateTitle =
      typeof sub === 'string'
        ? sub
        : typeof sub?.title === 'string'
        ? sub.title
        : '';

    if (!candidateTitle || isDiscussionLabel(candidateTitle)) {
      continue;
    }

    const cacheKey = buildSubtopicCacheKey(courseId, moduleTitle, candidateTitle);
    const { data: cacheRow, error: cacheError } = await adminDb
      .from('subtopic_cache')
      .select('content')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cacheError) {
      console.warn('[DiscussionStart] Failed to load cached content for module aggregation', {
        courseId,
        moduleTitle,
        candidateTitle,
        error: cacheError,
      });
    }

    const cachedContent = (cacheRow?.content ?? null) as SubtopicCacheContent | null;
    const objectives = toStringArray(cachedContent?.objectives);
    const takeaways = toStringArray(cachedContent?.keyTakeaways);
    const subMisconceptions = extractMisconceptions(cachedContent);
    const summaryText =
      buildDiscussionSummary(cachedContent) ||
      (typeof sub === 'object' && typeof sub?.overview === 'string' ? sub.overview : '') ||
      objectives.join('; ');

    aggregated.push({
      title: candidateTitle,
      summary: summaryText,
      objectives,
      keyTakeaways: takeaways,
      misconceptions: subMisconceptions,
    });

    pushUniqueRange(learningObjectives, objectives);
    pushUniqueRange(keyTakeaways, takeaways);
    pushUniqueRange(misconceptions, subMisconceptions);
  }

  if (!aggregated.length) {
    return null;
  }

  const summary = buildModuleSummary(moduleTitle, aggregated);

  return {
    moduleId: moduleRecord.id,
    summary,
    learningObjectives,
    keyTakeaways,
    misconceptions,
    subtopics: aggregated,
  };
}

function pushUniqueRange(target: string[], values: string[]) {
  for (const value of values) {
    if (value && !target.includes(value)) {
      target.push(value);
    }
  }
}

function buildModuleSummary(
  moduleTitle: string,
  subtopics: ModuleDiscussionContextResult['subtopics']
): string {
  const sections = subtopics.map((item, index) => {
    const lines: string[] = [`${index + 1}. ${item.title}`];
    if (item.summary) {
      lines.push(`Ringkasan: ${item.summary}`);
    }
    if (item.objectives.length) {
      lines.push('Tujuan utama:');
      lines.push(...item.objectives.map((goal) => `- ${goal}`));
    }
    if (item.keyTakeaways.length) {
      lines.push('Poin penting:');
      lines.push(...item.keyTakeaways.map((point) => `- ${point}`));
    }
    return lines.join('\n');
  });

  return [
    `Modul "${moduleTitle}" mencakup ${subtopics.length} subtopik utama dengan fokus berikut:`,
    ...sections,
  ].join('\n\n');
}
