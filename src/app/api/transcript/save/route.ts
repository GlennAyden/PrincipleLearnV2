import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';

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

  const byId = await DatabaseService.getRecords<any>('users', {
    filter: { id: trimmed },
    limit: 1,
  });
  if (byId.length > 0) return byId[0];

  const byEmail = await DatabaseService.getRecords<any>('users', {
    filter: { email: trimmed },
    limit: 1,
  });
  return byEmail[0] ?? null;
}

async function postHandler(req: NextRequest) {
  try {
    const data: TranscriptSubmission = await req.json();
    
    // Validasi data
    if (!data.userId || !data.courseId || !data.subtopic || !data.question || !data.answer) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Find user in database (accept both user id and email)
    const user = await resolveUserByIdentifier(data.userId);

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

    const subtopicId = await resolveSubtopicId(data.courseId, data.subtopic);

    // Save transcript to database
    const transcriptData = {
      user_id: user.id,
      course_id: data.courseId,
      subtopic_id: subtopicId,
      content: `Q: ${data.question}\n\nA: ${data.answer}`,
      notes: `Subtopic: ${data.subtopic}`
    };

    let transcript: any = null;
    try {
      transcript = await DatabaseService.insertRecord('transcript', transcriptData);
    } catch (primaryError: any) {
      const message = String(primaryError?.message || '');
      if (!message.includes("public.transcript")) {
        throw primaryError;
      }

      // Backward-compatible fallback for environments using plural table naming.
      transcript = await DatabaseService.insertRecord('transcripts', transcriptData);
    }
    
    console.log(`Transcript saved to database:`, {
      id: transcript.id,
      user: data.userId,
      course: data.courseId,
      subtopic: data.subtopic,
      subtopicId,
    });

    return NextResponse.json({ success: true, id: transcript.id });
  } catch (error: any) {
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