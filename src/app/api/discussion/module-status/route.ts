import { NextRequest, NextResponse } from 'next/server';

import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';

interface ModuleContent {
  module?: string;
  subtopics?: Array<any>;
}

interface SubtopicStatus {
  key: string;
  title: string;
  generated: boolean;
  quizQuestionCount: number;
  answeredCount: number;
  quizCompleted: boolean;
  missingQuestions: string[];
}

const QUIZ_MIN_QUESTIONS_PER_SUBTOPIC = 5;

function normalizeString(value: string | null | undefined) {
  return (value ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function isDiscussionNode(node: any) {
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

function extractTitle(node: any): string {
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

    let cacheEntries: Array<{ cache_key: string; content: any }> = [];
    if (cacheKeys.length > 0) {
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

    const cacheMap = new Map<string, any>();
    cacheEntries.forEach((entry) => {
      cacheMap.set(entry.cache_key, entry.content);
    });

    const { data: templateRows, error: templateError } = await adminDb
      .from('discussion_templates')
      .select('id, source, generated_by')
      .eq('course_id', courseId)
      .eq('subtopic_id', moduleId);

    if (templateError) {
      console.warn('[DiscussionModuleStatus] Failed to fetch templates', templateError);
    }

    const templateMap = new Map<string, any>();
    (templateRows ?? []).forEach((row: any) => {
      if ((row?.generated_by ?? 'auto') === 'auto') {
        const src = row?.source ?? {};
        const title = typeof src?.subtopicTitle === 'string' ? src.subtopicTitle : null;
        if (title) {
          templateMap.set(normalizeString(title), row);
        }
      }
    });

  const { data: quizRows, error: quizError } = await adminDb
    .from('quiz')
    .select('id, question, explanation, created_at')
    .eq('course_id', courseId)
    .eq('subtopic_id', moduleId)
    .order('created_at', { ascending: false });

    if (quizError) {
      console.error('[DiscussionModuleStatus] Failed to fetch quiz rows', quizError);
      return NextResponse.json({ error: 'Failed to load quiz data' }, { status: 500 });
    }

    const quizRowsByKey = new Map<
      string,
      { primaryId: string; ids: string[]; question: string }
    >();
    (quizRows ?? []).forEach((row) => {
      if (typeof row?.question === 'string') {
        const key = normalizeString(row.question);
        if (!quizRowsByKey.has(key)) {
          quizRowsByKey.set(key, { primaryId: row.id, ids: [row.id], question: row.question });
        } else {
          quizRowsByKey.get(key)!.ids.push(row.id);
        }
      }
    });

    const quizIds = (quizRows ?? []).map((row) => row.id);
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

      const questionBuckets: Array<{ ids: string[]; question: string }> = [];
      const missingQuestions: string[] = [];

      if (Array.isArray(quizQuestions) && quizQuestions.length > 0) {
        quizQuestions.forEach((questionItem: any) => {
          const questionText =
            typeof questionItem?.question === 'string'
              ? questionItem.question
              : '';
          const normalized = normalizeString(questionText);
          if (normalized && quizRowsByKey.has(normalized)) {
            const bucket = quizRowsByKey.get(normalized)!;
            questionBuckets.push({ ids: bucket.ids, question: bucket.question });
          } else if (questionText) {
            missingQuestions.push(questionText);
          }
        });
      }

      const answeredCount = questionBuckets.filter((bucket) =>
        bucket.ids.some((id) => submissionSet.has(id))
      ).length;
      const quizQuestionCount = questionBuckets.length;
      const quizCompleted =
        quizQuestionCount >= QUIZ_MIN_QUESTIONS_PER_SUBTOPIC &&
        answeredCount === quizQuestionCount;

      return {
        key: cacheKey,
        title: item.title,
        generated,
        quizQuestionCount,
        answeredCount,
        quizCompleted,
        missingQuestions,
      };
    });

    const generatedCount = statuses.filter((item) => item.generated).length;
    const totalQuizQuestions = statuses.reduce((sum, item) => sum + item.quizQuestionCount, 0);
    const answeredQuizQuestions = statuses.reduce((sum, item) => sum + item.answeredCount, 0);

    const ready = statuses.every(
      (status) =>
        status.generated &&
        status.quizQuestionCount >= QUIZ_MIN_QUESTIONS_PER_SUBTOPIC &&
        status.answeredCount === status.quizQuestionCount
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
