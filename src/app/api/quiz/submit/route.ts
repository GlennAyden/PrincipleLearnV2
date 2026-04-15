import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';
import { randomUUID } from 'crypto';
import { DatabaseService, DatabaseError, adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { verifyToken } from '@/lib/jwt';
import { QuizSubmitSchema, parseBody } from '@/lib/schemas';
import { resolveUserByIdentifier } from '@/services/auth.service';
import { syncQuizQuestions } from '@/lib/quiz-sync';

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

async function postHandler(req: NextRequest) {
  try {
    // Prefer middleware-injected header; fall back to JWT cookie directly.
    // Middleware header propagation has proven unreliable in production, so
    // we mirror the cookie-based pattern used by the working routes.
    let authUserId = req.headers.get('x-user-id');
    if (!authUserId) {
      const accessToken = req.cookies.get('access_token')?.value;
      const tokenPayload = accessToken ? verifyToken(accessToken) : null;
      if (tokenPayload?.userId) {
        authUserId = tokenPayload.userId;
      }
    }
    if (!authUserId) {
      return NextResponse.json(
        { error: 'Autentikasi diperlukan' },
        { status: 401 }
      );
    }

    const parsed = parseBody(QuizSubmitSchema, await req.json());
    if (!parsed.success) return parsed.response;
    const data = parsed.data;
    const answers = data.answers;

    // Find user in database using authenticated user ID from JWT
    const user = await resolveUserByIdentifier(authUserId);

    if (!user) {
      return NextResponse.json(
        { error: "Pengguna tidak ditemukan" },
        { status: 404 }
      );
    }

    // Find course in database
    const courses = await DatabaseService.getRecords('courses', {
      filter: { id: data.courseId },
      limit: 1
    });

    if (courses.length === 0) {
      return NextResponse.json(
        { error: "Kursus tidak ditemukan" },
        { status: 404 }
      );
    }

    // subtopics table is keyed per MODULE (subtopics.title = module title),
    // so we look up by moduleTitle first. subtopicTitle is kept as a
    // fallback for callers that only pass the subtopic label.
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

    // Lazy-seed helper: if the quiz table is empty for this (subtopic, label)
    // pair, try to re-insert from subtopic_cache before giving up. This
    // recovers from legacy/stale cache entries whose background sync never
    // succeeded and avoids discarding the user's in-flight answers.
    async function lazySeedQuizFromCache(): Promise<number> {
      if (!trimmedModuleTitle || !trimmedSubtopicLabel) return 0;
      try {
        const cacheKey = `${data.courseId}-${trimmedModuleTitle}-${trimmedSubtopicLabel}`;
        const { data: cacheRow } = await adminDb
          .from('subtopic_cache')
          .select('content')
          .eq('cache_key', cacheKey)
          .maybeSingle();
        const cachedContent = (cacheRow as { content?: { quiz?: unknown } } | null)?.content ?? null;
        const cachedQuiz = Array.isArray(cachedContent?.quiz) ? cachedContent.quiz : null;
        if (!cachedQuiz || cachedQuiz.length === 0) return 0;

        const seedResult = await syncQuizQuestions({
          adminDb,
          courseId: data.courseId,
          moduleTitle: trimmedModuleTitle,
          subtopicTitle: trimmedSubtopicLabel,
          quizItems: cachedQuiz,
          subtopicId: subtopicId ?? undefined,
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

    async function loadQuizQuestions(): Promise<Array<Record<string, unknown>>> {
      // Strategy 1: subtopic_id + subtopic_label (most specific). Wrapped
      // in try/catch so environments that haven't applied the subtopic_label
      // migration yet still work via Strategy 2.
      if (subtopicId && trimmedSubtopicLabel) {
        try {
          const scoped = await DatabaseService.getRecords<Record<string, unknown>>('quiz', {
            filter: {
              course_id: data.courseId,
              subtopic_id: subtopicId,
              subtopic_label: trimmedSubtopicLabel,
            },
            orderBy: { column: 'created_at', ascending: true },
          });
          if (scoped.length > 0) return scoped;
        } catch (scopedError) {
          console.warn('[QuizSubmit] subtopic_label filter failed (missing column?), falling back', scopedError);
        }
      }

      // Strategy 2: subtopic_id only (covers legacy rows with NULL label).
      if (subtopicId) {
        const byModule = await DatabaseService.getRecords<Record<string, unknown>>('quiz', {
          filter: { course_id: data.courseId, subtopic_id: subtopicId },
          orderBy: { column: 'created_at', ascending: true },
        });
        if (byModule.length > 0) return byModule;
      }

      // Strategy 3: course-wide fallback.
      return DatabaseService.getRecords<Record<string, unknown>>('quiz', {
        filter: { course_id: data.courseId },
        orderBy: { column: 'created_at', ascending: true },
      });
    }

    let quizQuestions = await loadQuizQuestions();
    console.log(
      `[QuizSubmit] Initial load: ${quizQuestions.length} quiz rows (subtopic_id=${subtopicId ?? 'null'}, label=${trimmedSubtopicLabel || 'null'})`,
    );

    // Lazy seed if empty — do NOT return 404 until we've tried to recover.
    if (quizQuestions.length === 0) {
      const seeded = await lazySeedQuizFromCache();
      if (seeded > 0) {
        quizQuestions = await loadQuizQuestions();
        console.log(`[QuizSubmit] Lazy-seeded ${seeded} quiz rows, re-loaded ${quizQuestions.length}`);
      }
    }

    if (quizQuestions.length === 0) {
      return NextResponse.json(
        { error: "Pertanyaan kuis tidak ditemukan di database. Silakan muat ulang halaman subtopik." },
        { status: 404 }
      );
    }

    // Legacy subtopics can hold multiple quiz rows per question (pre-d748282
    // reshuffles appended instead of replacing). Collapse to the most-recent
    // row per unique normalized question text so matching has a clean universe.
    const dedupeByQuestion = (rows: Array<Record<string, unknown>>) => {
      const byKey = new Map<string, Record<string, unknown>>();
      for (const row of rows) {
        const raw = typeof row.question === 'string' ? row.question : '';
        const key = raw.replace(/\s+/g, ' ').toLowerCase().trim();
        if (!key) continue;
        byKey.set(key, row); // ASC order → later writes overwrite → newest wins
      }
      return byKey.size > 0 ? Array.from(byKey.values()) : rows;
    };
    const dedupedQuestions = dedupeByQuestion(quizQuestions);
    if (dedupedQuestions.length !== quizQuestions.length) {
      console.log(
        `[QuizSubmit] Deduped ${quizQuestions.length} → ${dedupedQuestions.length} unique quiz questions`,
      );
    }

    // Determine the next attempt number for this (user, subtopic_id,
    // subtopic_label) tuple. Scoping by subtopic_label ensures sibling
    // subtopics inside the same module have independent attempt counters.
    let nextAttemptNumber = 1;
    if (subtopicId) {
      try {
        const attemptQuery = adminDb
          .from('quiz_submissions')
          .select('attempt_number')
          .eq('user_id', user.id)
          .eq('subtopic_id', subtopicId);
        const { data: maxRow } = trimmedSubtopicLabel
          ? await attemptQuery
              .eq('subtopic_label', trimmedSubtopicLabel)
              .order('attempt_number', { ascending: false })
              .limit(1)
              .maybeSingle()
          : await attemptQuery
              .order('attempt_number', { ascending: false })
              .limit(1)
              .maybeSingle();
        const existingMax = (maxRow as { attempt_number?: number } | null)?.attempt_number;
        if (typeof existingMax === 'number' && existingMax > 0) {
          nextAttemptNumber = existingMax + 1;
        }
      } catch (attemptLookupError) {
        console.warn('[QuizSubmit] Failed to determine next attempt number, defaulting to 1', attemptLookupError);
      }
    }

    // One UUID groups all answer rows from this submission batch.
    // Used as the `source_id` for cognitive scoring and for admin attempt grouping.
    const quizAttemptId = randomUUID();

    // Save each quiz answer to database with improved matching
    const matchingResults: Array<{ questionIndex: number; matched: boolean; method: string; quizId?: string; question: string }> = [];
    const matchedRows: Array<{
      user_id: string;
      quiz_id: string;
      course_id: string;
      subtopic_id: string | null;
      subtopic_label: string | null;
      module_index: number | null;
      subtopic_index: number | null;
      answer: string;
      is_correct: boolean;
      reasoning_note: string | null;
      attempt_number: number;
      quiz_attempt_id: string;
    }> = [];

    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i];
      let matchingQuiz: Record<string, unknown> | null | undefined = null;
      let matchMethod = '';

      // Strategy 1: Exact question text match
      matchingQuiz = dedupedQuestions.find(q => (q.question as string).trim() === answer.question.trim());
      if (matchingQuiz) {
        matchMethod = 'exact_text';
      }

      // Strategy 2: Fuzzy question text match (collapse whitespace, drop punctuation)
      if (!matchingQuiz) {
        const normalizeQuizText = (text: string) => text.replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').toLowerCase().trim();
        const normalizedAnswerQuestion = normalizeQuizText(answer.question);

        matchingQuiz = dedupedQuestions.find(q =>
          normalizeQuizText(q.question as string) === normalizedAnswerQuestion
        );
        if (matchingQuiz) {
          matchMethod = 'fuzzy_text';
        }
      }

      // Strategy 3: Options-signature match. The sorted+normalized option set
      // is a strong fingerprint of the underlying question even when the
      // prompt wording has drifted due to later regeneration, so it's our
      // primary fallback whenever text-based strategies miss.
      if (!matchingQuiz && Array.isArray(answer.options) && answer.options.length > 0) {
        const optionsKey = (opts: unknown): string | null => {
          if (!Array.isArray(opts) || opts.length === 0) return null;
          return opts
            .map((o) => String(o).replace(/\s+/g, ' ').trim().toLowerCase())
            .sort()
            .join('|');
        };
        const answerKey = optionsKey(answer.options);
        if (answerKey) {
          matchingQuiz = dedupedQuestions.find((q: Record<string, unknown>) => {
            const quizKey = optionsKey(q.options);
            return quizKey !== null && quizKey === answerKey;
          });
          if (matchingQuiz) {
            matchMethod = 'options_signature';
          }
        }
      }

      // Strategy 4: Match by question content similarity. Tokens containing
      // digits (e.g. "5-4-3-2-1") are kept regardless of length so numeric
      // identifiers aren't stripped by the short-word filter.
      if (!matchingQuiz) {
        const tokenize = (text: string) =>
          text.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3 || /\d/.test(w));
        const answerWords = tokenize(answer.question);
        if (answerWords.length > 0) {
          matchingQuiz = dedupedQuestions.find((q: Record<string, unknown>) => {
            const quizWords = tokenize(q.question as string);
            const commonWords = answerWords.filter((word: string) => quizWords.includes(word));
            return commonWords.length >= Math.max(2, Math.ceil(answerWords.length * 0.5));
          });
          if (matchingQuiz) {
            matchMethod = 'content_similarity';
          }
        }
      }

      // Strategy 5 (last resort): positional match when counts line up.
      // Moved to last position because reshuffled quiz UIs can deliver
      // answers in a different order than DB insertion order.
      if (!matchingQuiz && answers.length === dedupedQuestions.length && i < dedupedQuestions.length) {
        matchingQuiz = dedupedQuestions[i];
        matchMethod = 'index_position';
      }
      
      if (matchingQuiz) {
        const reasoningFromAnswer = normalizeText(answer.reasoningNote);
        const quizId = matchingQuiz.id as string;
        const userAnswerText = normalizeText(answer.userAnswer);
        // Server-side verify correctness against the DB's stored correct_answer,
        // rather than trusting the client's `answer.isCorrect`.
        const correctAnswerText = normalizeText(matchingQuiz.correct_answer);
        const serverIsCorrect = correctAnswerText.length > 0
          && userAnswerText.toLowerCase() === correctAnswerText.toLowerCase();

        matchedRows.push({
          user_id: user.id,
          quiz_id: quizId,
          course_id: data.courseId,
          subtopic_id: subtopicId,
          subtopic_label: trimmedSubtopicLabel || null,
          module_index: normalizeIndex(data.moduleIndex),
          subtopic_index: normalizeIndex(data.subtopicIndex),
          answer: userAnswerText,
          is_correct: serverIsCorrect,
          reasoning_note: reasoningFromAnswer || null,
          attempt_number: nextAttemptNumber,
          quiz_attempt_id: quizAttemptId,
        });

        matchingResults.push({
          questionIndex: i,
          matched: true,
          method: matchMethod,
          quizId,
          question: answer.question.substring(0, 50) + '...'
        });

        if (serverIsCorrect !== answer.isCorrect) {
          console.warn(
            `[QuizSubmit] Client/server is_correct mismatch for q${i + 1}: client=${answer.isCorrect} server=${serverIsCorrect}`
          );
        }
        console.log(`✅ Matched submission ${i + 1}/${answers.length} (${matchMethod}):`, answer.question.substring(0, 50) + '...');
      } else {
        matchingResults.push({
          questionIndex: i,
          matched: false,
          method: 'no_match',
          question: answer.question.substring(0, 50) + '...'
        });
        console.warn(`❌ No matching quiz found for answer ${i + 1}:`, answer.question.substring(0, 50) + '...');
      }
    }

    const failedMatches = matchingResults.filter((r) => !r.matched);
    const warnings = failedMatches.map((fm) => ({
      questionIndex: fm.questionIndex,
      question: fm.question,
      reason: 'Tidak dapat dicocokkan dengan pertanyaan kuis di database',
    }));

    if (matchedRows.length === 0) {
      return NextResponse.json(
        {
          error: 'Tidak ada jawaban yang dapat dicocokkan dengan pertanyaan kuis',
          matchingResults,
          warnings,
          details: {
            totalAnswers: answers.length,
            successfulMatches: 0,
            failedMatches: failedMatches.length,
          },
        },
        { status: 400 }
      );
    }

    const { data: insertedRows, error: insertError } = await adminDb
      .from('quiz_submissions')
      .insert(matchedRows);

    if (insertError) {
      throw new DatabaseError('Failed to insert quiz submissions', insertError);
    }

    const insertedRowList = Array.isArray(insertedRows)
      ? insertedRows
      : insertedRows
        ? [insertedRows]
        : [];
    const submissionIds = insertedRowList.map((row: Record<string, unknown>) => row.id);

    // Server-computed score. We ONLY count answers we successfully matched
    // against an authoritative DB row. Unmatched answers are skipped from
    // both numerator and denominator so a buggy client cannot inflate the
    // score by flipping `isCorrect` on an orphan row. If literally every
    // answer is unmatched the denominator collapses to 0 and we default
    // the score to 0 (the early-return on `matchedRows.length === 0`
    // above already handles the "all unmatched" case before we get here).
    const unmatchedCount = matchingResults.length - matchedRows.length;
    if (unmatchedCount > 0) {
      console.warn(
        `[quiz/submit] unmatched answers skipped from score: ${unmatchedCount}/${matchingResults.length}`,
      );
    }
    const serverCorrectCount = matchedRows.filter((r) => r.is_correct).length;
    const serverScore = matchedRows.length > 0
      ? Math.round((serverCorrectCount / matchedRows.length) * 100)
      : 0;

    console.log(`Quiz submission saved to database:`, {
      user: data.userId,
      course: data.courseId,
      subtopic: data.subtopic,
      subtopicTitle: data.subtopicTitle,
      clientScore: data.score,
      serverScore,
      submissionCount: submissionIds.length,
      warningCount: warnings.length,
      matchingResults,
    });

    const successfulMatches = matchedRows.length;

    const { moduleTitle: resolvedModuleTitle, subtopicTitle: resolvedSubtopicTitle } =
      await resolveModuleContext({
        courseId: data.courseId,
        moduleTitle: data.moduleTitle,
        subtopicTitle: data.subtopicTitle,
      });

    if (resolvedModuleTitle && resolvedSubtopicTitle) {
      await markSubtopicQuizCompletion({
        courseId: data.courseId,
        moduleTitle: resolvedModuleTitle,
        subtopicTitle: resolvedSubtopicTitle,
        userId: user.id,
      });
    }
    
    after(async () => {
      try {
        const qaText = matchedRows.map((row, i) => {
          const ans = answers[i];
          return `Q: ${ans?.question || ''}\nA: ${row.answer}\nCorrect: ${row.is_correct}\nReasoning: ${row.reasoning_note || '-'}`;
        }).join('\n---\n');

        if (qaText.length < 20) return;

        const { scoreAndSave } = await import('@/services/cognitive-scoring.service');
        await scoreAndSave({
          source: 'quiz_submission',
          user_id: user.id,
          course_id: data.courseId,
          source_id: quizAttemptId,
          user_text: qaText,
          prompt_or_question: `Kuis subtopik: ${data.subtopicTitle || ''} (attempt ${nextAttemptNumber})`,
          context_summary: `Skor: ${serverScore}, ${serverCorrectCount}/${matchedRows.length} benar, attempt ${nextAttemptNumber}`,
        });
      } catch (scoreError) {
        console.warn('[QuizSubmit] Cognitive scoring failed:', scoreError);
      }
    });

    return NextResponse.json({
      success: true,
      submissionIds,
      matchingResults,
      warnings,
      score: serverScore,
      correctCount: serverCorrectCount,
      attemptNumber: nextAttemptNumber,
      quizAttemptId,
      message: warnings.length > 0
        ? `Saved ${successfulMatches}/${data.answers.length} quiz answers (${warnings.length} unmatched) — attempt #${nextAttemptNumber}`
        : `Saved ${successfulMatches}/${data.answers.length} quiz answers — attempt #${nextAttemptNumber}`,
      details: {
        totalAnswers: answers.length,
        successfulMatches,
        failedMatches: warnings.length,
        subtopicId,
        quizQuestionsFound: quizQuestions.length,
      },
    });
  } catch (error: unknown) {
    console.error('Error saving quiz attempt:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan percobaan kuis' },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging(postHandler, {
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
}

async function markSubtopicQuizCompletion({
  courseId,
  moduleTitle,
  subtopicTitle,
  userId,
}: CompletionParams) {
  if (!courseId || !moduleTitle || !subtopicTitle || !userId) {
    return;
  }

  const cacheKey = `${courseId}-${moduleTitle}-${subtopicTitle}`;

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

    let content: Record<string, unknown> = (cacheRow.content ?? {}) as Record<string, unknown>;
    if (typeof content === 'string') {
      try {
        content = JSON.parse(content);
      } catch {
        content = {};
      }
    }

    if (!content || typeof content !== 'object') {
      content = {};
    }

    const existingUsers = Array.isArray(content.completed_users)
      ? (content.completed_users as unknown[]).map((value: unknown) => String(value))
      : [];

    if (!existingUsers.includes(userId)) {
      content.completed_users = [...existingUsers, userId];
      content.last_completed_at = new Date().toISOString();

      const { error: updateError } = await adminDb
        .from('subtopic_cache')
        .eq('cache_key', cacheKey)
        .update({
          content,
          updated_at: new Date().toISOString(),
        });

      if (updateError) {
        console.warn('[QuizSubmit] Failed to update completion state', updateError);
      }
    }
  } catch (completionError) {
    console.warn('[QuizSubmit] Unable to mark completion', completionError);
  }
}
