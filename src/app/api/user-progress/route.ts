import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { resolveAuthContext } from '@/lib/auth-helper';
import { assertCourseOwnership, toOwnershipError } from '@/lib/ownership';
import { parseBody, UserProgressUpsertSchema } from '@/lib/schemas';

export async function POST(req: NextRequest) {
  try {
    const auth = resolveAuthContext(req);
    if (!auth?.userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { userId, role: userRole } = auth;
    const rawBody = await req.json();
    // Accept legacy fields (moduleIndex, subtopicIndex, status, timeSpent) for backward compat,
    // but only use the unified model fields for DB writes.
    const parsed = parseBody(UserProgressUpsertSchema, rawBody);
    if (!parsed.success) return parsed.response;
    const { courseId, subtopicId, isCompleted } = parsed.data;

    try {
      await assertCourseOwnership(userId, courseId, userRole);
    } catch (ownershipErr) {
      const asOwnership = toOwnershipError(ownershipErr);
      if (asOwnership) {
        return NextResponse.json(
          { error: asOwnership.message },
          { status: asOwnership.status }
        );
      }
      throw ownershipErr;
    }

    const linkedSubtopics = await DatabaseService.getRecords<{ id: string }>('subtopics', {
      filter: {
        id: subtopicId,
        course_id: courseId,
      },
      limit: 1,
    });

    if (linkedSubtopics.length === 0) {
      return NextResponse.json(
        { error: 'Subtopic not found in this course' },
        { status: 400 }
      );
    }

    const completed = Boolean(isCompleted);

    const existing = await DatabaseService.getRecords<{
      id: string;
      is_completed: boolean;
      completed_at: string | null;
    }>('user_progress', {
      filter: {
        user_id: userId,
        course_id: courseId,
        subtopic_id: subtopicId,
      },
      limit: 1,
    });

    const now = new Date().toISOString();

    if (existing.length > 0) {
      await DatabaseService.updateRecord('user_progress', existing[0].id, {
        is_completed: completed,
        completed_at: completed ? (existing[0].completed_at ?? now) : null,
        updated_at: now,
      });
    } else {
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
      message: 'User progress updated successfully',
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
    const auth = resolveAuthContext(req);
    if (!auth?.userId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    const { userId, role: userRole } = auth;
    const { searchParams } = new URL(req.url);
    const courseId = searchParams.get('courseId');

    if (courseId) {
      try {
        await assertCourseOwnership(userId, courseId, userRole);
      } catch (ownershipErr) {
        const asOwnership = toOwnershipError(ownershipErr);
        if (asOwnership) {
          return NextResponse.json(
            { error: asOwnership.message },
            { status: asOwnership.status }
          );
        }
        throw ownershipErr;
      }
    }

    const filter: Record<string, string> = { user_id: userId };
    if (courseId) filter.course_id = courseId;

    const progress = await DatabaseService.getRecords<{
      subtopic_id: string;
      is_completed: boolean;
      completed_at: string | null;
    }>('user_progress', {
      filter,
      orderBy: { column: 'updated_at', ascending: false },
    });

    const completedCount = progress.filter((p) => p.is_completed).length;
    const inProgressCount = progress.filter((p) => !p.is_completed).length;

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
      progress,
      statistics: stats,
    });
  } catch (error: unknown) {
    console.error('Error retrieving user progress:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve progress' },
      { status: 500 }
    );
  }
}
