import { adminDb } from '@/lib/database';
import { buildSubtopicCacheKey } from '@/lib/quiz-sync';
import {
  DiscussionTemplateGenerationError,
  generateDiscussionTemplate,
  generateModuleDiscussionTemplate,
} from '@/services/discussion/generateDiscussionTemplate';

interface DiscussionTemplate {
  phases?: Array<{
    id?: string;
    steps?: Array<{ key: string; prompt: string }>;
  }>;
  closing_message?: string;
  learning_goals?: unknown[];
}

export type TemplateRecord = {
  id: string;
  version: string;
  template: DiscussionTemplate;
  source?: Record<string, unknown>;
  generated_by?: string | null;
};

interface SubtopicCacheContent {
  objectives?: string[];
  keyTakeaways?: string[];
  commonPitfalls?: string[];
  misconceptions?: string[];
  whatNext?: { summary?: string };
  pages?: Array<{ paragraphs?: string[] }>;
  [key: string]: unknown;
}

interface ModuleSubtopicContext {
  title: string;
  summary: string;
  objectives: string[];
  keyTakeaways: string[];
  misconceptions: string[];
}

interface ModuleDiscussionContextResult {
  moduleId: string;
  summary: string;
  learningObjectives: string[];
  keyTakeaways: string[];
  misconceptions: string[];
  subtopics: ModuleSubtopicContext[];
}

export interface DiscussionTemplateContext {
  courseId: string;
  subtopicId: string;
  subtopicTitle?: string | null;
  moduleTitle?: string | null;
}

export type PreparationStatus = 'queued' | 'running' | 'ready' | 'failed' | 'superseded';

export interface PreparationState {
  status: PreparationStatus;
  jobId: string | null;
  message: string;
  retryAfterSeconds: number;
  error?: string | null;
  errorCode?: string | null;
  failureCount?: number;
}

export const DISCUSSION_TEMPLATE_PREPARING_CODE = 'DISCUSSION_TEMPLATE_PREPARING';
export const DISCUSSION_TEMPLATE_PREPARATION_FAILED_CODE = 'DISCUSSION_TEMPLATE_PREPARATION_FAILED';
export const DISCUSSION_TEMPLATE_PREPARING_MESSAGE =
  'Diskusi sedang disiapkan. Sistem sedang menyiapkan pertanyaan personal untuk modul ini.';
export const DISCUSSION_TEMPLATE_FAILED_MESSAGE =
  'Diskusi belum berhasil disiapkan. Tekan Mulai Ulang Diskusi. Jika tetap gagal, hubungi admin.';

const PREPARATION_GENERATED_BY = 'preparation-status';
const PREPARATION_RETRY_AFTER_SECONDS = 8;
const RUNNING_STALE_MS = 90_000;
const QUEUED_STALE_MS = 120_000;

export function normalizeIdentifier(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

export function isDiscussionLabel(label: string): boolean {
  const normalized = normalizeIdentifier(label);
  return (
    normalized.includes('diskusi penutup') ||
    normalized.includes('closing discussion') ||
    normalized.includes('ringkasan diskusi')
  );
}

export async function fetchReadyDiscussionTemplate(
  params: DiscussionTemplateContext,
): Promise<TemplateRecord | null> {
  const { subtopicId, courseId, subtopicTitle, moduleTitle } = params;

  let templateQuery = adminDb
    .from('discussion_templates')
    .select('id, version, template, source, generated_by')
    .eq('subtopic_id', subtopicId)
    .in('generated_by', ['auto', 'auto-module']);

  if (courseId) {
    templateQuery = templateQuery.eq('course_id', courseId);
  }

  const { data, error } = await templateQuery
    .order('version', { ascending: false })
    .limit(50);

  if (!error && data?.length) {
    const exactMatch = findMatchingTemplate(data, { subtopicTitle, moduleTitle }, true);
    if (exactMatch) {
      return exactMatch;
    }
    if (!subtopicTitle) {
      return data.find(isReadyTemplateRow) ?? null;
    }
  }

  if (courseId && subtopicTitle) {
    const { data: fallback, error: fallbackError } = await adminDb
      .from('discussion_templates')
      .select('id, version, template, source, generated_by')
      .eq('course_id', courseId)
      .in('generated_by', ['auto', 'auto-module'])
      .order('version', { ascending: false })
      .limit(150);

    if (!fallbackError && fallback?.length) {
      const exactMatch = findMatchingTemplate(fallback, { subtopicTitle, moduleTitle }, true);
      if (exactMatch) {
        return exactMatch;
      }
    }
  }

  if (error) {
    console.error('[DiscussionTemplatePreparation] Failed to load ready template', error);
  }

  return null;
}

export async function queueDiscussionTemplatePreparation(
  params: DiscussionTemplateContext & {
    trigger: string;
    mode?: 'ai_initial' | 'ai_regenerated';
  },
): Promise<PreparationState> {
  const ready = await fetchReadyDiscussionTemplate(params);
  if (ready) {
    return {
      status: 'ready',
      jobId: ready.id,
      message: 'Template diskusi sudah siap.',
      retryAfterSeconds: 0,
    };
  }

  const existing = await fetchLatestPreparationRow(params);
  if (existing && !isPreparationStale(existing)) {
    return stateFromPreparationRow(existing);
  }

  const inserted = await insertPreparationRow(params, 'queued');
  return stateFromPreparationRow(inserted);
}

export async function prepareDiscussionTemplateNow(
  params: DiscussionTemplateContext & {
    trigger: string;
    mode?: 'ai_initial' | 'ai_regenerated';
  },
): Promise<PreparationState> {
  const ready = await fetchReadyDiscussionTemplate(params);
  if (ready) {
    return {
      status: 'ready',
      jobId: ready.id,
      message: 'Template diskusi sudah siap.',
      retryAfterSeconds: 0,
    };
  }

  const existing = await fetchLatestPreparationRow(params);
  if (existing && getPreparationStatus(existing.source) === 'running' && !isPreparationStale(existing)) {
    return stateFromPreparationRow(existing);
  }

  const running = existing
    ? await updatePreparationRow(existing, params, 'running')
    : await insertPreparationRow(params, 'running');

  try {
    const generated = await generateTemplateForContext(params);
    if (generated) {
      await updatePreparationRow(running, params, 'superseded');
      return {
        status: 'ready',
        jobId: generated.templateId,
        message: 'Template diskusi sudah siap.',
        retryAfterSeconds: 0,
      };
    }

    const failed = await updatePreparationRow(
      running,
      params,
      'failed',
      'AI belum berhasil menyiapkan template diskusi personal.',
      'template_not_saved',
    );
    return stateFromPreparationRow(failed);
  } catch (error) {
    console.error('[DiscussionTemplatePreparation] Template preparation failed', error);
    const errorDetails = getPreparationErrorDetails(error);
    const failed = await updatePreparationRow(
      running,
      params,
      'failed',
      errorDetails.message,
      errorDetails.code,
    );
    return stateFromPreparationRow(failed);
  }
}

async function generateTemplateForContext(
  params: DiscussionTemplateContext & {
    trigger: string;
    mode?: 'ai_initial' | 'ai_regenerated';
  },
) {
  const moduleName = (params.moduleTitle?.trim() || '').trim();
  const focusTitle = (params.subtopicTitle?.trim() || moduleName).trim();
  const isModuleScope =
    normalizeIdentifier(focusTitle) === normalizeIdentifier(moduleName) ||
    isDiscussionLabel(focusTitle);

  const { data: subtopicRecord, error: subtopicError } = await adminDb
    .from('subtopics')
    .select('id, title, content')
    .eq('id', params.subtopicId)
    .maybeSingle();

  if (subtopicError) {
    throw new Error('Failed to load subtopic for discussion preparation');
  }

  if (!subtopicRecord) {
    throw new Error('Subtopic not found for discussion preparation');
  }

  const fallbackTitle = typeof subtopicRecord.title === 'string' ? subtopicRecord.title : '';
  const resolvedModuleTitle = moduleName || fallbackTitle || 'Modul';
  const resolvedFocusTitle = focusTitle || fallbackTitle || resolvedModuleTitle;

  if (isModuleScope) {
    const context = await assembleModuleDiscussionContextFromDb({
      courseId: params.courseId,
      moduleTitle: resolvedModuleTitle,
      moduleRecord: subtopicRecord,
    });

    if (!context) {
      throw new Error('Unable to assemble module discussion context');
    }

    return generateModuleDiscussionTemplate({
      courseId: params.courseId,
      subtopicId: context.moduleId,
      moduleTitle: resolvedModuleTitle,
      summary: context.summary,
      learningObjectives: context.learningObjectives,
      keyTakeaways: context.keyTakeaways,
      misconceptions: context.misconceptions,
      subtopics: context.subtopics,
      generationMode: params.mode ?? 'ai_regenerated',
      generationTrigger: params.trigger,
    });
  }

  const cacheKey = buildSubtopicCacheKey(params.courseId, resolvedModuleTitle, resolvedFocusTitle);
  const { data: cacheRow, error: cacheError } = await adminDb
    .from('subtopic_cache')
    .select('content')
    .eq('cache_key', cacheKey)
    .maybeSingle();

  if (cacheError) {
    throw new Error('Failed to load cached subtopic content for discussion preparation');
  }

  const cacheContent = (cacheRow?.content ?? null) as SubtopicCacheContent | null;
  if (!cacheContent) {
    throw new Error('Cached content missing for discussion preparation');
  }

  return generateDiscussionTemplate({
    courseId: params.courseId,
    subtopicId: params.subtopicId,
    moduleTitle: resolvedModuleTitle,
    subtopicTitle: resolvedFocusTitle,
    learningObjectives: toStringArray(cacheContent.objectives),
    summary: buildDiscussionSummary(cacheContent),
    keyTakeaways: toStringArray(cacheContent.keyTakeaways),
    misconceptions: extractMisconceptions(cacheContent),
    generationMode: params.mode ?? 'ai_regenerated',
    generationTrigger: params.trigger,
  });
}

async function fetchLatestPreparationRow(
  params: DiscussionTemplateContext,
): Promise<TemplateRecord | null> {
  const { data, error } = await adminDb
    .from('discussion_templates')
    .select('id, version, template, source, generated_by')
    .eq('course_id', params.courseId)
    .eq('subtopic_id', params.subtopicId)
    .eq('generated_by', PREPARATION_GENERATED_BY)
    .order('version', { ascending: false })
    .limit(25);

  if (error) {
    console.warn('[DiscussionTemplatePreparation] Failed to fetch preparation rows', error);
    return null;
  }

  return findMatchingTemplate(data ?? [], params, false);
}

async function insertPreparationRow(
  params: DiscussionTemplateContext & {
    trigger: string;
    mode?: 'ai_initial' | 'ai_regenerated';
  },
  status: PreparationStatus,
): Promise<TemplateRecord> {
  const version = new Date().toISOString();
  const { data, error } = await adminDb
    .from('discussion_templates')
    .insert({
      course_id: params.courseId,
      subtopic_id: params.subtopicId,
      version,
      source: buildPreparationSource(params, status, version),
      template: {
        templateId: `preparation-${version}`,
        phases: [],
        learning_goals: [],
      },
      generated_by: PREPARATION_GENERATED_BY,
    });

  if (error || !data) {
    throw new Error('Failed to create discussion template preparation status');
  }

  return data as TemplateRecord;
}

async function updatePreparationRow(
  row: TemplateRecord,
  params: DiscussionTemplateContext & {
    trigger: string;
    mode?: 'ai_initial' | 'ai_regenerated';
  },
  status: PreparationStatus,
  errorMessage?: string,
  errorCode?: string,
): Promise<TemplateRecord> {
  const version = new Date().toISOString();
  const source = buildPreparationSource(params, status, version, row.source, errorMessage, errorCode);
  const { data, error } = await adminDb
    .from('discussion_templates')
    .eq('id', row.id)
    .update({
      version,
      source,
    });

  if (error) {
    throw new Error('Failed to update discussion template preparation status');
  }

  return ((Array.isArray(data) ? data[0] : data) ?? { ...row, version, source }) as TemplateRecord;
}

function buildPreparationSource(
  params: DiscussionTemplateContext & {
    trigger: string;
    mode?: 'ai_initial' | 'ai_regenerated';
  },
  status: PreparationStatus,
  timestamp: string,
  previousSource?: Record<string, unknown>,
  errorMessage?: string,
  errorCode?: string,
) {
  const previousGeneration =
    previousSource && typeof previousSource.generation === 'object' && previousSource.generation
      ? (previousSource.generation as Record<string, unknown>)
      : {};
  const startedAt =
    status === 'running'
      ? timestamp
      : typeof previousGeneration.startedAt === 'string'
      ? previousGeneration.startedAt
      : null;
  const previousFailureCount =
    typeof previousGeneration.failureCount === 'number'
      ? previousGeneration.failureCount
      : 0;
  const failureCount = status === 'failed' ? previousFailureCount + 1 : previousFailureCount;
  const previousRunCount =
    typeof previousGeneration.runCount === 'number'
      ? previousGeneration.runCount
      : 0;
  const runCount = status === 'running' ? previousRunCount + 1 : previousRunCount;

  return {
    ...(previousSource ?? {}),
    scope: isModuleScope(params) ? 'module' : 'subtopic',
    moduleTitle: params.moduleTitle ?? null,
    subtopicTitle: params.subtopicTitle ?? params.moduleTitle ?? null,
    generation: {
      ...previousGeneration,
      status,
      mode: params.mode ?? 'ai_regenerated',
      trigger: params.trigger,
      queuedAt:
        typeof previousGeneration.queuedAt === 'string'
          ? previousGeneration.queuedAt
          : timestamp,
      startedAt,
      finishedAt: status === 'failed' || status === 'superseded' ? timestamp : null,
      error: errorMessage ?? null,
      errorCode: errorCode ?? null,
      failureCount,
      runCount,
    },
  };
}

function findMatchingTemplate(
  rows: TemplateRecord[],
  params: { subtopicTitle?: string | null; moduleTitle?: string | null },
  readyOnly: boolean,
): TemplateRecord | null {
  const subtopicTitle = normalizeIdentifier(params.subtopicTitle ?? '');
  const moduleTitle = normalizeIdentifier(params.moduleTitle ?? '');

  for (const row of rows) {
    if (readyOnly && !isReadyTemplateRow(row)) {
      continue;
    }
    if (sourceMatchesContext(row.source, { subtopicTitle, moduleTitle })) {
      return row;
    }
  }

  return null;
}

function isReadyTemplateRow(row: TemplateRecord) {
  const generatedBy = String(row.generated_by ?? '');
  if (generatedBy !== 'auto' && generatedBy !== 'auto-module') {
    return false;
  }
  const status = getPreparationStatus(row.source);
  return status === null || status === 'ready';
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

function getPreparationStatus(source: Record<string, unknown> | undefined): PreparationStatus | null {
  const generation = source?.generation;
  if (!generation || typeof generation !== 'object') {
    return null;
  }
  const status = (generation as Record<string, unknown>).status;
  return isPreparationStatus(status) ? status : null;
}

function isPreparationStatus(status: unknown): status is PreparationStatus {
  return (
    status === 'queued' ||
    status === 'running' ||
    status === 'ready' ||
    status === 'failed' ||
    status === 'superseded'
  );
}

function isPreparationStale(row: TemplateRecord) {
  const generation =
    row.source?.generation && typeof row.source.generation === 'object'
      ? (row.source.generation as Record<string, unknown>)
      : {};
  const status = getPreparationStatus(row.source);
  if (status === 'running') {
    const startedAt = typeof generation.startedAt === 'string' ? Date.parse(generation.startedAt) : NaN;
    return !Number.isFinite(startedAt) || Date.now() - startedAt > RUNNING_STALE_MS;
  }
  if (status === 'queued') {
    const queuedAt =
      typeof generation.queuedAt === 'string'
        ? Date.parse(generation.queuedAt)
        : Date.parse(row.version);
    return !Number.isFinite(queuedAt) || Date.now() - queuedAt > QUEUED_STALE_MS;
  }
  if (status === 'failed') {
    const finishedAt =
      typeof generation.finishedAt === 'string'
        ? Date.parse(generation.finishedAt)
        : Date.parse(row.version);
    return (
      !Number.isFinite(finishedAt) ||
      Date.now() - finishedAt > PREPARATION_RETRY_AFTER_SECONDS * 1000
    );
  }

  return true;
}

function stateFromPreparationRow(row: TemplateRecord): PreparationState {
  const generation =
    row.source?.generation && typeof row.source.generation === 'object'
      ? (row.source.generation as Record<string, unknown>)
      : {};
  const status = getPreparationStatus(row.source) ?? 'queued';
  const error = typeof generation.error === 'string' ? generation.error : null;
  const errorCode = typeof generation.errorCode === 'string' ? generation.errorCode : null;
  const failureCount =
    typeof generation.failureCount === 'number' && Number.isFinite(generation.failureCount)
      ? generation.failureCount
      : 0;

  return {
    status,
    jobId: row.id,
    message:
      status === 'failed'
        ? DISCUSSION_TEMPLATE_FAILED_MESSAGE
        : DISCUSSION_TEMPLATE_PREPARING_MESSAGE,
    retryAfterSeconds: PREPARATION_RETRY_AFTER_SECONDS,
    error,
    errorCode,
    failureCount,
  };
}

function getPreparationErrorDetails(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (error instanceof DiscussionTemplateGenerationError) {
    return {
      code: error.code,
      message: 'AI belum berhasil menyiapkan template diskusi personal.',
    };
  }
  if (
    /cached content missing|subtopic not found|unable to assemble module discussion context/i.test(
      message,
    )
  ) {
    return {
      code: 'discussion_context_missing',
      message,
    };
  }
  return {
    code: 'discussion_template_preparation_failed',
    message: 'AI belum berhasil menyiapkan template diskusi personal.',
  };
}

function isModuleScope(params: DiscussionTemplateContext) {
  const subtopicTitle = normalizeIdentifier(params.subtopicTitle ?? '');
  const moduleTitle = normalizeIdentifier(params.moduleTitle ?? '');
  return (
    Boolean(subtopicTitle && moduleTitle && subtopicTitle === moduleTitle) ||
    isDiscussionLabel(params.subtopicTitle ?? '')
  );
}

async function assembleModuleDiscussionContextFromDb(params: {
  courseId: string;
  moduleTitle: string;
  moduleRecord: { id: string; title?: string | null; content?: string | null };
}): Promise<ModuleDiscussionContextResult | null> {
  let outline: { subtopics?: Array<string | { title?: string; overview?: string }> } | null = null;
  try {
    outline = params.moduleRecord?.content ? JSON.parse(String(params.moduleRecord.content)) : null;
  } catch (parseError) {
    console.warn('[DiscussionTemplatePreparation] Failed to parse module content', parseError);
  }

  const moduleSubtopics = Array.isArray(outline?.subtopics) ? outline.subtopics : [];
  const aggregated: ModuleSubtopicContext[] = [];
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

    const cacheKey = buildSubtopicCacheKey(params.courseId, params.moduleTitle, candidateTitle);
    const { data: cacheRow, error: cacheError } = await adminDb
      .from('subtopic_cache')
      .select('content')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cacheError) {
      console.warn('[DiscussionTemplatePreparation] Failed to load module cache item', {
        courseId: params.courseId,
        moduleTitle: params.moduleTitle,
        candidateTitle,
        error: cacheError,
      });
    }

    const cachedContent = (cacheRow?.content ?? null) as SubtopicCacheContent | null;
    const objectives = toStringArray(cachedContent?.objectives).slice(0, 3);
    const takeaways = toStringArray(cachedContent?.keyTakeaways).slice(0, 3);
    const subMisconceptions = extractMisconceptions(cachedContent).slice(0, 2);
    const summaryText =
      truncateText(buildDiscussionSummary(cachedContent), 900) ||
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

  return {
    moduleId: params.moduleRecord.id,
    summary: buildModuleSummary(params.moduleTitle, aggregated),
    learningObjectives: learningObjectives.slice(0, 8),
    keyTakeaways: keyTakeaways.slice(0, 10),
    misconceptions: misconceptions.slice(0, 6),
    subtopics: aggregated,
  };
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
      'Poin penting:\n' + content.keyTakeaways.slice(0, 5).map((item: string) => `- ${item}`).join('\n'),
    );
  }

  if (Array.isArray(content?.objectives) && content.objectives.length > 0) {
    summaryParts.push(
      'Tujuan belajar:\n' + content.objectives.slice(0, 5).map((item: string) => `- ${item}`).join('\n'),
    );
  }

  if (Array.isArray(content?.pages) && content.pages.length > 0) {
    const firstPage = content.pages[0];
    if (Array.isArray(firstPage?.paragraphs) && firstPage.paragraphs.length > 0) {
      summaryParts.push(firstPage.paragraphs[0]);
    }
  }

  return truncateText(summaryParts.join('\n\n'), 1400);
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

function pushUniqueRange(target: string[], values: string[]) {
  for (const value of values) {
    if (value && !target.includes(value)) {
      target.push(value);
    }
  }
}

function buildModuleSummary(moduleTitle: string, subtopics: ModuleSubtopicContext[]): string {
  const sections = subtopics.map((item, index) => {
    const lines: string[] = [`${index + 1}. ${item.title}`];
    if (item.summary) {
      lines.push(`Ringkasan: ${truncateText(item.summary, 500)}`);
    }
    if (item.objectives.length) {
      lines.push('Tujuan utama:');
      lines.push(...item.objectives.map((goal) => `- ${truncateText(goal, 180)}`));
    }
    if (item.keyTakeaways.length) {
      lines.push('Poin penting:');
      lines.push(...item.keyTakeaways.map((point) => `- ${truncateText(point, 180)}`));
    }
    return lines.join('\n');
  });

  return truncateText(
    [
      `Modul "${moduleTitle}" mencakup ${subtopics.length} subtopik utama dengan fokus berikut:`,
      ...sections,
    ].join('\n\n'),
    3000,
  );
}

function truncateText(value: string, maxLength: number) {
  if (!value || value.length <= maxLength) return value;
  return `${value.slice(0, maxLength - 3).trim()}...`;
}
