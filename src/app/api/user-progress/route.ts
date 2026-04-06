import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

export async function POST(req: NextRequest) {
  try {
    // Use middleware-injected user ID from verified JWT (prevents IDOR)
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const body = await req.json();
    // Accept legacy fields (moduleIndex, subtopicIndex, status, timeSpent) for backward compat,
    // but only use the unified model fields for DB writes.
    const { courseId, subtopicId, isCompleted } = body;

    if (!courseId || !subtopicId) {
      return NextResponse.json(
        { error: 'Missing required fields: courseId, subtopicId' },
        { status: 400 }
      );
    }

    const completed = Boolean(isCompleted);

    // Check if progress record already exists
    const existing = await DatabaseService.getRecords<{ id: string; is_completed: boolean; completed_at: string | null }>('user_progress', {
      filter: {
        user_id: userId,
        course_id: courseId,
        subtopic_id: subtopicId,
      },
      limit: 1
    });

    const now = new Date().toISOString();

    if (existing.length > 0) {
      // Update existing progress
      await DatabaseService.updateRecord('user_progress', existing[0].id, {
        is_completed: completed,
        completed_at: completed ? (existing[0].completed_at ?? now) : null,
        updated_at: now,
      });
    } else {
      // Insert new progress record
      await DatabaseService.insertRecord('user_progress', {
        user_id: userId,
        course_id: courseId,
        subtopic_id: subtopicId,
        is_completed: completed,
        completed_at: completed ? now : null,
        created_at: now,
        updated_at: now,
      });
    }

    return NextResponse.json({
      success: true,
      message: 'User progress updated successfully'
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error updating user progress:', error);
    return NextResponse.json(
      { error: 'Failed to update user progress: ' + message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Use middleware-injected user ID from verified JWT (prevents IDOR)
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId');

    // Build filter conditions
    const filter: Record<string, string> = { user_id: userId };
    if (courseId) filter.course_id = courseId;

    // Get user progress from database
    const progress = await DatabaseService.getRecords<{ subtopic_id: string; is_completed: boolean; completed_at: string | null }>('user_progress', {
      filter,
      orderBy: { column: 'updated_at', ascending: false }
    });

    // Calculate statistics
    const stats = {
      total_subtopics: progress.length,
      completed_subtopics: progress.filter((p) => p.is_completed).length,
      in_progress_subtopics: progress.filter((p) => !p.is_completed).length,
    };

    return NextResponse.json({
      success: true,
      progress: progress,
      statistics: stats
    });

  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error retrieving user progress:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve user progress: ' + message },
      { status: 500 }
    );
  }
}