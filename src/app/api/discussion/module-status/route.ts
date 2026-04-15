import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';

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

interface SubtopicStatus {
  key: string;
  title: string;
  generated: boolean;
  quizQuestionCount: number;
  answeredCount: number;
  quizCompleted: boolean;
  missingQuestions: string[];
  completedUsers?: string[];
  userHasCompletion?: boolean;
}

const QUIZ_MIN_QUESTIONS_PER_SUBTOPIC = 5;

function normalizeString(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isDiscussionNode(node: string | SubtopicNode | null | undefined): boolean {
  if (!node) return false;
  if (typeof node === 'string') {
    return normalizeString(node).includes('diskusi penutup') || normalizeString(node).includes('closing discussion');
  }
  if (typeof node === 'object') {
    const title = typeof node.title === 'string' ? node.title : '';
    return (
      node.type === 'discussion' ||
      node.isDiscussion === true ||
      normalizeString(title).includes('diskusi penutup') ||
      normalizeString(title).includes('closing discussion')
    );
  }
  return false;
}

function extractTitle(node: string | SubtopicNode | null | undefined): string {
  if (!node) return '';
  if (typeof node === 'string') return node;
  if (typeof node.title === 'string') return node.title;
  return '';
}

async function getHandler(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const searchParams = request.nextUrl.searchParams;
    const courseId = searchParams.get('courseId');
    const moduleId = searchParams.get('moduleId');

    if (!courseId || !moduleId) {
      return NextResponse.json({ error: 'courseId and moduleId are required' }, { status: 400 });
    }

    const { data: moduleRow, error: moduleError } = await adminDb
      .from('subtopics')
      .select('id, title, content')
      .eq('id', moduleId)
      .eq('course_id', courseId)
      .limit(1)
      .maybeSingle();

    if (moduleError) {
      console.error('[DiscussionModuleStatus] Failed to fetch module', moduleError);
      return NextResponse.json({ error: 'Failed to load module information' }, { status: 500 });
    }

    if (!moduleRow) {
      return NextResponse.json({ error: 'Module not found' }, { status: 404 });
    }

    let parsedContent: ModuleContent = {};
    try {
      parsedContent = moduleRow.content ? JSON.parse(moduleRow.content as string) : {};
    } catch (parseError) {
      console.warn('[DiscussionModuleStatus] Failed to parse module content', parseError);
    }

    const rawSubtopics = Array.isArray(parsedContent?.subtopics) ? parsedContent.subtopics : [];
    const learningSubtopics = rawSubtopics
      .filter((node) => !isDiscussionNode(node))
      .map((node) => ({
        title: extractTitle(node),
        raw: node,
      }))
      .filter((item) => item.title);

    const expectedSubtopics = learningSubtopics.length;

    const moduleTitle =
      typeof parsedContent?.module === 'string' && parsedContent.module.trim()
        ? parsedContent.module.trim()
        : moduleRow.title ?? 'Modul';

    const cacheKeys = learningSubtopics.map(
      (item) => `${courseId}-${moduleTitle}-${item.title}`
    );

    let cacheEntries: Array<{ cache_key: string; content: CacheContent | null }> = [];
    if (cacheKeys.length > 0) {
      // adminDb (service role): subtopic_cache's RLS policy only grants
      // SELECT to role `authenticated`, and this app uses custom JWT not
      // Supabase Auth, so publicDb (anon role) silently returns zero rows.
      const { data: cacheData, error: cacheError } = await adminDb
        .from('subtopic_cache')
        .select('cache_key, content')
        .in('cache_key', cacheKeys);

      if (cacheError) {
        console.warn('[DiscussionModuleStatus] Failed to fetch cache entries', cacheError);
      } else {
        cacheEntries = cacheData ?? [];
      }
    }

    const cacheMap = new Map<string, CacheContent | null>();
    cacheEntries.forEach((entry) => {
      cacheMap.set(entry.cache_key, entry.content);
    });

    // Same RLS caveat as subtopic_cache above: discussion_templates grants
    // SELECT only to `authenticated`, so we must use the service-role client.
    const { data: templateRows, error: templateError } = await adminDb
      .from('discussion_templates')
      .select('id, source, generated_by')
      .eq('course_id', courseId)
      .eq('subtopic_id', moduleId);

    if (templateError) {
      console.warn('[DiscussionModuleStatus] Failed to fetch templates', templateError);
    }

    const templateMap = new Map<string, Record<string, unknown>>();
    (templateRows ?? []).forEach((row: Record<string, unknown>) => {
      if (((row?.generated_by as string) ?? 'auto') === 'auto') {
        const src = (row?.source ?? {}) as Record<string, unknown>;
        const title = typeof src?.subtopicTitle === 'string' ? src.subtopicTitle : null;
        if (title) {
          templateMap.set(normalizeString(title), row);
        }
      }
    });

  const { data: quizRows, error: quizError } = await adminDb
    .from('quiz')
    .select('id, question, explanation, subtopic_label, created_at')
    .eq('course_id', courseId)
    .eq('subtopic_id', moduleId)
    .order('created_at', { ascending: false });

    if (quizError) {
      console.error('[DiscussionModuleStatus] Failed to fetch quiz rows', quizError);
      return NextResponse.json({ error: 'Failed to load quiz data' }, { status: 500 });
    }

    // Group quiz rows by (normalized) subtopic_label so each learning subtopic
    // is matched against ONLY its own question set. Without this, legacy
    // sibling rows from pre-d748282 cross-pollinate and either inflate or
    // deflate the per-subtopic answered count. Rows with a null/empty label
    // land in an "unlabeled" bucket used as a fallback for legacy data that
    // predates the subtopic_label column.
    type QuizBucket = { primaryId: string; ids: string[]; question: string };
    const UNLABELED_KEY = '';
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
        .eq('user_id', tokenPayload.userId)
        .in('quiz_id', quizIds);

      if (submissionsError) {
        console.warn('[DiscussionModuleStatus] Failed to fetch quiz submissions', submissionsError);
      } else {
        submissionRows = submissions ?? [];
      }
    }

    const submissionSet = new Set(submissionRows.map((row) => row.quiz_id));

    const statuses: SubtopicStatus[] = learningSubtopics.map((item) => {
      const cacheKey = `${courseId}-${moduleTitle}-${item.title}`;
      const cacheContent = cacheMap.get(cacheKey);
      const normalizedTitle = normalizeString(item.title);
      const generated = Boolean(cacheContent) || templateMap.has(normalizedTitle);

      const quizQuestions =
        generated && Array.isArray(cacheContent?.quiz)
          ? cacheContent.quiz
          : [];

      // Pick this subtopic's own label bucket; fall back to the "unlabeled"
      // bucket when no scoped rows exist (e.g. pre-migration legacy rows).
      const scopedBucket = quizRowsByLabel.get(normalizedTitle);
      const resolvedBucket =
        scopedBucket && scopedBucket.size > 0
          ? scopedBucket
          : quizRowsByLabel.get(UNLABELED_KEY);

      const questionBuckets: Array<{ ids: string[]; question: string }> = [];
      const missingQuestions: string[] = [];

      if (Array.isArray(quizQuestions) && quizQuestions.length > 0) {
        quizQuestions.forEach((questionItem: { question?: string }) => {
          const questionText =
            typeof questionItem?.question === 'string'
              ? questionItem.question
              : '';
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
      const userHasCompletion = completedUsers.includes(tokenPayload.userId);

      let answeredCount = questionBuckets.filter((bucket) =>
        bucket.ids.some((id) => submissionSet.has(id))
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

      return {
        key: cacheKey,
        title: item.title,
        generated,
        quizQuestionCount,
        answeredCount,
        quizCompleted,
        missingQuestions,
        completedUsers,
        userHasCompletion,
      };
    });

    const generatedCount = statuses.filter((item) => item.generated).length;
    const totalQuizQuestions = statuses.reduce((sum, item) => sum + item.quizQuestionCount, 0);
    const answeredQuizQuestions = statuses.reduce((sum, item) => sum + item.answeredCount, 0);

    const ready = statuses.every(
      (status) => status.generated && status.quizCompleted
    );

    const responseBody = {
      ready,
      summary: {
        expectedSubtopics,
        generatedSubtopics: generatedCount,
        totalQuizQuestions,
        answeredQuizQuestions,
        minQuestionsPerSubtopic: QUIZ_MIN_QUESTIONS_PER_SUBTOPIC,
      },
      subtopics: statuses,
    };

    return NextResponse.json(responseBody);
  } catch (error) {
    console.error('[DiscussionModuleStatus] Unexpected error', error);
    return NextResponse.json({ error: 'Failed to evaluate module prerequisites' }, { status: 500 });
  }
}

export const GET = withApiLogging(getHandler, {
  label: 'discussion.module-status',
});
