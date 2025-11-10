// src/app/api/admin/activity/challenge/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { ensureChallengeResponsesSeeded } from '@/lib/activitySeed';

interface ChallengeResponseRow {
  id: string;
  user_id: string | null;
  course_id: string | null;
  module_index: number | null;
  subtopic_index: number | null;
  page_number: number | null;
  question: string;
  answer: string;
  feedback: string | null;
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
    await ensureChallengeResponsesSeeded();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const date = searchParams.get('date');
    const courseId = searchParams.get('course');
    const topic = searchParams.get('topic');

    let responses: ChallengeResponseRow[] = [];
    try {
      responses = await DatabaseService.getRecords<ChallengeResponseRow>('challenge_responses', {
        orderBy: { column: 'created_at', ascending: false },
      });
    } catch (error) {
      console.error('[Activity][Challenge] Failed to fetch challenge_responses:', error);
      return NextResponse.json([], { status: 200 });
    }

    if (userId) {
      responses = responses.filter((row) => row.user_id === userId);
    }

    if (courseId) {
      responses = responses.filter((row) => row.course_id === courseId);
    }

    if (date) {
      const target = new Date(date);
      const start = new Date(target);
      start.setHours(0, 0, 0, 0);
      const end = new Date(target);
      end.setHours(23, 59, 59, 999);
      responses = responses.filter((row) => {
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
    for (const row of responses) {
      const topicLabel = `Module ${Number(row.module_index ?? 0) + 1}, Subtopic ${Number(row.subtopic_index ?? 0) + 1}`;

      if (topic && !topicLabel.toLowerCase().includes(topic.toLowerCase())) {
        continue;
      }

      const [user, course] = await Promise.all([getUser(row.user_id), getCourse(row.course_id)]);

      payload.push({
        id: row.id,
        timestamp: new Date(row.created_at).toLocaleString('id-ID', DATE_OPTIONS),
        userEmail: user?.email ?? 'Unknown User',
        userId: row.user_id ?? 'unknown',
        topic: topicLabel,
        courseTitle: course?.title ?? 'Tanpa Kursus',
        question: row.question,
        answer: row.answer,
        feedback: row.feedback ?? '',
        moduleIndex: row.module_index ?? 0,
        subtopicIndex: row.subtopic_index ?? 0,
        pageNumber: row.page_number ?? 0,
      });
    }

    return NextResponse.json(payload);
  } catch (error) {
    console.error('[Activity][Challenge] Unexpected error:', error);
    return NextResponse.json({ error: 'Failed to fetch challenge logs' }, { status: 500 });
  }
}
