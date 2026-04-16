import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { DatabaseService, DatabaseError, adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { withProtection } from '@/lib/api-middleware';
import { verifyToken } from '@/lib/jwt';
import { QuizSubmitSchema, parseBody } from '@/lib/schemas';
import { assertCourseOwnership, toOwnershipError } from '@/lib/ownership';
import { resolveUserByIdentifier } from '@/services/auth.service';
import { syncQuizQuestions, buildSubtopicCacheKey } from '@/lib/quiz-sync';
import { withQuizCompletionState } from '@/lib/quiz-content';
import { ensureLeafSubtopic } from '@/lib/leaf-subtopics';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIndex(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return null;
}

function normalizeQuizText(text: string) {
  return text.replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').toLowerCase().trim();
}

function tokenizeQuizText(text: string) {
  return text.toLowerCase().split(/\s+/).filter((word) => word.length > 3 || /\d/.test(word));
}

function optionsSignature(options: unknown): string | null {
  if (!Array.isArray(options) || options.length === 0) return null;
  return options
    .map((option) => String(option).replace(/\s+/g, ' ').trim().toLowerCase())
    .sort()
    .join('|');
}

interface QuizRowRecord extends Record<string, unknown> {
  id?: string;
  question?: string;
  options?: unknown;
  correct_answer?: string;
  leaf_subtopic_id?: string | null;
}

interface CachedQuizItem {
  question: string;
  options: string[];
  correctIndex: number | null;
}

interface AuthoritativeQuizQuestion {
  quizId: string;
  question: string;
  options: string[];
  correctAnswer: string;
}

interface EvaluatedAnswer {
  questionIndex: number;
  question: string;
  userAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  reasoningNote: string | null;
}

function parseContentRecord(content: unknown): Record<string, unknown> {
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
      return {};
    } catch {
      return {};
    }
  }

  if (content && typeof content === 'object' && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }

  return {};
}

function extractCachedQuizItems(content: unknown): CachedQuizItem[] {
  const record = parseContentRecord(content);
  const quiz = record.quiz;
  if (!Array.isArray(quiz)) return [];

  return quiz
    .map((item) => {
      if (!item || typeof item !== 'object') return null;

      const question = typeof item.question === 'string' ? item.question.trim() : '';
      const options = Array.isArray(item.options)
        ? item.options
            .map((option: unknown) => (typeof option === 'string' ? option.trim() : ''))
            .filter(Boolean)
        : [];
      const correctIndex = typeof item.correctIndex === 'number' && item.correctIndex >= 0
        ? Math.floor(item.correctIndex)
        : null;

      if (!question || options.length !== 4) return null;

      return {
        question,
        options,
        correctIndex,
      };
    })
    .filter((item): item is CachedQuizItem => item !== null);
}

function dedupeByQuestion(rows: QuizRowRecord[]) {
  const byKey = new Map<string, QuizRowRecord>();
  for (const row of rows) {
    const raw = typeof row.question === 'string' ? row.question : '';
    const key = raw.replace(/\s+/g, ' ').toLowerCase().trim();
    if (!key) continue;
    byKey.set(key, row);
  }
  return byKey.size > 0 ? Array.from(byKey.values()) : rows;
}

function resolveCorrectAnswer(item: CachedQuizItem, matchedRow: QuizRowRecord | null): string {
  if (
    item.correctIndex !== null &&
    item.correctIndex >= 0 &&
    item.correctIndex < item.options.length
  ) {
    return item.options[item.correctIndex] ?? '';
  }

  const rowAnswer = typeof matchedRow?.correct_answer === 'string'
    ? matchedRow.correct_answer.trim()
    : '';

  return rowAnswer || item.options[0] || '';
}

function matchCachedQuizToRow(
  item: CachedQuizItem,
  latestRows: QuizRowRecord[],
  latestFirstRows: QuizRowRecord[],
  index: number,
): QuizRowRecord | null {
  const normalizedQuestion = normalizeQuizText(item.question);
  const itemOptionsKey = optionsSignature(item.options);

  const exactQuestionMatch = latestRows.find(
    (row) => typeof row.question === 'string' && row.question.trim() === item.question,
  );
  if (exactQuestionMatch) return exactQuestionMatch;

  const normalizedQuestionMatch = latestRows.find(
    (row) =>
      typeof row.question === 'string' &&
      normalizeQuizText(row.question) === normalizedQuestion,
  );
  if (normalizedQuestionMatch) return normalizedQuestionMatch;

  if (itemOptionsKey) {
    const optionsMatch = latestRows.find(
      (row) => optionsSignature(row.options) === itemOptionsKey,
    );
    if (optionsMatch) return optionsMatch;
  }

  const fallbackRow = latestRows[index];
  if (fallbackRow?.id) return fallbackRow;

  if (itemOptionsKey) {
    const latestOptionsMatch = latestFirstRows.find(
      (row) => optionsSignature(row.options) === itemOptionsKey,
    );
    if (latestOptionsMatch) return latestOptionsMatch;
  }

  return latestFirstRows.find(
    (row) =>
      typeof row.question === 'string' &&
      normalizeQuizText(row.question) === normalizedQuestion,
  ) ?? null;
}

function buildAuthoritativeQuiz(
  quizRows: QuizRowRecord[],
  cachedQuizItems: CachedQuizItem[],
): AuthoritativeQuizQuestion[] {
  if (cachedQuizItems.length > 0) {
    const latestRows = quizRows.slice(-cachedQuizItems.length);
    const latestFirstRows = [...quizRows].reverse();

    return cachedQuizItems
      .map((item, index) => {
        const matchedRow = matchCachedQuizToRow(item, latestRows, latestFirstRows, index);
        const quizId = typeof matchedRow?.id === 'string' ? matchedRow.id : '';
        const correctAnswer = resolveCorrectAnswer(item, matchedRow);

        if (!quizId || !correctAnswer) return null;

        return {
          quizId,
          question: item.question,
          options: item.options,
          correctAnswer,
        };
      })
      .filter((item): item is AuthoritativeQuizQuestion => item !== null);
  }

  return dedupeByQuestion(quizRows)
    .map((row) => {
      const quizId = typeof row.id === 'string' ? row.id : '';
      const question = typeof row.question === 'string' ? row.question.trim() : '';
      const options = Array.isArray(row.options) ? row.options.map((option) => String(option)) : [];
      const correctAnswer = typeof row.correct_answer === 'string' ? row.correct_answer.trim() : '';

      if (!quizId || !question || options.length !== 4 || !correctAnswer) {
        return null;
      }

      return {
        quizId,
        question,
        options,
        correctAnswer,
      };
    })
    .filter((item): item is AuthoritativeQuizQuestion => item !== null);
}

function isMissingInsertQuizAttemptFunction(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const record = error as { code?: unknown; message?: unknown };
  return (
    record.code === 'PGRST202' ||
    (typeof record.message === 'string' && record.message.includes('insert_quiz_attempt'))
  );
}

async function resolveLegacyAttemptNumber(params: {
  userId: string;
  courseId: string;
  subtopicId: string | null;
  subtopicLabel: string | null;
}): Promise<number> {
  const baseFilter: Record<string, string> = {
    user_id: params.userId,
    course_id: params.courseId,
  };

  if (params.subtopicId) {
    baseFilter.subtopic_id = params.subtopicId;
  }

  if (params.subtopicLabel) {
    baseFilter.subtopic_label = params.subtopicLabel;
  }

  const latestRows = await DatabaseService.getRecords<{
    attempt_number?: number | null;
  }>('quiz_submissions', {
    filter: baseFilter,
    orderBy: { column: 'attempt_number', ascending: false },
    limit: 1,
  });

  const latestAttemptNumber = latestRows[0]?.attempt_number ?? 0;
  return latestAttemptNumber + 1;
}

async function insertQuizAttemptFallback(params: {
  userId: string;
  courseId: string;
  subtopicId: string | null;
  subtopicLabel: string | null;
  moduleIndex: number | null;
  subtopicIndex: number | null;
  quizAttemptId: string;
  rows: Array<{
    quiz_id: string;
    answer: string;
    is_correct: boolean;
    reasoning_note: string | null;
  }>;
}): Promise<{
  insertedRows: Array<{
    submission_id: string;
    attempt_number: number;
    quiz_attempt_id: string;
  }>;
  attempt_number: number;
  quiz_attempt_id: string;
}> {
  const attemptNumber = await resolveLegacyAttemptNumber({
    userId: params.userId,
    courseId: params.courseId,
    subtopicId: params.subtopicId,
    subtopicLabel: params.subtopicLabel,
  });

  const insertedRows: Array<{
    submission_id: string;
    attempt_number: number;
    quiz_attempt_id: string;
  }> = [];

  for (const row of params.rows) {
    const { data, error } = await adminDb
      .from('quiz_submissions')
      .insert({
        user_id: params.userId,
        quiz_id: row.quiz_id,
        course_id: params.courseId,
        subtopic_id: params.subtopicId,
        subtopic_label: params.subtopicLabel,
        module_index: params.moduleIndex,
        subtopic_index: params.subtopicIndex,
        answer: row.answer,
        is_correct: row.is_correct,
        reasoning_note: row.reasoning_note,
        attempt_number: attemptNumber,
        quiz_attempt_id: params.quizAttemptId,
      });

    if (error) {
      throw new DatabaseError('Failed to insert quiz submissions', error);
    }

    const inserted = Array.isArray(data) ? data[0] : data;
    if (!inserted || typeof inserted !== 'object') {
      throw new DatabaseError('Failed to insert quiz submissions');
    }

    insertedRows.push({
      submission_id: typeof (inserted as Record<string, unknown>).id === 'string'
        ? (inserted as Record<string, unknown>).id as string
        : '',
      attempt_number: typeof (inserted as Record<string, unknown>).attempt_number === 'number'
        ? (inserted as Record<string, unknown>).attempt_number as number
        : attemptNumber,
      quiz_attempt_id: typeof (inserted as Record<string, unknown>).quiz_attempt_id === 'string'
        ? (inserted as Record<string, unknown>).quiz_attempt_id as string
        : params.quizAttemptId,
    });
  }

  return {
    insertedRows,
    attempt_number: attemptNumber,
    quiz_attempt_id: params.quizAttemptId,
  };
}

function matchAnswerToQuestion(
  answer: {
    question: string;
    options: string[];
  },
  authoritativeQuiz: AuthoritativeQuizQuestion[],
  usedQuizIds: Set<string>,
  index: number,
): { quiz: AuthoritativeQuizQuestion | null; method: string } {
  const availableQuiz = authoritativeQuiz.filter((quiz) => !usedQuizIds.has(quiz.quizId));
  const normalizedQuestion = normalizeQuizText(answer.question);
  const answerOptionsKey = optionsSignature(answer.options);

  const exactTextMatch = availableQuiz.find((quiz) => quiz.question.trim() === answer.question.trim()) ?? null;
  if (exactTextMatch) return { quiz: exactTextMatch, method: 'exact_text' };

  const normalizedTextMatch = availableQuiz.find(
    (quiz) => normalizeQuizText(quiz.question) === normalizedQuestion,
  ) ?? null;
  if (normalizedTextMatch) return { quiz: normalizedTextMatch, method: 'fuzzy_text' };

  if (answerOptionsKey) {
    const optionsMatch = availableQuiz.find(
      (quiz) => optionsSignature(quiz.options) === answerOptionsKey,
    ) ?? null;
    if (optionsMatch) return { quiz: optionsMatch, method: 'options_signature' };
  }

  const answerTokens = tokenizeQuizText(answer.question);
  if (answerTokens.length > 0) {
    const similarityMatch = availableQuiz.find((quiz) => {
      const quizTokens = tokenizeQuizText(quiz.question);
      const commonTokens = answerTokens.filter((token) => quizTokens.includes(token));
      return commonTokens.length >= Math.max(2, Math.ceil(answerTokens.length * 0.5));
    }) ?? null;
    if (similarityMatch) return { quiz: similarityMatch, method: 'content_similarity' };
  }

  const indexMatch = authoritativeQuiz[index];
  if (indexMatch && !usedQuizIds.has(indexMatch.quizId)) {
    return { quiz: indexMatch, method: 'index_position' };
  }

  return { quiz: null, method: 'no_match' };
}

async function postHandler(req: NextRequest) {
  try {
    let authUserId = req.headers.get('x-user-id');
    let authUserRole = req.headers.get('x-user-role') ?? undefined;
    if (!authUserId) {
      const accessToken = req.cookies.get('access_token')?.value;
      const tokenPayload = accessToken ? verifyToken(accessToken) : null;
      if (tokenPayload?.userId) {
        authUserId = tokenPayload.userId;
        authUserRole = authUserRole ?? tokenPayload.role;
      }
    }

    if (!authUserId) {
      return NextResponse.json(
        { error: 'Autentikasi diperlukan' },
        { status: 401 },
      );
    }

    const parsed = parseBody(QuizSubmitSchema, await req.json());
    if (!parsed.success) return parsed.response;

    const data = parsed.data;
    const answers = data.answers;

    try {
      await assertCourseOwnership(authUserId, data.courseId, authUserRole);
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

    const user = await resolveUserByIdentifier(authUserId);
    if (!user) {
      return NextResponse.json(
        { error: 'Pengguna tidak ditemukan' },
        { status: 404 },
      );
    }

    let subtopicId: string | null = null;
    const trimmedModuleTitle = data.moduleTitle?.trim() ?? '';
    const trimmedSubtopicLabel = data.subtopicTitle?.trim() ?? '';

    if (trimmedModuleTitle) {
      const { data: moduleRow } = await adminDb
        .from('subtopics')
        .select('id')
        .eq('course_id', data.courseId)
        .ilike('title', trimmedModuleTitle)
        .maybeSingle();
      subtopicId = (moduleRow as { id?: string } | null)?.id ?? null;
    }

    if (!subtopicId && trimmedSubtopicLabel) {
      const { data: subRow } = await adminDb
        .from('subtopics')
        .select('id')
        .eq('course_id', data.courseId)
        .ilike('title', trimmedSubtopicLabel)
        .maybeSingle();
      subtopicId = (subRow as { id?: string } | null)?.id ?? null;
    }

    const leafSubtopicId = subtopicId
      ? await ensureLeafSubtopic({
          courseId: data.courseId,
          moduleId: subtopicId,
          moduleTitle: trimmedModuleTitle,
          subtopicTitle: trimmedSubtopicLabel,
          moduleIndex: normalizeIndex(data.moduleIndex),
          subtopicIndex: normalizeIndex(data.subtopicIndex),
        })
      : null;

    async function lazySeedQuizFromCache(): Promise<number> {
      if (!trimmedModuleTitle || !trimmedSubtopicLabel) return 0;

      try {
        const cacheKey = buildSubtopicCacheKey(
          data.courseId,
          trimmedModuleTitle,
          trimmedSubtopicLabel,
        );
        const { data: cacheRow } = await adminDb
          .from('subtopic_cache')
          .select('content')
          .eq('cache_key', cacheKey)
          .maybeSingle();
        const cachedQuiz = extractCachedQuizItems(cacheRow?.content ?? null);
        if (cachedQuiz.length === 0) return 0;

        const seedResult = await syncQuizQuestions({
          adminDb,
          courseId: data.courseId,
          moduleTitle: trimmedModuleTitle,
          subtopicTitle: trimmedSubtopicLabel,
          quizItems: cachedQuiz.map((item) => ({
            question: item.question,
            options: item.options,
            correctIndex: item.correctIndex ?? 0,
          })),
          subtopicId: subtopicId ?? undefined,
          leafSubtopicId,
          moduleIndex: normalizeIndex(data.moduleIndex),
          subtopicIndex: normalizeIndex(data.subtopicIndex),
        });

        if (seedResult?.resolvedSubtopicId && !subtopicId) {
          subtopicId = seedResult.resolvedSubtopicId;
        }

        return seedResult?.insertedCount ?? 0;
      } catch (seedError) {
        console.warn('[QuizSubmit] Lazy seed from cache failed', seedError);
        return 0;
      }
    }

    async function loadQuizQuestions(): Promise<QuizRowRecord[]> {
      if (leafSubtopicId) {
        try {
          const byLeaf = await DatabaseService.getRecords<QuizRowRecord>('quiz', {
            filter: {
              course_id: data.courseId,
              leaf_subtopic_id: leafSubtopicId,
            },
            orderBy: { column: 'created_at', ascending: true },
          });
          if (byLeaf.length > 0) return byLeaf;
        } catch (leafLookupError) {
          console.warn('[QuizSubmit] leaf_subtopic_id filter failed, falling back', leafLookupError);
        }
      }

      if (subtopicId && trimmedSubtopicLabel) {
        try {
          return await DatabaseService.getRecords<QuizRowRecord>('quiz', {
            filter: {
              course_id: data.courseId,
              subtopic_id: subtopicId,
              subtopic_label: trimmedSubtopicLabel,
            },
            orderBy: { column: 'created_at', ascending: true },
          });
        } catch (scopedError) {
          console.warn('[QuizSubmit] subtopic_label filter failed (missing column?), falling back', scopedError);
        }
      }

      if (subtopicId) {
        const byModule = await DatabaseService.getRecords<QuizRowRecord>('quiz', {
          filter: { course_id: data.courseId, subtopic_id: subtopicId },
          orderBy: { column: 'created_at', ascending: true },
        });
        if (byModule.length > 0) return byModule;
      }

      return DatabaseService.getRecords<QuizRowRecord>('quiz', {
        filter: { course_id: data.courseId },
        orderBy: { column: 'created_at', ascending: true },
      });
    }

    let quizQuestions = await loadQuizQuestions();
    console.log(
      `[QuizSubmit] Initial load: ${quizQuestions.length} quiz rows (subtopic_id=${subtopicId ?? 'null'}, label=${trimmedSubtopicLabel || 'null'})`,
    );

    if (quizQuestions.length === 0) {
      const seeded = await lazySeedQuizFromCache();
      if (seeded > 0) {
        quizQuestions = await loadQuizQuestions();
        console.log(`[QuizSubmit] Lazy-seeded ${seeded} quiz rows, re-loaded ${quizQuestions.length}`);
      }
    }

    if (quizQuestions.length === 0) {
      return NextResponse.json(
        { error: 'Pertanyaan kuis tidak ditemukan di database. Silakan muat ulang halaman subtopik.' },
        { status: 404 },
      );
    }

    const cacheKey = buildSubtopicCacheKey(
      data.courseId,
      trimmedModuleTitle,
      trimmedSubtopicLabel,
    );
    const { data: cacheRow, error: cacheLookupError } = await adminDb
      .from('subtopic_cache')
      .select('content')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (cacheLookupError) {
      console.warn('[QuizSubmit] Failed to load subtopic cache', cacheLookupError);
    }

    const cachedQuizItems = extractCachedQuizItems(cacheRow?.content ?? null);
    const authoritativeQuiz = buildAuthoritativeQuiz(quizQuestions, cachedQuizItems);

    if (authoritativeQuiz.length === 0) {
      return NextResponse.json(
        { error: 'Versi kuis aktif tidak dapat dipastikan. Silakan muat ulang halaman atau pilih Kuis Baru.' },
        { status: 409 },
      );
    }

    if (authoritativeQuiz.length !== answers.length) {
      return NextResponse.json(
        {
          error: 'Versi kuis yang Anda kerjakan sudah berubah. Silakan muat ulang halaman atau pilih Kuis Baru untuk mendapatkan set soal terbaru.',
          code: 'QUIZ_QUESTIONS_DRIFTED',
          details: {
            submittedAnswers: answers.length,
            activeQuestions: authoritativeQuiz.length,
          },
        },
        { status: 409 },
      );
    }

    const quizAttemptId = randomUUID();
    const matchingResults: Array<{
      questionIndex: number;
      matched: boolean;
      method: string;
      quizId?: string;
      question: string;
    }> = [];
    const matchedRows: Array<{
      user_id: string;
      quiz_id: string;
      course_id: string;
      subtopic_id: string | null;
      subtopic_label: string | null;
      leaf_subtopic_id: string | null;
      module_index: number | null;
      subtopic_index: number | null;
      answer: string;
      is_correct: boolean;
      reasoning_note: string | null;
      attempt_number: number;
      quiz_attempt_id: string;
    }> = [];
    const evaluatedAnswers: EvaluatedAnswer[] = [];
    const usedQuizIds = new Set<string>();

    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i];
      const { quiz: matchingQuiz, method } = matchAnswerToQuestion(
        answer,
        authoritativeQuiz,
        usedQuizIds,
        i,
      );

      if (!matchingQuiz) {
        matchingResults.push({
          questionIndex: i,
          matched: false,
          method,
          question: answer.question.substring(0, 50) + '...',
        });
        console.warn(`No matching quiz found for answer ${i + 1}:`, answer.question.substring(0, 50) + '...');
        continue;
      }

      usedQuizIds.add(matchingQuiz.quizId);

      const reasoningFromAnswer = normalizeText(answer.reasoningNote);
      const userAnswerText = normalizeText(answer.userAnswer);
      const correctAnswerText = normalizeText(matchingQuiz.correctAnswer);
      const serverIsCorrect =
        correctAnswerText.length > 0 &&
        userAnswerText.toLowerCase() === correctAnswerText.toLowerCase();

      matchedRows.push({
        user_id: user.id,
        quiz_id: matchingQuiz.quizId,
        course_id: data.courseId,
        subtopic_id: subtopicId,
        subtopic_label: trimmedSubtopicLabel || null,
        leaf_subtopic_id: leafSubtopicId,
        module_index: normalizeIndex(data.moduleIndex),
        subtopic_index: normalizeIndex(data.subtopicIndex),
        answer: userAnswerText,
        is_correct: serverIsCorrect,
        reasoning_note: reasoningFromAnswer || null,
        attempt_number: 0,
        quiz_attempt_id: quizAttemptId,
      });

      evaluatedAnswers.push({
        questionIndex: i,
        question: matchingQuiz.question,
        userAnswer: userAnswerText,
        correctAnswer: correctAnswerText,
        isCorrect: serverIsCorrect,
        reasoningNote: reasoningFromAnswer || null,
      });

      matchingResults.push({
        questionIndex: i,
        matched: true,
        method,
        quizId: matchingQuiz.quizId,
        question: answer.question.substring(0, 50) + '...',
      });

      if (serverIsCorrect !== answer.isCorrect) {
        console.warn(
          `[QuizSubmit] Client/server is_correct mismatch for q${i + 1}: client=${answer.isCorrect} server=${serverIsCorrect}`,
        );
      }
    }

    const failedMatches = matchingResults.filter((result) => !result.matched);
    const warnings = failedMatches.map((result) => ({
      questionIndex: result.questionIndex,
      question: result.question,
      reason: 'Tidak dapat dicocokkan dengan pertanyaan kuis aktif',
    }));

    if (matchedRows.length !== authoritativeQuiz.length) {
      return NextResponse.json(
        {
          error: 'Versi kuis yang Anda kerjakan sudah berubah sebelum submit selesai diproses. Silakan muat ulang halaman atau pilih Kuis Baru untuk mencoba versi terbaru.',
          code: 'QUIZ_QUESTIONS_DRIFTED',
          matchingResults,
          warnings,
          details: {
            totalAnswers: answers.length,
            successfulMatches: matchedRows.length,
            failedMatches: failedMatches.length,
          },
        },
        { status: 409 },
      );
    }

    const rpcResult = await adminDb.rpc('insert_quiz_attempt', {
      p_user_id: user.id,
      p_course_id: data.courseId,
      p_subtopic_id: subtopicId,
      p_subtopic_label: trimmedSubtopicLabel || null,
      p_leaf_subtopic_id: leafSubtopicId,
      p_module_index: normalizeIndex(data.moduleIndex),
      p_subtopic_index: normalizeIndex(data.subtopicIndex),
      p_quiz_attempt_id: quizAttemptId,
      p_answers: matchedRows.map((row) => ({
        quiz_id: row.quiz_id,
        answer: row.answer,
        is_correct: row.is_correct,
        reasoning_note: row.reasoning_note,
      })),
    });

    let insertedRows = rpcResult.data;
    let insertError = rpcResult.error;

    if (insertError && isMissingInsertQuizAttemptFunction(insertError)) {
      console.warn('[QuizSubmit] insert_quiz_attempt RPC is missing; falling back to legacy row inserts');
      const fallbackResult = await insertQuizAttemptFallback({
        userId: user.id,
        courseId: data.courseId,
        subtopicId,
        subtopicLabel: trimmedSubtopicLabel || null,
        moduleIndex: normalizeIndex(data.moduleIndex),
        subtopicIndex: normalizeIndex(data.subtopicIndex),
        quizAttemptId,
        rows: matchedRows.map((row) => ({
          quiz_id: row.quiz_id,
          answer: row.answer,
          is_correct: row.is_correct,
          reasoning_note: row.reasoning_note,
        })),
      });
      insertedRows = fallbackResult.insertedRows;
      insertError = null;
    }

    if (insertError) {
      throw new DatabaseError('Failed to insert quiz submissions', insertError);
    }

    const insertedRowList = Array.isArray(insertedRows)
      ? insertedRows
      : insertedRows
        ? [insertedRows]
        : [];
    const submissionIds = insertedRowList.map((row: Record<string, unknown>) => row.submission_id);
    const persistedAttemptNumber = (() => {
      const first = insertedRowList[0] as Record<string, unknown> | undefined;
      return typeof first?.attempt_number === 'number' ? first.attempt_number : 1;
    })();
    const persistedAttemptId = (() => {
      const first = insertedRowList[0] as Record<string, unknown> | undefined;
      return typeof first?.quiz_attempt_id === 'string' ? first.quiz_attempt_id : quizAttemptId;
    })();

    const serverCorrectCount = evaluatedAnswers.filter((row) => row.isCorrect).length;
    const serverScore = Math.round((serverCorrectCount / authoritativeQuiz.length) * 100);

    console.log('Quiz submission saved to database:', {
      user: user.id,
      course: data.courseId,
      moduleTitle: data.moduleTitle,
      subtopicTitle: data.subtopicTitle,
      clientScore: data.score,
      serverScore,
      submissionCount: submissionIds.length,
      warningCount: warnings.length,
      matchingResults,
    });

    const { moduleTitle: resolvedModuleTitle, subtopicTitle: resolvedSubtopicTitle } =
      await resolveModuleContext({
        courseId: data.courseId,
        moduleTitle: data.moduleTitle,
        subtopicTitle: data.subtopicTitle,
      });

    const completedAt = new Date().toISOString();
    if (resolvedModuleTitle && resolvedSubtopicTitle) {
      await markSubtopicQuizCompletion({
        courseId: data.courseId,
        moduleTitle: resolvedModuleTitle,
        subtopicTitle: resolvedSubtopicTitle,
        userId: user.id,
        attemptId: persistedAttemptId,
        completedAt,
      });
    }

    after(async () => {
      try {
        const qaText = evaluatedAnswers
          .map((row) => {
            return `Q: ${row.question}\nA: ${row.userAnswer}\nCorrect answer: ${row.correctAnswer}\nCorrect: ${row.isCorrect}\nReasoning: ${row.reasoningNote || '-'}`;
          })
          .join('\n---\n');

        if (qaText.length < 20) return;

        const { scoreAndSave } = await import('@/services/cognitive-scoring.service');
        await scoreAndSave({
          source: 'quiz_submission',
          user_id: user.id,
          course_id: data.courseId,
          source_id: persistedAttemptId,
          user_text: qaText,
          prompt_or_question: `Kuis subtopik: ${data.subtopicTitle || ''} (attempt ${persistedAttemptNumber})`,
          context_summary: `Skor: ${serverScore}, ${serverCorrectCount}/${authoritativeQuiz.length} benar, attempt ${persistedAttemptNumber}`,
        });
      } catch (scoreError) {
        console.warn('[QuizSubmit] Cognitive scoring failed:', scoreError);
        try {
          await adminDb.from('api_logs').insert({
            path: '/api/quiz/submit',
            label: 'cognitive-scoring-failed',
            method: 'POST',
            status_code: 500,
            user_id: user.id,
            error_message: `quiz_submit cognitive scoring failed: ${scoreError instanceof Error ? scoreError.message : String(scoreError)}`,
            metadata: { quiz_attempt_id: persistedAttemptId, course_id: data.courseId },
            created_at: new Date().toISOString(),
          });
        } catch (logError) {
          console.error('[QuizSubmit] Failed to log scoring error to api_logs:', logError);
        }
      }
    });

    return NextResponse.json({
      success: true,
      submissionIds,
      matchingResults,
      warnings,
      score: serverScore,
      correctCount: serverCorrectCount,
      totalQuestions: authoritativeQuiz.length,
      attemptNumber: persistedAttemptNumber,
      quizAttemptId: persistedAttemptId,
      submittedAt: completedAt,
      evaluatedAnswers,
      questionEvaluations: evaluatedAnswers,
      discussionUnlocked: true,
      message: `Saved ${matchedRows.length}/${authoritativeQuiz.length} quiz answers - attempt #${persistedAttemptNumber}`,
      details: {
        totalAnswers: answers.length,
        successfulMatches: matchedRows.length,
        failedMatches: warnings.length,
        subtopicId,
        leafSubtopicId,
        quizQuestionsFound: quizQuestions.length,
        authoritativeQuestions: authoritativeQuiz.length,
      },
    });
  } catch (error: unknown) {
    console.error('Error saving quiz attempt:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan percobaan kuis' },
      { status: 500 },
    );
  }
}

export const POST = withApiLogging(withProtection(postHandler), {
  label: 'quiz-submit',
});

function normalizeValue(value?: string | null) {
  return (value ?? '').trim().toLowerCase();
}

interface ModuleContextParams {
  courseId: string;
  moduleTitle?: string | null;
  subtopicTitle?: string | null;
}

interface ModuleContextResult {
  moduleTitle: string;
  subtopicTitle: string;
}

async function resolveModuleContext({
  courseId,
  moduleTitle,
  subtopicTitle,
}: ModuleContextParams): Promise<ModuleContextResult> {
  const normalizedModule = normalizeValue(moduleTitle);
  const normalizedSubtopic = normalizeValue(subtopicTitle);

  if (normalizedModule && normalizedSubtopic) {
    return {
      moduleTitle: moduleTitle!.trim(),
      subtopicTitle: subtopicTitle!.trim(),
    };
  }

  try {
    const modules = await DatabaseService.getRecords<{ id: string; title: string; content: string }>('subtopics', {
      filter: { course_id: courseId },
      useServiceRole: true,
    });

    for (const row of modules) {
      const parsedTitle = typeof row?.title === 'string' ? row.title : '';
      let parsedContent: { module?: string; subtopics?: Array<string | { title?: string }> } | null = null;
      try {
        parsedContent = row?.content ? JSON.parse(row.content) : null;
      } catch {
        parsedContent = null;
      }

      const moduleName = parsedContent?.module || parsedTitle || '';
      const normalizedRowModule = normalizeValue(moduleName);

      if (normalizedModule && normalizedRowModule === normalizedModule) {
        return {
          moduleTitle: moduleName,
          subtopicTitle: subtopicTitle?.trim() || '',
        };
      }

      if (normalizedSubtopic && Array.isArray(parsedContent?.subtopics)) {
        const match = parsedContent.subtopics.find((item: string | { title?: string }) => {
          const candidate = typeof item === 'string' ? item : item?.title;
          return candidate && normalizeValue(candidate) === normalizedSubtopic;
        });

        if (match) {
          return {
            moduleTitle: moduleName,
            subtopicTitle:
              subtopicTitle?.trim() ||
              (typeof match === 'string' ? match : match?.title) ||
              '',
          };
        }
      }
    }
  } catch (contextError) {
    console.warn('[QuizSubmit] Failed to resolve module context', contextError);
  }

  return {
    moduleTitle: moduleTitle?.trim() || '',
    subtopicTitle: subtopicTitle?.trim() || '',
  };
}

interface CompletionParams {
  courseId: string;
  moduleTitle: string;
  subtopicTitle: string;
  userId: string;
  attemptId?: string;
  completedAt?: string;
}

async function markSubtopicQuizCompletion({
  courseId,
  moduleTitle,
  subtopicTitle,
  userId,
  attemptId,
  completedAt,
}: CompletionParams) {
  if (!courseId || !moduleTitle || !subtopicTitle || !userId) {
    return;
  }

  const cacheKey = buildSubtopicCacheKey(courseId, moduleTitle, subtopicTitle);

  try {
    const { data: cacheRow, error } = await adminDb
      .from('subtopic_cache')
      .select('cache_key, content')
      .eq('cache_key', cacheKey)
      .maybeSingle();

    if (error) {
      console.warn('[QuizSubmit] Failed to load cache for completion tracking', error);
      return;
    }

    if (!cacheRow) {
      console.warn('[QuizSubmit] Cache entry not found for key', cacheKey);
      return;
    }

    const existingContent = parseContentRecord(cacheRow.content ?? {});
    const nextContent = withQuizCompletionState(
      existingContent,
      userId,
      attemptId,
      completedAt,
    );

    const { error: updateError } = await adminDb
      .from('subtopic_cache')
      .eq('cache_key', cacheKey)
      .update({
        content: nextContent,
        updated_at: completedAt ?? new Date().toISOString(),
      });

    if (updateError) {
      console.warn('[QuizSubmit] Failed to update completion state', updateError);
    }
  } catch (completionError) {
    console.warn('[QuizSubmit] Unable to mark completion', completionError);
  }
}
