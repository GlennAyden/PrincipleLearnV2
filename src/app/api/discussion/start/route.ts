import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { resolveDiscussionSubtopicId } from '@/lib/discussion/resolveSubtopic';
import {
  ThinkingSkillMeta,
  normalizeThinkingSkillMeta,
} from '@/lib/discussion/thinkingSkills';
import {
  generateDiscussionTemplate,
  generateModuleDiscussionTemplate,
} from '@/services/discussion/generateDiscussionTemplate';

type TemplateRecord = {
  id: string;
  version: string;
  template: any;
  source?: any;
};

type SessionRecord = {
  id: string;
  status: string;
  phase: string;
  learning_goals: any;
  template_id: string;
  course_id: string;
  subtopic_id: string;
};

interface DiscussionSessionGoal {
  id: string;
  description: string;
  rubric?: any;
  thinkingSkill?: ThinkingSkillMeta | null;
  covered: boolean;
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

    const subtopicId = await resolveDiscussionSubtopicId({
      courseId,
      subtopicId: rawSubtopicId,
      subtopicTitle,
    });

    if (!subtopicId) {
      return NextResponse.json(
        { error: 'Unable to resolve discussion context for this subtopic' },
        { status: 404 }
      );
    }

    let templateRow = await fetchLatestTemplate({ subtopicId, courseId, subtopicTitle, moduleTitle });
    if (!templateRow) {
      const regenerated = await tryRegenerateTemplate({
        courseId,
        subtopicId,
        subtopicTitle,
        moduleTitle,
      });

      if (regenerated) {
        templateRow = await fetchLatestTemplate({ subtopicId, courseId, subtopicTitle, moduleTitle });
      }
    }

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

    let session = await fetchExistingSession(tokenPayload.userId, courseId, subtopicId);
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
    await ensureProgressRecord(tokenPayload.userId, session.course_id, session.subtopic_id);

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

export const POST = withApiLogging(postHandler, {
  label: 'discussion.start',
});

async function fetchLatestTemplate(params: {
  subtopicId: string;
  courseId?: string;
  subtopicTitle?: string | null;
  moduleTitle?: string | null;
}): Promise<TemplateRecord | null> {
  const { subtopicId, courseId, subtopicTitle } = params;

  const { data, error } = await adminDb
    .from('discussion_templates')
    .select('id, version, template, source')
    .eq('subtopic_id', subtopicId)
    .order('version', { ascending: false })
    .limit(1);

  if (!error && data?.[0]) {
    return data[0];
  }

  if (courseId && subtopicTitle) {
    const { data: fallback, error: fallbackError } = await adminDb
      .from('discussion_templates')
      .select('id, version, template, source')
      .eq('course_id', courseId)
      .contains('source', { subtopicTitle })
      .order('version', { ascending: false })
      .limit(1);

    if (!fallbackError && fallback?.[0]) {
      return fallback[0];
    }
  }

  if (error) {
    console.error('[DiscussionStart] Failed to load template', error);
  }

  return null;
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
    })
    .select('id, status, phase, learning_goals, template_id, course_id, subtopic_id')
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

interface TryRegenerateParams {
  courseId: string;
  subtopicId: string;
  subtopicTitle?: string | null;
  moduleTitle?: string | null;
}

async function tryRegenerateTemplate({
  courseId,
  subtopicId,
  subtopicTitle,
  moduleTitle,
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
      });

      return Boolean(result);
    }

    const cacheKey = `${courseId}-${moduleName}-${focusTitle}`;
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

    const cacheContent = cacheRow?.content ?? null;
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
    });

    return Boolean(result);
  } catch (regenerateError) {
    console.error('[DiscussionStart] Failed to regenerate discussion template', regenerateError);
    return false;
  }
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

function buildInitialGoals(goals: any): DiscussionSessionGoal[] {
  if (!Array.isArray(goals)) {
    return [];
  }

  return goals
    .filter((goal) => goal && typeof goal.id === 'string')
    .map((goal) => ({
      id: goal.id,
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

function toStringArray(value: any): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function buildDiscussionSummary(content: any): string {
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

function extractMisconceptions(content: any): string[] {
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
  let outline: any = null;
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

    const cacheKey = `${courseId}-${moduleTitle}-${candidateTitle}`;
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

    const cachedContent = cacheRow?.content ?? null;
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
