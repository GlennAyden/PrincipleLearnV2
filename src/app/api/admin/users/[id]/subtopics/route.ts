import { NextRequest, NextResponse } from 'next/server';

import { DatabaseService } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';

function unauthorized() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  if (!payload || (payload.role ?? '').toUpperCase() !== 'ADMIN') {
    return null;
  }
  return payload;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminPayload = await requireAdmin(request);
    if (!adminPayload) return unauthorized();

    const { id: userId } = await context.params;
    if (!userId) {
      return NextResponse.json({ error: 'userId required' }, { status: 400 });
    }

    interface CourseSubRow { id: string; title: string; created_at: string; created_by: string }
    interface SubtopicSubRow { id: string; title: string; order_index?: number; course_id: string }

    const courses = await DatabaseService.getRecords<CourseSubRow>('courses', {
      filter: { created_by: userId },
      orderBy: { column: 'created_at', ascending: true },
    });

    const coursePayload = [];
    for (const course of courses) {
      const subtopics = await DatabaseService.getRecords<SubtopicSubRow>('subtopics', {
        filter: { course_id: course.id },
        orderBy: { column: 'order_index', ascending: true },
      });
      coursePayload.push({
        courseId: course.id,
        courseTitle: course.title,
        subtopics: subtopics.map(subtopic => ({
          subtopicId: subtopic.id,
          title: subtopic.title,
          orderIndex: subtopic.order_index ?? 0,
        })),
      });
    }

    // The admin_subtopic_delete_logs table does not exist
    const deleteLogs: Record<string, unknown>[] = [];

    return NextResponse.json({
      courses: coursePayload,
      deleteLogs: deleteLogs,
    });
  } catch (error) {
    console.error('[Admin Users][Subtopics] Failed to load subtopics', error);
    return NextResponse.json({ error: 'Failed to load subtopic data' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const adminPayload = await requireAdmin(request);
    if (!adminPayload) return unauthorized();

    const { id: userId } = await context.params;
    const body = await request.json().catch(() => null);
    const { courseId, subtopicId, note } = body ?? {};

    if (!userId || !courseId || !subtopicId) {
      return NextResponse.json(
        { error: 'courseId and subtopicId are required' },
        { status: 400 }
      );
    }

    interface CoursePostRow { id: string; title: string; created_by: string }
    interface SubtopicPostRow { id: string; title: string }

    const [course] = await DatabaseService.getRecords<CoursePostRow>('courses', {
      filter: { id: courseId },
      limit: 1,
    });
    if (!course || course.created_by !== userId) {
      return NextResponse.json({ error: 'Course not found for user' }, { status: 404 });
    }

    const [subtopic] = await DatabaseService.getRecords<SubtopicPostRow>('subtopics', {
      filter: { id: subtopicId },
      limit: 1,
    });

    // Mock log creation since table is missing
    const generatedId = Date.now().toString();
    
    return NextResponse.json(
      {
        id: generatedId,
        subtopicId: subtopicId,
        subtopicTitle: subtopic?.title ?? 'Subtopic',
        adminEmail: adminPayload.email,
        createdAt: new Date().toISOString(),
        note: note || null,
        courseId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Admin Users][Subtopics] Failed to log delete action', error);
    return NextResponse.json({ error: 'Failed to log delete action' }, { status: 500 });
  }
}
