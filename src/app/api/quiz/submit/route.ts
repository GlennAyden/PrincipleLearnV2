import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService, adminDb } from '@/lib/database';

interface QuizAnswer {
  question: string;
  options: string[];
  userAnswer: string;
  isCorrect: boolean;
  questionIndex: number;
}

interface QuizSubmission {
  userId: string; // Ini adalah email user
  courseId: string;
  moduleTitle?: string;
  subtopic: string;
  subtopicTitle?: string; // Actual subtopic title from database
  moduleIndex?: number;
  subtopicIndex?: number;
  score: number;
  answers: QuizAnswer[];
}

export async function POST(req: NextRequest) {
  try {
    const data: QuizSubmission = await req.json();
    
    // Validasi data
    if (!data.userId || !data.courseId || !data.subtopic) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Find user in database
    const users = await DatabaseService.getRecords('users', {
      filter: { email: data.userId },
      limit: 1
    });

    if (users.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const user = users[0];

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
      const subtopics = await DatabaseService.getRecords('subtopics', {
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
    let quizQuestions: any[] = [];
    
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
    const submissionIds = [];
    const matchingResults = [];
    
    for (let i = 0; i < data.answers.length; i++) {
      const answer = data.answers[i];
      let matchingQuiz = null;
      let matchMethod = '';
      
      // Strategy 1: Exact question text match
      matchingQuiz = quizQuestions.find(q => q.question.trim() === answer.question.trim());
      if (matchingQuiz) {
        matchMethod = 'exact_text';
      }
      
      // Strategy 2: Fuzzy question text match (remove extra whitespace, punctuation)
      if (!matchingQuiz) {
        const normalizeText = (text: string) => text.replace(/\s+/g, ' ').replace(/[^\w\s]/g, '').toLowerCase().trim();
        const normalizedAnswerQuestion = normalizeText(answer.question);
        
        matchingQuiz = quizQuestions.find(q => 
          normalizeText(q.question) === normalizedAnswerQuestion
        );
        if (matchingQuiz) {
          matchMethod = 'fuzzy_text';
        }
      }
      
      // Strategy 3: Match by index position if we have the right number of questions
      if (!matchingQuiz && data.answers.length === quizQuestions.length && i < quizQuestions.length) {
        matchingQuiz = quizQuestions[i];
        matchMethod = 'index_position';
      }
      
      // Strategy 4: Match by question content similarity (contains similar words)
      if (!matchingQuiz) {
        const answerWords = answer.question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        if (answerWords.length > 0) {
          matchingQuiz = quizQuestions.find(q => {
            const quizWords = q.question.toLowerCase().split(/\s+/).filter(w => w.length > 3);
            const commonWords = answerWords.filter(word => quizWords.includes(word));
            return commonWords.length >= Math.min(2, answerWords.length * 0.5);
          });
          if (matchingQuiz) {
            matchMethod = 'content_similarity';
          }
        }
      }
      
      if (matchingQuiz) {
        const submissionData = {
          user_id: (user as any).id,
          quiz_id: matchingQuiz.id,
          answer: answer.userAnswer,
          is_correct: answer.isCorrect
        };

        const submission = await DatabaseService.insertRecord('quiz_submissions', submissionData);
        submissionIds.push(submission.id);
        
        matchingResults.push({
          questionIndex: i,
          matched: true,
          method: matchMethod,
          quizId: matchingQuiz.id,
          question: answer.question.substring(0, 50) + '...'
        });
        
        console.log(`✅ Saved submission ${i + 1}/${data.answers.length} (${matchMethod}):`, answer.question.substring(0, 50) + '...');
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
    
    console.log(`Quiz submission saved to database:`, {
      user: data.userId,
      course: data.courseId,
      subtopic: data.subtopic,
      subtopicTitle: data.subtopicTitle,
      score: data.score,
      submissionCount: submissionIds.length,
      matchingResults: matchingResults
    });

    const successfulMatches = matchingResults.filter(r => r.matched).length;

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
        userId: (user as any).id,
      });
    }
    
    return NextResponse.json({ 
      success: true, 
      submissionIds,
      matchingResults,
      message: `Saved ${successfulMatches}/${data.answers.length} quiz answers to database`,
      details: {
        totalAnswers: data.answers.length,
        successfulMatches,
        failedMatches: data.answers.length - successfulMatches,
        subtopicId,
        quizQuestionsFound: quizQuestions.length
      }
    });
  } catch (error: any) {
    console.error('Error saving quiz attempt:', error);
    return NextResponse.json(
      { error: error.message || "Failed to save quiz attempt" },
      { status: 500 }
    );
  }
}

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
    const modules = await DatabaseService.getRecords<any>('subtopics', {
      filter: { course_id: courseId },
      useServiceRole: true,
    });

    for (const row of modules) {
      const parsedTitle = typeof row?.title === 'string' ? row.title : '';
      let parsedContent: any = null;
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
        const match = parsedContent.subtopics.find((item: any) => {
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

    let content: any = cacheRow.content;
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
      ? content.completed_users.map((value: any) => String(value))
      : [];

    if (!existingUsers.includes(userId)) {
      content.completed_users = [...existingUsers, userId];
      content.last_completed_at = new Date().toISOString();

      const { error: updateError } = await adminDb
        .from('subtopic_cache')
        .update({
          content,
          updated_at: new Date().toISOString(),
        })
        .eq('cache_key', cacheKey);

      if (updateError) {
        console.warn('[QuizSubmit] Failed to update completion state', updateError);
      }
    }
  } catch (completionError) {
    console.warn('[QuizSubmit] Unable to mark completion', completionError);
  }
}
