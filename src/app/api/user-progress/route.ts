import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { resolveAuthUserId } from '@/lib/auth-helper';

export async function POST(req: NextRequest) {
  try {
    // Resolve authenticated user ID — prefers middleware-injected header,
    // falls back to decoding the access_token cookie directly because the
    // header occasionally fails to propagate in Next.js 15 production.
    const userId = resolveAuthUserId(req);
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
    console.error('Error updating user progress:', error);
    return NextResponse.json(
      { error: 'Failed to update progress' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    // Resolve authenticated user ID — prefers middleware-injected header,
    // falls back to decoding the access_token cookie directly because the
    // header occasionally fails to propagate in Next.js 15 production.
    const userId = resolveAuthUserId(req);
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

    const completedCount = progress.filter((p) => p.is_completed).length;
    const inProgressCount = progress.filter((p) => !p.is_completed).length;

    // Calculate statistics. When scoped to a specific course, total_subtopics
    // must reflect the course's actual subtopic count (not just rows the user
    // already has progress for) — otherwise percentage is misleading.
    let totalSubtopics = progress.length;
    if (courseId) {
      const allSubtopics = await DatabaseService.getRecords<{ id: string }>('subtopics', {
        filter: { course_id: courseId },
        orderBy: { column: 'order_index', ascending: true },
      });
      totalSubtopics = allSubtopics.length;
    }

    const completionPercentage = totalSubtopics > 0
      ? Math.round((completedCount / totalSubtopics) * 100)
      : 0;

    const stats = {
      total_subtopics: totalSubtopics,
      completed_subtopics: completedCount,
      in_progress_subtopics: inProgressCount,
      completion_percentage: completionPercentage,
    };

    return NextResponse.json({
      success: true,
      progress: progress,
      statistics: stats
    });

  } catch (error: unknown) {
    console.error('Error retrieving user progress:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve progress' },
      { status: 500 }
    );
  }
}