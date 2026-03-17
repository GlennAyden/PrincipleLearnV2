import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseIndex(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseRating(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 1 || numeric > 5) return null;
  return numeric;
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
    const {
      subtopicId,
      subtopic,
      moduleIndex,
      subtopicIndex,
      feedback,
      comment,
      rating,
      userId,
      courseId,
    } = await req.json();

    const normalizedComment = normalizeText(comment ?? feedback);
    const normalizedUserId = normalizeText(userId);
    const normalizedCourseId = normalizeText(courseId);
    const normalizedSubtopicId = normalizeText(subtopicId);
    const normalizedSubtopicLabel = normalizeText(subtopic);
    const normalizedModuleIndex = parseIndex(moduleIndex);
    const normalizedSubtopicIndex = parseIndex(subtopicIndex);
    const normalizedRating = parseRating(rating);
    
    // Validasi data
    if (!normalizedComment) {
      return NextResponse.json(
        { error: "Comment is required" },
        { status: 400 }
      );
    }

    if (!normalizedUserId || !normalizedCourseId) {
      return NextResponse.json(
        { error: 'userId and courseId are required' },
        { status: 400 }
      );
    }
    
    // Save feedback to database
    try {
      // Find user in database (accept both user id and email)
      const user = await resolveUserByIdentifier(normalizedUserId);

      if (!user) {
        return NextResponse.json(
          { error: `User not found for identifier: ${normalizedUserId}` },
          { status: 404 }
        );
      }

      // Find course in database
      const courses = await DatabaseService.getRecords('courses', {
        filter: { id: normalizedCourseId },
        limit: 1
      });
      
      if (courses.length === 0) {
        return NextResponse.json(
          { error: `Course with ID ${normalizedCourseId} not found` },
          { status: 404 }
        );
      }

      let subtopicTitle: string | null = null;
      if (normalizedSubtopicId) {
        try {
          const subtopics = await DatabaseService.getRecords('subtopics', {
            filter: { id: normalizedSubtopicId },
            limit: 1,
          });
          subtopicTitle = subtopics[0]?.title ?? null;
        } catch (subtopicError) {
          console.error('Error fetching subtopic for feedback context:', subtopicError);
        }
      }

      if (!subtopicTitle && normalizedSubtopicLabel) {
        subtopicTitle = normalizedSubtopicLabel;
      }

      // Save as feedback in database
      const feedbackData = {
        user_id: user.id,
        course_id: normalizedCourseId,
        subtopic_id: normalizedSubtopicId || null,
        module_index: normalizedModuleIndex,
        subtopic_index: normalizedSubtopicIndex,
        subtopic_label: subtopicTitle,
        rating: normalizedRating,
        comment: normalizedComment,
      };
      
      const savedFeedback = await DatabaseService.insertRecord<any>('feedback', feedbackData);
      console.log('Feedback saved to database:', {
        id: savedFeedback.id,
        user: normalizedUserId,
        course: normalizedCourseId,
        moduleIndex: normalizedModuleIndex,
        subtopicIndex: normalizedSubtopicIndex,
        rating: normalizedRating,
      });
    } catch (error) {
      console.error('Error saving feedback to database:', error);
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Failed to save feedback' },
        { status: 500 }
      );
    }
    
    // Kirim kembali respons ke client
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving feedback:', error);
    return NextResponse.json(
      { error: error.message || "Failed to save feedback" },
      { status: 500 }
    );
  }
} 

export const POST = withApiLogging(postHandler, {
  label: 'feedback',
});
