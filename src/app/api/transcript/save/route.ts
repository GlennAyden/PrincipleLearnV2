import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { resolveAuthUserId } from '@/lib/auth-helper';
import {
  refreshResearchSessionMetrics,
  resolveResearchLearningSession,
  syncResearchEvidenceItem,
} from '@/services/research-session.service';

interface TranscriptSubmission {
  userId: string; // User id or email
  courseId: string;
  subtopic: string;
  question: string;
  answer: string;
}

async function resolveSubtopicId(courseId: string, subtopicTitle: string) {
  const title = subtopicTitle.trim();
  if (!title) return null;

  const exactMatch = await DatabaseService.getRecords<{ id: string }>('subtopics', {
    filter: {
      course_id: courseId,
      title,
    },
    limit: 1,
  });

  if (exactMatch.length > 0) {
    return exactMatch[0].id;
  }

  return null;
}

async function resolveUserByIdentifier(identifier: string) {
  const trimmed = identifier.trim();
  if (!trimmed) return null;

  const byId = await DatabaseService.getRecords<{ id: string; email: string }>('users', {
    filter: { id: trimmed },
    limit: 1,
  });
  if (byId.length > 0) return byId[0];

  const byEmail = await DatabaseService.getRecords<{ id: string; email: string }>('users', {
    filter: { email: trimmed },
    limit: 1,
  });
  return byEmail[0] ?? null;
}

async function postHandler(req: NextRequest) {
  try {
    // Resolve authenticated user ID — prefers middleware-injected header,
    // falls back to decoding the access_token cookie directly because the
    // header occasionally fails to propagate in Next.js 15 production.
    const headerUserId = resolveAuthUserId(req);
    if (!headerUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const data: TranscriptSubmission = await req.json();

    // Validasi data
    if (!data.userId || !data.courseId || !data.subtopic || !data.question || !data.answer) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Find user in database using authenticated user ID from JWT
    const user = await resolveUserByIdentifier(headerUserId);

    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Find course in database — enforce ownership: only the course owner
    // (created_by) may save a transcript against it. Prevents User A from
    // writing transcript notes for User B's course.
    const courses = await DatabaseService.getRecords('courses', {
      filter: { id: data.courseId, created_by: user.id },
      limit: 1
    });

    if (courses.length === 0) {
      return NextResponse.json(
        { error: 'Course not found or access denied' },
        { status: 403 }
      );
    }

    const subtopicId = await resolveSubtopicId(data.courseId, data.subtopic);

    // Save transcript to database — upsert by (user_id, course_id, subtopic_id)
    // so that re-submitting a transcript for the same subtopic updates the
    // existing row instead of duplicating it. This matches the schema doc
    // ("notes per subtopic") and the only granularity columns available.
    const transcriptData = {
      user_id: user.id,
      course_id: data.courseId,
      subtopic_id: subtopicId,
      content: `Q: ${data.question}\n\nA: ${data.answer}`,
      notes: `Subtopic: ${data.subtopic}`
    };

    type TranscriptRow = { id: string; user_id: string; course_id: string; subtopic_id: string | null; content: string; notes: string };

    const upsertTranscript = async (table: 'transcript' | 'transcripts'): Promise<TranscriptRow> => {
      const existing = await DatabaseService.getRecords<{ id: string }>(table, {
        filter: subtopicId
          ? { user_id: user.id, course_id: data.courseId, subtopic_id: subtopicId }
          : { user_id: user.id, course_id: data.courseId },
        limit: 1,
      });

      if (existing.length > 0) {
        return DatabaseService.updateRecord<TranscriptRow>(table, existing[0].id, transcriptData);
      }
      return DatabaseService.insertRecord<TranscriptRow>(table, transcriptData);
    };

    let transcript: { id: string } | null = null;
    let transcriptTable: 'transcript' | 'transcripts' = 'transcript';
    try {
      transcript = await upsertTranscript('transcript');
    } catch (primaryError: unknown) {
      const message = String(primaryError instanceof Error ? primaryError.message : '');
      if (!message.includes("public.transcript")) {
        throw primaryError;
      }

      // Backward-compatible fallback for environments using plural table naming.
      try {
        transcriptTable = 'transcripts';
        transcript = await upsertTranscript('transcripts');
      } catch (fallbackError) {
        console.error('[Transcript] Both table names failed:', { primaryError: message, fallbackError });
        throw primaryError; // throw original error for clearer diagnostics
      }
    }
    
    console.log(`Transcript saved to database:`, {
      id: transcript.id,
      user: data.userId,
      course: data.courseId,
      subtopic: data.subtopic,
      subtopicId,
    });

    try {
      const researchTimestamp = new Date().toISOString();
      const researchSession = await resolveResearchLearningSession({
        userId: user.id,
        courseId: data.courseId,
        occurredAt: researchTimestamp,
      });
      await syncResearchEvidenceItem({
        sourceType: 'ask_question',
        sourceId: transcript.id,
        sourceTable: transcriptTable,
        userId: user.id,
        courseId: data.courseId,
        learningSessionId: researchSession.learningSessionId,
        rmFocus: 'RM2_RM3',
        evidenceTitle: data.question.slice(0, 120),
        evidenceText: data.question,
        aiResponseText: data.answer,
        evidenceStatus: 'raw',
        codingStatus: 'uncoded',
        researchValidityStatus: 'valid',
        dataCollectionWeek: researchSession.dataCollectionWeek,
        evidenceSourceSummary: 'Transkrip Q/A pembelajaran yang disimpan siswa.',
        rawEvidenceSnapshot: {
          subtopic: data.subtopic,
          subtopic_id: subtopicId,
          question: data.question,
          answer: data.answer,
        },
        metadata: {
          mapped_source_type: 'ask_question',
          original_source_type: 'transcript',
        },
        createdAt: researchTimestamp,
      });
      await refreshResearchSessionMetrics(researchSession.learningSessionId);
    } catch (researchError) {
      console.warn('[Transcript] Research evidence sync skipped', researchError);
    }

    return NextResponse.json({ success: true, id: transcript!.id });
  } catch (error: unknown) {
    console.error('Error saving transcript:', error);
    return NextResponse.json(
      { error: 'Failed to save transcript' },
      { status: 500 }
    );
  }
} 

export const POST = withApiLogging(postHandler, {
  label: 'transcript-save',
});
