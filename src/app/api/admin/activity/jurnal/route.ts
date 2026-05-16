// src/app/api/admin/activity/jurnal/route.ts
// Unified reflection activity feed for admin: merges jurnal + feedback.

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminDb } from '@/lib/database'
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
import { getAdminModeFromRequest, applyAdminModeFilter } from '@/lib/admin-mode'

async function fetchModeFilteredCourseIds(mode: import('@/lib/admin-mode').AdminMode): Promise<string[] | null> {
  if (mode !== 'research') return null
  const { data } = await adminDb.from('courses').select('id').eq('mode', 'research').limit(5000)
  return (Array.isArray(data) ? data : []).map((r: { id: string }) => r.id)
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
    const adminMode = getAdminModeFromRequest(req)
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const courseId = searchParams.get('course')
    const topic = searchParams.get('topic')
    const dateFrom = searchParams.get('dateFrom') ?? searchParams.get('date')
    const dateTo = searchParams.get('dateTo')

    // jurnal has a direct 'mode' column; feedback uses course_id for filtering
    const researchCourseIds = await fetchModeFilteredCourseIds(adminMode)

    const [journals, feedbacks] = await Promise.all([
      // jurnal: direct mode column
      (async () => {
        try {
          const baseQuery = adminDb.from('jurnal').select('*').order('created_at', { ascending: false })
          const { data, error } = await applyAdminModeFilter(baseQuery, adminMode)
          if (error) {
            console.error('[Activity][Reflection] Failed to fetch jurnal:', error)
            return []
          }
          return (Array.isArray(data) ? data : []) as ReflectionJournalRow[]
        } catch (error) {
          console.error('[Activity][Reflection] Failed to fetch jurnal:', error)
          return []
        }
      })(),
      // feedback: no direct mode column; filter via course_id
      (async () => {
        try {
          let q = adminDb.from('feedback').select('*').order('created_at', { ascending: false })
          if (adminMode === 'research') {
            if (researchCourseIds && researchCourseIds.length > 0) q = q.in('course_id', researchCourseIds)
            else q = q.in('course_id', ['__no_match__'])
          }
          const { data, error } = await q
          if (error) {
            console.error('[Activity][Reflection] Failed to fetch feedback:', error)
            return []
          }
          return (Array.isArray(data) ? data : []) as ReflectionFeedbackRow[]
        } catch (error) {
          console.error('[Activity][Reflection] Failed to fetch feedback:', error)
          return []
        }
      })(),
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
