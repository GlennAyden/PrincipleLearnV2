// src/app/api/admin/activity/feedback/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { ensureFeedbackSeeded } from '@/lib/activitySeed';

interface FeedbackRow {
  id: string;
  user_id: string | null;
  course_id: string | null;
  rating: number | null;
  comment: string | null;
  created_at: string;
}

interface User {
  id: string;
  email: string | null;
}

interface Course {
  id: string;
  title: string | null;
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

export async function GET(req: NextRequest) {
  try {
    await ensureFeedbackSeeded();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const date = searchParams.get('date');
    const courseId = searchParams.get('course');
    const topic = searchParams.get('topic');

    let feedbackRows: FeedbackRow[] = [];
    try {
      feedbackRows = await DatabaseService.getRecords<FeedbackRow>('feedback', {
        orderBy: { column: 'created_at', ascending: false },
      });
    } catch (error) {
      console.error('[Activity][Feedback] Failed to fetch feedback table:', error);
      return NextResponse.json([], { status: 200 });
    }

    if (userId) {
      feedbackRows = feedbackRows.filter((row) => row.user_id === userId);
    }

    if (courseId) {
      feedbackRows = feedbackRows.filter((row) => row.course_id === courseId);
    }

    if (date) {
      const target = new Date(date);
      const start = new Date(target);
      start.setHours(0, 0, 0, 0);
      const end = new Date(target);
      end.setHours(23, 59, 59, 999);
      feedbackRows = feedbackRows.filter((row) => {
        const createdAt = new Date(row.created_at);
        return createdAt >= start && createdAt <= end;
      });
    }

    const userCache = new Map<string, User | null>();
    const courseCache = new Map<string, Course | null>();

    async function getUser(userIdValue?: string | null) {
      if (!userIdValue) return null;
      if (userCache.has(userIdValue)) return userCache.get(userIdValue) ?? null;
      const users = await DatabaseService.getRecords<User>('users', {
        filter: { id: userIdValue },
        limit: 1,
      });
      const user = users[0] ?? null;
      userCache.set(userIdValue, user);
      return user;
    }

    async function getCourse(courseIdValue?: string | null) {
      if (!courseIdValue) return null;
      if (courseCache.has(courseIdValue)) return courseCache.get(courseIdValue) ?? null;
      const courses = await DatabaseService.getRecords<Course>('courses', {
        filter: { id: courseIdValue },
        limit: 1,
      });
      const course = courses[0] ?? null;
      courseCache.set(courseIdValue, course);
      return course;
    }

    const payload = [];
    for (const row of feedbackRows) {
      const course = await getCourse(row.course_id);
      const topicLabel = course?.title ?? 'Tanpa Kursus';

      if (topic && !topicLabel.toLowerCase().includes(topic.toLowerCase())) {
        continue;
      }

      const user = await getUser(row.user_id);

      payload.push({
        id: row.id,
        timestamp: new Date(row.created_at).toLocaleString('id-ID', DATE_OPTIONS),
        userEmail: user?.email ?? 'Unknown User',
        userId: row.user_id ?? 'unknown',
        topic: topicLabel,
        courseTitle: topicLabel,
        rating: row.rating ?? null,
        comment: row.comment ?? '',
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[Activity][Feedback] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to fetch feedback logs' }, { status: 500 });
  }
}
