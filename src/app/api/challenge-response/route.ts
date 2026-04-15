import { NextRequest, NextResponse, after } from 'next/server';
import { adminDb, DatabaseError } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';
import { withApiLogging } from '@/lib/api-logger';

function normalizeIndex(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

async function postHandler(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, courseId, moduleIndex, subtopicIndex, pageNumber, question, answer, feedback, reasoningNote } = body;

    const normalizedQuestion = normalizeText(question);
    const normalizedAnswer = normalizeText(answer);
    const normalizedFeedback = normalizeText(feedback);
    const normalizedReasoning = normalizeText(reasoningNote);

    if (!userId || !courseId || !normalizedQuestion || !normalizedAnswer) {
      return NextResponse.json(
        { error: 'Field wajib tidak lengkap: userId, courseId, question, answer' },
        { status: 400 }
      );
    }

    const accessToken = req.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }

    if (tokenPayload.userId !== userId) {
      return NextResponse.json({ error: 'Pengguna tidak cocok' }, { status: 403 });
    }

    // Create unique identifier for this challenge session
    const challengeId = `${courseId}_${moduleIndex}_${subtopicIndex}_${pageNumber}_${Date.now()}`;

    console.log('[Challenge Response] Attempting to save challenge response:', {
      challengeId,
      userId,
      courseId
    });

    // Try to save challenge response to database
    try {
      const timestamp = new Date().toISOString();
      // `reasoning_note` is persisted so admins can review the learner's
      // reasoning context. Stored as null when the user did not provide one.
      const challengeData = {
        id: challengeId,
        user_id: userId,
        course_id: courseId,
        module_index: normalizeIndex(moduleIndex),
        subtopic_index: normalizeIndex(subtopicIndex),
        page_number: normalizeIndex(pageNumber),
        question: normalizedQuestion,
        answer: normalizedAnswer,
        feedback: normalizedFeedback,
        reasoning_note: normalizedReasoning ? normalizedReasoning : null,
        created_at: timestamp,
        updated_at: timestamp
      };

      const { error: insertError } = await adminDb
        .from('challenge_responses')
        .insert(challengeData);

      if (insertError) {
        throw new DatabaseError('Failed to insert record into challenge_responses', insertError);
      }
      
      console.log('[Challenge Response] Successfully saved challenge response');

      after(async () => {
        try {
          const { scoreAndSave } = await import('@/services/cognitive-scoring.service');
          const contextSummary = normalizedReasoning
            ? `Reasoning: ${normalizedReasoning.slice(0, 300)}`
            : undefined;
          await scoreAndSave({
            source: 'challenge_response',
            user_id: userId,
            course_id: courseId,
            source_id: challengeId,
            user_text: normalizedAnswer,
            prompt_or_question: normalizedQuestion,
            ai_response: normalizedFeedback.slice(0, 500),
            context_summary: contextSummary,
          });
        } catch (scoreError) {
          console.warn('[ChallengeResponse] Cognitive scoring failed:', scoreError);
        }
      });

      return NextResponse.json({
        success: true,
        challengeId: challengeId,
        message: 'Respons tantangan berhasil disimpan'
      });
      
    } catch (dbError: unknown) {
      const message = dbError instanceof DatabaseError ? dbError.message : 'Unknown database error';
      const originalError = dbError instanceof DatabaseError ? dbError.originalError : dbError;
      console.error('[Challenge Response] Database error:', message, originalError);

      return NextResponse.json(
        { error: 'Gagal menyimpan respons tantangan' },
        { status: 500 }
      );
    }

  } catch (error: unknown) {
    console.error('Error in challenge response API:', error);
    return NextResponse.json(
      { error: 'Gagal memproses respons tantangan' },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging(postHandler, {
  label: 'challenge-response',
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const courseId = searchParams.get('courseId');
    const moduleIndex = searchParams.get('moduleIndex');
    const subtopicIndex = searchParams.get('subtopicIndex');
    const pageNumber = searchParams.get('pageNumber');

    if (!userId) {
      return NextResponse.json(
        { error: 'Parameter userId diperlukan' },
        { status: 400 }
      );
    }

    const accessToken = req.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }

    if (tokenPayload.userId !== userId) {
      return NextResponse.json({ error: 'Pengguna tidak cocok' }, { status: 403 });
    }

    console.log('[Challenge Response] Attempting to retrieve challenge responses for user:', userId);

    try {
      let query = adminDb
        .from('challenge_responses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (courseId) {
        query = query.eq('course_id', courseId);
      }

      if (moduleIndex !== null) {
        const parsedModule = parseInt(moduleIndex, 10);
        if (!Number.isNaN(parsedModule)) {
          query = query.eq('module_index', parsedModule);
        }
      }

      if (subtopicIndex !== null) {
        const parsedSubtopic = parseInt(subtopicIndex, 10);
        if (!Number.isNaN(parsedSubtopic)) {
          query = query.eq('subtopic_index', parsedSubtopic);
        }
      }

      if (pageNumber !== null) {
        const parsedPage = parseInt(pageNumber, 10);
        if (!Number.isNaN(parsedPage)) {
          query = query.eq('page_number', parsedPage);
        }
      }

      const { data, error: selectError } = await query;

      if (selectError) {
        throw new DatabaseError('Failed to get records from challenge_responses', selectError);
      }

      const responses = data ?? [];
      console.log(`[Challenge Response] Successfully retrieved ${responses.length} responses`);

      return NextResponse.json({
        success: true,
        responses
      });
      
    } catch (dbError: unknown) {
      const message = dbError instanceof DatabaseError ? dbError.message : 'Unknown database error';
      const originalError = dbError instanceof DatabaseError ? dbError.originalError : dbError;
      console.error('[Challenge Response] Database error:', message, originalError);

      return NextResponse.json(
        { error: 'Gagal memuat respons tantangan' },
        { status: 500 }
      );
    }

  } catch (error: unknown) {
    console.error('Error retrieving challenge responses:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve challenge responses' },
      { status: 500 }
    );
  }
}
