import { adminDb } from '@/lib/database';
import { buildSubtopicCacheKey } from '@/lib/quiz-sync';
import {
  isStructuredReflectionComplete,
  parseStructuredReflectionFields,
} from '@/lib/reflection-submission';
import type { ModulePrerequisiteDetails, ModulePrerequisiteItem } from '@/types/discussion';

interface SubtopicNode {
  title?: string;
  type?: string;
  isDiscussion?: boolean;
  overview?: string;
}

interface ModuleContent {
  module?: string;
  subtopics?: Array<string | SubtopicNode>;
}

interface CacheContent {
  quiz?: Array<{ question?: string }>;
  completed_users?: unknown[];
  [key: string]: unknown;
}

interface ReflectionRow {
  id: string;
  content: string | Record<string, unknown> | null;
  subtopic_id: string | null;
  subtopic_label: string | null;
  module_index: number | null;
  subtopic_index: number | null;
  created_at: string;
}

const QUIZ_MIN_QUESTIONS_PER_SUBTOPIC = 5;

function normalizeString(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isDiscussionNode(node: string | SubtopicNode | null | undefined): boolean {
  if (!node) return false;
  if (typeof node === 'string') {
    const normalized = normalizeString(node);
    return normalized.includes('diskusi penutup') || normalized.includes('closing discussion');
  }

  const title = typeof node.title === 'string' ? node.title : '';
  return (
    node.type === 'discussion' ||
    node.isDiscussion === true ||
    normalizeString(title).includes('diskusi penutup') ||
    normalizeString(title).includes('closing discussion')
  );
}

function extractTitle(node: string | SubtopicNode | null | undefined): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.title === 'string') return node.title;
  return '';
}

type QuizBucket = { primaryId: string; ids: string[]; question: string };

export async function evaluateModuleDiscussionPrerequisites(params: {
  courseId: string;
  moduleId: string;
  userId: string;
}): Promise<ModulePrerequisiteDetails> {
  const { courseId, moduleId, userId } = params;

  const { data: moduleRow, error: moduleError } = await adminDb
    .from('subtopics')
    .select('id, title, content, order_index')
    .eq('id', moduleId)
    .eq('course_id', courseId)
    .limit(1)
    .maybeSingle();

  if (moduleError) {
    throw new Error('Failed to load module information');
  }

  if (!moduleRow) {
    throw new Error('Module not found');
  }

  let parsedContent: ModuleContent = {};
  try {
    parsedContent = moduleRow.content ? JSON.parse(String(moduleRow.content)) : {};
  } catch (parseError) {
    console.warn('[DiscussionPrerequisites] Failed to parse module content', parseError);
  }

  const rawSubtopics = Array.isArray(parsedContent?.subtopics) ? parsedContent.subtopics : [];
  const learningSubtopics = rawSubtopics
    .map((node, index) => ({
      title: extractTitle(node),
      raw: node,
      index,
    }))
    .filter((item) => !isDiscussionNode(item.raw))
    .filter((item) => item.title);

  const expectedSubtopics = learningSubtopics.length;
  const moduleTitle =
    typeof parsedContent?.module === 'string' && parsedContent.module.trim()
      ? parsedContent.module.trim()
      : moduleRow.title ?? 'Modul';

  const cacheKeys = learningSubtopics.map((item) =>
    buildSubtopicCacheKey(courseId, moduleTitle, item.title),
  );

  let cacheEntries: Array<{ cache_key: string; content: CacheContent | null }> = [];
  if (cacheKeys.length > 0) {
    const { data: cacheData, error: cacheError } = await adminDb
      .from('subtopic_cache')
      .select('cache_key, content')
      .in('cache_key', cacheKeys);

    if (cacheError) {
      console.warn('[DiscussionPrerequisites] Failed to fetch cache entries', cacheError);
    } else {
      cacheEntries = cacheData ?? [];
    }
  }

  const cacheMap = new Map<string, CacheContent | null>();
  cacheEntries.forEach((entry) => {
    cacheMap.set(entry.cache_key, entry.content);
  });

  const { data: templateRows, error: templateError } = await adminDb
    .from('discussion_templates')
    .select('id, source, generated_by')
    .eq('course_id', courseId)
    .eq('subtopic_id', moduleId);

  if (templateError) {
    console.warn('[DiscussionPrerequisites] Failed to fetch templates', templateError);
  }

  const templateMap = new Map<string, Record<string, unknown>>();
  (templateRows ?? []).forEach((row: Record<string, unknown>) => {
    const generatedBy = String(row?.generated_by ?? 'auto');
    if (generatedBy === 'auto' || generatedBy === 'auto-module') {
      const src = (row?.source ?? {}) as Record<string, unknown>;
      const title = typeof src?.subtopicTitle === 'string' ? src.subtopicTitle : null;
      if (title) {
        templateMap.set(normalizeString(title), row);
      }
    }
  });

  const { data: quizRows, error: quizError } = await adminDb
    .from('quiz')
    .select('id, question, subtopic_label, created_at')
    .eq('course_id', courseId)
    .eq('subtopic_id', moduleId)
    .order('created_at', { ascending: false });

  if (quizError) {
    throw new Error('Failed to load quiz data');
  }

  const unlabeledKey = '';
  const quizRowsByLabel = new Map<string, Map<string, QuizBucket>>();
  (quizRows ?? []).forEach((row: Record<string, unknown>) => {
    if (typeof row?.question !== 'string') return;
    const labelKey = normalizeString((row?.subtopic_label as string | null) ?? '');
    if (!quizRowsByLabel.has(labelKey)) {
      quizRowsByLabel.set(labelKey, new Map());
    }
    const labelMap = quizRowsByLabel.get(labelKey)!;
    const questionKey = normalizeString(row.question);
    const id = row.id as string;
    const existing = labelMap.get(questionKey);
    if (!existing) {
      labelMap.set(questionKey, { primaryId: id, ids: [id], question: row.question });
    } else {
      existing.ids.push(id);
    }
  });

  const quizIds = (quizRows ?? []).map((row: Record<string, unknown>) => row.id as string);
  let submissionRows: Array<{ quiz_id: string }> = [];
  if (quizIds.length > 0) {
    const { data: submissions, error: submissionsError } = await adminDb
      .from('quiz_submissions')
      .select('quiz_id')
      .eq('user_id', userId)
      .in('quiz_id', quizIds);

    if (submissionsError) {
      console.warn('[DiscussionPrerequisites] Failed to fetch quiz submissions', submissionsError);
    } else {
      submissionRows = submissions ?? [];
    }
  }

  const submissionSet = new Set(submissionRows.map((row) => row.quiz_id));

  let reflectionRows: ReflectionRow[] = [];
  const { data: reflectionData, error: reflectionError } = await adminDb
    .from('jurnal')
    .select('id, content, subtopic_id, subtopic_label, module_index, subtopic_index, created_at')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .eq('subtopic_id', moduleId)
    .eq('type', 'structured_reflection')
    .order('created_at', { ascending: false })
    .limit(300);

  if (reflectionError) {
    console.warn('[DiscussionPrerequisites] Failed to fetch reflection rows', reflectionError);
  } else {
    reflectionRows = (reflectionData ?? []) as ReflectionRow[];
  }

  const moduleIndex =
    typeof moduleRow.order_index === 'number' && Number.isFinite(moduleRow.order_index)
      ? moduleRow.order_index
      : null;

  function findLatestReflection(item: { title: string; index: number }) {
    const normalizedTitle = normalizeString(item.title);
    return reflectionRows.find((row) => {
      if ((row.subtopic_id ?? null) !== moduleId) return false;
      if (normalizeString(row.subtopic_label) !== normalizedTitle) return false;
      if (row.subtopic_index !== null && row.subtopic_index !== item.index) return false;
      if (moduleIndex !== null && row.module_index !== null && row.module_index !== moduleIndex) {
        return false;
      }
      return true;
    }) ?? null;
  }

  const statuses: ModulePrerequisiteItem[] = learningSubtopics.map((item) => {
    const cacheKey = buildSubtopicCacheKey(courseId, moduleTitle, item.title);
    const cacheContent = cacheMap.get(cacheKey);
    const normalizedTitle = normalizeString(item.title);
    const generated = Boolean(cacheContent) || templateMap.has(normalizedTitle);

    const quizQuestions =
      generated && Array.isArray(cacheContent?.quiz)
        ? cacheContent.quiz
        : [];

    const scopedBucket = quizRowsByLabel.get(normalizedTitle);
    const resolvedBucket =
      scopedBucket && scopedBucket.size > 0
        ? scopedBucket
        : quizRowsByLabel.get(unlabeledKey);

    const questionBuckets: Array<{ ids: string[]; question: string }> = [];
    const missingQuestions: string[] = [];

    if (Array.isArray(quizQuestions) && quizQuestions.length > 0) {
      quizQuestions.forEach((questionItem: { question?: string }) => {
        const questionText = typeof questionItem?.question === 'string' ? questionItem.question : '';
        const normalized = normalizeString(questionText);
        if (normalized && resolvedBucket?.has(normalized)) {
          const bucket = resolvedBucket.get(normalized)!;
          questionBuckets.push({ ids: bucket.ids, question: bucket.question });
        } else if (questionText) {
          missingQuestions.push(questionText);
        }
      });
    }

    const completedUsers = Array.isArray(cacheContent?.completed_users)
      ? cacheContent.completed_users.map((value: unknown) => String(value))
      : [];
    const userHasCompletion = completedUsers.includes(userId);

    let answeredCount = questionBuckets.filter((bucket) =>
      bucket.ids.some((id) => submissionSet.has(id)),
    ).length;
    let quizQuestionCount = questionBuckets.length;

    if (userHasCompletion) {
      answeredCount = Math.max(answeredCount, QUIZ_MIN_QUESTIONS_PER_SUBTOPIC);
      quizQuestionCount = Math.max(quizQuestionCount, QUIZ_MIN_QUESTIONS_PER_SUBTOPIC);
    }

    const quizCompleted =
      userHasCompletion ||
      (quizQuestionCount >= QUIZ_MIN_QUESTIONS_PER_SUBTOPIC &&
        answeredCount >= quizQuestionCount);

    const latestReflection = findLatestReflection(item);
    const reflectionFields = latestReflection
      ? parseStructuredReflectionFields({ content: latestReflection.content ?? '' })
      : null;
    const reflectionCompleted = reflectionFields
      ? isStructuredReflectionComplete(reflectionFields)
      : false;
    const completed = generated && quizCompleted && reflectionCompleted;

    return {
      key: cacheKey,
      title: item.title,
      subtopicIndex: item.index,
      generated,
      quizQuestionCount,
      answeredCount,
      quizCompleted,
      reflectionCompleted,
      reflectionId: latestReflection?.id ?? null,
      reflectionSubmittedAt: latestReflection?.created_at ?? null,
      completed,
      missingQuestions,
      completedUsers,
      userHasCompletion,
    };
  });

  const generatedCount = statuses.filter((item) => item.generated).length;
  const reflectedCount = statuses.filter((item) => item.reflectionCompleted).length;
  const completedCount = statuses.filter((item) => item.completed).length;
  const totalQuizQuestions = statuses.reduce((sum, item) => sum + item.quizQuestionCount, 0);
  const answeredQuizQuestions = statuses.reduce((sum, item) => sum + item.answeredCount, 0);

  return {
    ready: statuses.every((status) => status.completed),
    summary: {
      expectedSubtopics,
      generatedSubtopics: generatedCount,
      reflectedSubtopics: reflectedCount,
      completedSubtopics: completedCount,
      totalQuizQuestions,
      answeredQuizQuestions,
      minQuestionsPerSubtopic: QUIZ_MIN_QUESTIONS_PER_SUBTOPIC,
    },
    subtopics: statuses,
  };
}
