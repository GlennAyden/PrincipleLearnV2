import { randomUUID } from 'crypto';
import { NextRequest, NextResponse, after } from 'next/server';
import { adminDb, DatabaseError } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';
import { withApiLogging } from '@/lib/api-logger';
import { withProtection } from '@/lib/api-middleware';
import { ChallengeResponseSchema, parseBody } from '@/lib/schemas';
import {
  refreshResearchSessionMetrics,
  resolveResearchLearningSession,
  syncResearchEvidenceItem,
} from '@/services/research-session.service';

function normalizeIndex(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  if (typeof value === 'string') {
    const parsed = parseInt(value, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return 0;
}

function getDbErrorMessage(error: unknown): string {
  if (error instanceof DatabaseError) {
    if (error.originalError && 'message' in error.originalError) {
      const originalMessage = error.originalError.message;
      if (typeof originalMessage === 'string' && originalMessage.trim()) {
        return originalMessage;
      }
    }
    return error.message;
  }

  if (error instanceof Error) {
    return error.message;
  }

  return String(error);
}

async function postHandler(req: NextRequest) {
  try {
    // Zod validation ensures every required field is present and trimmed
    // BEFORE we touch the DB — replaces the previous hand-rolled parser
    // that silently accepted malformed payloads.
    const parsed = parseBody(ChallengeResponseSchema, await req.json());
    if (!parsed.success) return parsed.response;
    const {
      userId,
      courseId,
      moduleIndex,
      subtopicIndex,
      pageNumber,
      question: normalizedQuestion,
      answer: normalizedAnswer,
      feedback: normalizedFeedback,
      reasoningNote: normalizedReasoning,
    } = parsed.data;

    const accessToken = req.cookies.get('access_token')?.value;
    let tokenPayload: ReturnType<typeof verifyToken> | null = null;
    try {
      tokenPayload = accessToken ? verifyToken(accessToken) : null;
    } catch (tokenErr) {
      console.warn('[ChallengeResponse] Token verification threw', tokenErr);
    }

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
    }

    if (tokenPayload.userId !== userId) {
      return NextResponse.json({ error: 'Pengguna tidak cocok' }, { status: 403 });
    }

    // The live Supabase table uses a UUID primary key for challenge_responses.
    // A prior composite string ID caused inserts to fail with invalid UUID syntax.
    const challengeId = randomUUID();

    console.log('[Challenge Response] Attempting to save challenge response:', {
      challengeId,
      userId,
      courseId
    });

    // Try to save challenge response to database
    try {
      const timestamp = new Date().toISOString();
      const researchSession = await resolveResearchLearningSession({
        userId,
        courseId,
        occurredAt: timestamp,
      });
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
        learning_session_id: researchSession.learningSessionId,
        research_validity_status: 'valid',
        coding_status: 'uncoded',
        raw_evidence_snapshot: {
          question: normalizedQuestion,
          answer: normalizedAnswer,
          feedback: normalizedFeedback,
          reasoning_note: normalizedReasoning ? normalizedReasoning : null,
        },
        data_collection_week: researchSession.dataCollectionWeek,
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
          await syncResearchEvidenceItem({
            sourceType: 'challenge_response',
            sourceId: challengeId,
            sourceTable: 'challenge_responses',
            userId,
            courseId,
            learningSessionId: researchSession.learningSessionId,
            rmFocus: 'RM3',
            evidenceTitle: normalizedQuestion.slice(0, 120),
            evidenceText: normalizedAnswer,
            aiResponseText: normalizedFeedback,
            evidenceStatus: 'raw',
            codingStatus: 'uncoded',
            researchValidityStatus: 'valid',
            dataCollectionWeek: researchSession.dataCollectionWeek,
            evidenceSourceSummary: 'Respons siswa terhadap pertanyaan tantangan beserta feedback AI.',
            rawEvidenceSnapshot: challengeData.raw_evidence_snapshot,
            metadata: {
              module_index: challengeData.module_index,
              subtopic_index: challengeData.subtopic_index,
              page_number: challengeData.page_number,
            },
            createdAt: timestamp,
          });
          await refreshResearchSessionMetrics(researchSession.learningSessionId);

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
          try {
            await adminDb.from('api_logs').insert({
              path: '/api/challenge-response',
              label: 'cognitive-scoring-failed',
              method: 'POST',
              status_code: 500,
              user_id: userId,
              error_message: `challenge_response cognitive scoring failed: ${scoreError instanceof Error ? scoreError.message : String(scoreError)}`,
              metadata: { challenge_id: challengeId, course_id: courseId },
              created_at: new Date().toISOString(),
            });
          } catch (logError) {
            console.error('[ChallengeResponse] Failed to log scoring error to api_logs:', logError);
          }
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

      try {
        await adminDb.from('api_logs').insert({
          path: '/api/challenge-response',
          label: 'challenge-response-db-error',
          method: 'POST',
          status_code: 500,
          user_id: userId,
          error_message: `challenge_response insert failed: ${getDbErrorMessage(dbError)}`,
          metadata: {
            challenge_id: challengeId,
            course_id: courseId,
            module_index: normalizeIndex(moduleIndex),
            subtopic_index: normalizeIndex(subtopicIndex),
            page_number: normalizeIndex(pageNumber),
          },
          created_at: new Date().toISOString(),
        });
      } catch (logError) {
        console.error('[ChallengeResponse] Failed to log DB error to api_logs:', logError);
      }

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

export const POST = withApiLogging(withProtection(postHandler), {
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
