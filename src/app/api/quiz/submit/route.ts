import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService, DatabaseError, adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { QuizSubmitSchema, parseBody } from '@/lib/schemas';
import { resolveUserByIdentifier } from '@/services/auth.service';

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
    // Use middleware-injected user ID from verified JWT (prevents IDOR)
    const headerUserId = req.headers.get('x-user-id');
    if (!headerUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const parsed = parseBody(QuizSubmitSchema, await req.json());
    if (!parsed.success) return parsed.response;
    const data = parsed.data;
    const answers = data.answers;

    // Find user in database using authenticated user ID from JWT
    const user = await resolveUserByIdentifier(headerUserId);

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
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
        { error: "Course not found" },
        { status: 404 }
      );
    }

    // First, try to find the specific subtopic ID if we have subtopicTitle
    let subtopicId = null;
    if (data.subtopicTitle) {
      const subtopics = await DatabaseService.getRecords<{ id: string }>('subtopics', {
        filter: { 
          course_id: data.courseId,
          title: data.subtopicTitle
        },
        limit: 1
      });
      
      if (subtopics.length > 0) {
        subtopicId = subtopics[0].id;
      }
    }

    // Find quiz questions in database - try multiple strategies
    let quizQuestions: Array<Record<string, unknown>> = [];
    
    // Strategy 1: Use subtopic_id if we found it
    if (subtopicId) {
      quizQuestions = await DatabaseService.getRecords('quiz', {
        filter: { 
          course_id: data.courseId,
          subtopic_id: subtopicId 
        },
        orderBy: { column: 'created_at', ascending: true }
      });
      console.log(`Found ${quizQuestions.length} quiz questions using subtopic_id: ${subtopicId}`);
    }
    
    // Strategy 2: Fallback to all quiz questions for this course if no subtopic-specific questions found
    if (quizQuestions.length === 0) {
      quizQuestions = await DatabaseService.getRecords('quiz', {
        filter: { course_id: data.courseId },
        orderBy: { column: 'created_at', ascending: true }
      });
      console.log(`Fallback: Found ${quizQuestions.length} quiz questions for course: ${data.courseId}`);
    }

    if (quizQuestions.length === 0) {
      return NextResponse.json(
        { error: "Quiz questions not found in database. Please regenerate the subtopic content." },
        { status: 404 }
      );
    }

    // Save each quiz answer to database with improved matching
    const matchingResults: Array<{ questionIndex: number; matched: boolean; method: string; quizId?: string; question: string }> = [];
    const matchedRows: Array<{
      user_id: string;
      quiz_id: string;
      course_id: string;
      subtopic_id: string | null;
      module_index: number | null;
      subtopic_index: number | null;
      answer: string;
      is_correct: boolean;
      reasoning_note: string | null;
    }> = [];

    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i];
      let matchingQuiz: Record<string, unknown> | null | undefined = null;
      let matchMethod = '';

      // Strategy 1: Exact question text match
      matchingQuiz = quizQuestions.find(q => (q.question as string).trim() === answer.question.trim());
      if (matchingQuiz) {
        matchMethod = 'exact_text';
      }
      
      // Strategy 2: Fuzzy question text match (remove extra whitespace, punctuation)
      if (!matchingQuiz) {
        const normalizeQuizText = (text: string) => text.replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').toLowerCase().trim();
        const normalizedAnswerQuestion = normalizeQuizText(answer.question);

        matchingQuiz = quizQuestions.find(q =>
          normalizeQuizText(q.question as string) === normalizedAnswerQuestion
        );
        if (matchingQuiz) {
          matchMethod = 'fuzzy_text';
        }
      }
      
      // Strategy 3: Match by index position if we have the right number of questions
      if (!matchingQuiz && answers.length === quizQuestions.length && i < quizQuestions.length) {
        matchingQuiz = quizQuestions[i];
        matchMethod = 'index_position';
      }
      
      // Strategy 4: Match by question content similarity (contains similar words)
      if (!matchingQuiz) {
        const answerWords = answer.question.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        if (answerWords.length > 0) {
          matchingQuiz = quizQuestions.find((q: Record<string, unknown>) => {
            const quizWords = (q.question as string).toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
            const commonWords = answerWords.filter((word: string) => quizWords.includes(word));
            return commonWords.length >= Math.min(2, answerWords.length * 0.5);
          });
          if (matchingQuiz) {
            matchMethod = 'content_similarity';
          }
        }
      }
      
      if (matchingQuiz) {
        const reasoningFromAnswer = normalizeText(answer.reasoningNote);
        const reasoningFromArray = normalizeText(data.reasoningNotes?.[i]);
        const quizId = matchingQuiz.id as string;

        matchedRows.push({
          user_id: user.id,
          quiz_id: quizId,
          course_id: data.courseId,
          subtopic_id: subtopicId,
          module_index: normalizeIndex(data.moduleIndex),
          subtopic_index: normalizeIndex(data.subtopicIndex),
          answer: normalizeText(answer.userAnswer),
          is_correct: answer.isCorrect,
          reasoning_note: reasoningFromAnswer || reasoningFromArray || null,
        });

        matchingResults.push({
          questionIndex: i,
          matched: true,
          method: matchMethod,
          quizId,
          question: answer.question.substring(0, 50) + '...'
        });
        
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
    if (failedMatches.length > 0) {
      return NextResponse.json(
        {
          error: 'Some quiz answers could not be matched to quiz questions',
          matchingResults,
          details: {
            totalAnswers: answers.length,
            successfulMatches: matchedRows.length,
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
    
    console.log(`Quiz submission saved to database:`, {
      user: data.userId,
      course: data.courseId,
      subtopic: data.subtopic,
      subtopicTitle: data.subtopicTitle,
      score: data.score,
      submissionCount: submissionIds.length,
      matchingResults: matchingResults
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
    
    return NextResponse.json({ 
      success: true, 
      submissionIds,
      matchingResults,
      message: `Saved ${successfulMatches}/${data.answers.length} quiz answers to database`,
      details: {
        totalAnswers: answers.length,
        successfulMatches,
        failedMatches: 0,
        subtopicId,
        quizQuestionsFound: quizQuestions.length
      }
    });
  } catch (error: unknown) {
    console.error('Error saving quiz attempt:', error);
    return NextResponse.json(
      { error: 'Failed to save quiz attempt' },
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
