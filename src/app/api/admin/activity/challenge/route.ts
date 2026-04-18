// src/app/api/admin/activity/challenge/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { ensureChallengeResponsesSeeded } from '@/lib/activitySeed';
import { withProtection } from '@/lib/api-middleware';

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
  reasoning_note: string | null;
  raw_evidence_snapshot?: Record<string, unknown> | null;
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

interface LeafSubtopicRow {
  id: string;
  course_id: string;
  module_index: number | null;
  subtopic_index: number | null;
  title: string | null;
}

const DATE_OPTIONS: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
};

function buildDateRange(dateFromValue?: string | null, dateToValue?: string | null) {
  const fromValue = dateFromValue?.trim() || '';
  const toValue = dateToValue?.trim() || fromValue;
  if (!fromValue && !toValue) return null;

  const startSource = fromValue || toValue;
  const endSource = toValue || fromValue;
  const start = new Date(startSource);
  const end = new Date(endSource);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function leafKey(courseId: string | null | undefined, moduleIndex: number | null, subtopicIndex: number | null) {
  if (!courseId || moduleIndex === null || subtopicIndex === null) return null;
  return `${courseId}:${moduleIndex}:${subtopicIndex}`;
}

async function fetchLeafSubtopicTitles(courseId?: string | null) {
  try {
    const rows = await DatabaseService.getRecords<LeafSubtopicRow>('leaf_subtopics', {
      ...(courseId ? { filter: { course_id: courseId } } : {}),
    });

    const map = new Map<string, string>();
    for (const row of rows) {
      const key = leafKey(row.course_id, row.module_index, row.subtopic_index);
      if (key && row.title) {
        map.set(key, row.title);
      }
    }
    return map;
  } catch (error) {
    console.warn('[Activity][Challenge] Failed to fetch leaf_subtopics:', error);
    return new Map<string, string>();
  }
}

async function handler(req: NextRequest) {
  try {
    await ensureChallengeResponsesSeeded();
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const date = searchParams.get('date');
    const dateFrom = searchParams.get('dateFrom') ?? date;
    const dateTo = searchParams.get('dateTo');
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

    const dateRange = buildDateRange(dateFrom, dateTo);
    if (dateRange) {
      responses = responses.filter((row) => {
        const createdAt = new Date(row.created_at);
        return createdAt >= dateRange.start && createdAt <= dateRange.end;
      });
    }

    const userCache = new Map<string, User | null>();
    const courseCache = new Map<string, Course | null>();
    const leafTitleByIndex = await fetchLeafSubtopicTitles(courseId);

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
      const mappedLeafTitle = leafTitleByIndex.get(
        leafKey(row.course_id, row.module_index, row.subtopic_index) ?? '',
      );
      const topicLabel =
        firstString(row.raw_evidence_snapshot?.subtopic_label, mappedLeafTitle) ??
        `Module ${Number(row.module_index ?? 0) + 1}, Subtopic ${Number(row.subtopic_index ?? 0) + 1}`;

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
        reasoningNote: row.reasoning_note ?? '',
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

export const GET = withProtection(handler, { adminOnly: true, requireAuth: true, csrfProtection: false });
