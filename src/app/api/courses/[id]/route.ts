import { NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';
import { cookies } from 'next/headers';

interface UserRecord {
  id: string;
  email: string;
  role: string;
}

interface CourseRecord {
  id: string;
  title: string;
  description: string;
  subject: string;
  difficulty_level: string;
  created_by: string;
  created_at: string;
}

interface SubtopicRecord {
  id: string;
  course_id: string;
  title: string;
  content: string;
  order_index: number;
}

/**
 * Extract and verify the current user from the access token cookie.
 * Returns the user record or null if not authenticated.
 */
async function getCurrentUser(): Promise<UserRecord | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload || !payload.userId) return null;

    const users = await DatabaseService.getRecords<UserRecord>('users', {
      filter: { id: payload.userId as string },
      limit: 1
    });

    return users.length > 0 ? users[0] : null;
  } catch {
    return null;
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;

    // Auth check: verify user is logged in
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    // Get the course to verify ownership
    const courses = await DatabaseService.getRecords<CourseRecord>('courses', {
      filter: { id: courseId },
      limit: 1
    });

    if (courses.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Course not found'
      }, { status: 404 });
    }

    const course = courses[0];

    // Ownership check: only course owner or admin can delete
    if (course.created_by !== currentUser.id && currentUser.role !== 'ADMIN') {
      return NextResponse.json({
        success: false,
        error: 'You do not have permission to delete this course'
      }, { status: 403 });
    }

    // Delete course from database (CASCADE will delete subtopics automatically)
    await DatabaseService.deleteRecord('courses', courseId);

    return NextResponse.json({
      success: true,
      message: 'Course deleted successfully'
    });

  } catch (error) {
    console.error('[Delete Course] Error deleting course:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete course'
    }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;

    // Auth check: verify user is logged in
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({
        success: false,
        error: 'Authentication required'
      }, { status: 401 });
    }

    // Get course from database
    const courses = await DatabaseService.getRecords<CourseRecord>('courses', {
      filter: { id: courseId },
      limit: 1
    });

    if (courses.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Course not found'
      }, { status: 404 });
    }

    const course = courses[0];

    // Ownership check: only course owner or admin can view
    if (course.created_by !== currentUser.id && currentUser.role !== 'ADMIN') {
      return NextResponse.json({
        success: false,
        error: 'You do not have permission to view this course'
      }, { status: 403 });
    }

    // Get subtopics for this course
    const subtopics = await DatabaseService.getRecords<SubtopicRecord>('subtopics', {
      filter: { course_id: courseId },
      orderBy: { column: 'order_index', ascending: true }
    });

    return NextResponse.json({
      success: true,
      course: {
        ...course,
        subtopics
      }
    });

  } catch (error) {
    console.error('[Get Course] Error fetching course:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch course'
    }, { status: 500 });
  }
}
