import { NextRequest, NextResponse } from 'next/server';

import { DatabaseService } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';

function unauthorized() {
  return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
}

async function requireAdmin(request: NextRequest) {
  const token = request.cookies.get('token')?.value;
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
      return NextResponse.json({ message: 'userId required' }, { status: 400 });
    }

    const courses = await DatabaseService.getRecords<any>('courses', {
      filter: { created_by: userId },
      orderBy: { column: 'created_at', ascending: true },
    });

    const coursePayload = [];
    for (const course of courses) {
      const subtopics = await DatabaseService.getRecords<any>('subtopics', {
        filter: { course_id: course.id },
        orderBy: { column: 'order_index', ascending: true },
      });
      coursePayload.push({
        courseId: course.id,
        courseTitle: course.title,
        subtopics: subtopics.map((subtopic: any) => ({
          subtopicId: subtopic.id,
          title: subtopic.title,
          orderIndex: subtopic.order_index ?? 0,
        })),
      });
    }

    const deleteLogs = await DatabaseService.getRecords<any>('admin_subtopic_delete_logs', {
      filter: { user_id: userId },
      orderBy: { column: 'created_at', ascending: false },
    });

    return NextResponse.json({
      courses: coursePayload,
      deleteLogs: deleteLogs.map((log: any) => ({
        id: log.id,
        subtopicId: log.subtopic_id,
        subtopicTitle: log.subtopic_title,
        courseId: log.course_id,
        adminEmail: log.admin_email,
        note: log.note,
        createdAt: log.created_at,
      })),
    });
  } catch (error) {
    console.error('[Admin Users][Subtopics] Failed to load subtopics', error);
    return NextResponse.json({ message: 'Failed to load subtopic data' }, { status: 500 });
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
        { message: 'courseId and subtopicId are required' },
        { status: 400 }
      );
    }

    const [course] = await DatabaseService.getRecords<any>('courses', {
      filter: { id: courseId },
      limit: 1,
    });
    if (!course || course.created_by !== userId) {
      return NextResponse.json({ message: 'Course not found for user' }, { status: 404 });
    }

    const [subtopic] = await DatabaseService.getRecords<any>('subtopics', {
      filter: { id: subtopicId },
      limit: 1,
    });

    const log = await DatabaseService.insertRecord<any>('admin_subtopic_delete_logs', {
      admin_id: adminPayload.userId,
      admin_email: adminPayload.email,
      user_id: userId,
      course_id: courseId,
      subtopic_id: subtopicId,
      subtopic_title: subtopic?.title ?? 'Subtopic',
      note: note || null,
    });

    return NextResponse.json(
      {
        id: log.id,
        subtopicId: log.subtopic_id,
        subtopicTitle: log.subtopic_title,
        adminEmail: log.admin_email,
        createdAt: log.created_at,
        note: log.note,
        courseId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('[Admin Users][Subtopics] Failed to log delete action', error);
    return NextResponse.json({ message: 'Failed to log delete action' }, { status: 500 });
  }
}
