// src/app/api/admin/activity/jurnal/route.ts
// Unified reflection activity feed for admin: merges jurnal + feedback.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DatabaseService, adminDb } from '@/lib/database'
import {
  buildReflectionActivities,
  filterReflectionActivities,
  type ReflectionActivityItem,
  type ReflectionCourseRow,
  type ReflectionFeedbackRow,
  type ReflectionJournalRow,
  type ReflectionSubtopicRow,
  type ReflectionUserRow,
} from '@/lib/admin-reflection-activity'
import { withProtection } from '@/lib/api-middleware'

async function fetchRecords<T>(table: string) {
  try {
    return await DatabaseService.getRecords<T>(table, {
      orderBy: { column: 'created_at', ascending: false },
    })
  } catch (error) {
    console.error(`[Activity][Reflection] Failed to fetch ${table}:`, error)
    return []
  }
}

async function fetchUsers(userIds: string[]) {
  if (userIds.length === 0) return [] as ReflectionUserRow[]
  const { data, error } = await adminDb
    .from('users')
    .select('id, email')
    .in('id', userIds)
  if (error) {
    console.error('[Activity][Reflection] Failed to fetch users:', error)
    return []
  }
  return (data ?? []) as ReflectionUserRow[]
}

async function fetchCourses(courseIds: string[]) {
  if (courseIds.length === 0) return [] as ReflectionCourseRow[]
  const { data, error } = await adminDb
    .from('courses')
    .select('id, title')
    .in('id', courseIds)
  if (error) {
    console.error('[Activity][Reflection] Failed to fetch courses:', error)
    return []
  }
  return (data ?? []) as ReflectionCourseRow[]
}

async function fetchSubtopics(subtopicIds: string[]) {
  if (subtopicIds.length === 0) return [] as ReflectionSubtopicRow[]
  const { data, error } = await adminDb
    .from('subtopics')
    .select('id, title')
    .in('id', subtopicIds)
  if (error) {
    console.error('[Activity][Reflection] Failed to fetch subtopics:', error)
    return []
  }
  return (data ?? []) as ReflectionSubtopicRow[]
}

async function handler(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const courseId = searchParams.get('course')
    const topic = searchParams.get('topic')
    const dateFrom = searchParams.get('dateFrom') ?? searchParams.get('date')
    const dateTo = searchParams.get('dateTo')

    const [journals, feedbacks] = await Promise.all([
      fetchRecords<ReflectionJournalRow>('jurnal'),
      fetchRecords<ReflectionFeedbackRow>('feedback'),
    ])

    const userIds = Array.from(
      new Set([
        ...journals.map((row) => row.user_id).filter(Boolean),
        ...feedbacks.map((row) => row.user_id).filter((value): value is string => Boolean(value)),
      ]),
    )
    const courseIds = Array.from(
      new Set([
        ...journals.map((row) => row.course_id).filter(Boolean),
        ...feedbacks.map((row) => row.course_id).filter((value): value is string => Boolean(value)),
      ]),
    )
    const subtopicIds = Array.from(
      new Set([
        ...journals.map((row) => row.subtopic_id).filter((value): value is string => Boolean(value)),
        ...feedbacks.map((row) => row.subtopic_id).filter((value): value is string => Boolean(value)),
      ]),
    )

    const [users, courses, subtopics] = await Promise.all([
      fetchUsers(userIds),
      fetchCourses(courseIds),
      fetchSubtopics(subtopicIds),
    ])

    const unified = buildReflectionActivities({
      journals,
      feedbacks,
      users,
      courses,
      subtopics,
    })

    const filtered = filterReflectionActivities(unified, {
      userId,
      courseId,
      topic,
      dateFrom,
      dateTo,
    })

    const payload: ReflectionActivityItem[] = filtered

    return NextResponse.json(payload)
  } catch (error) {
    console.error('[Activity][Reflection] Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to fetch reflection logs' }, { status: 500 })
  }
}

export const GET = withProtection(handler, { adminOnly: true, requireAuth: true, csrfProtection: false })
