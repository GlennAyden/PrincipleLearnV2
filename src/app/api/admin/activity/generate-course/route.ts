// src/app/api/admin/activity/generate-course/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DatabaseService } from '@/lib/database'
import { ensureCourseGenerationActivitySeeded } from '@/lib/activitySeed'

interface Course {
  id: string;
  title: string;
  description?: string;
  subject?: string;
  difficulty_level?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface User {
  id: string;
  email: string;
  role: string;
}

interface CourseGenerationActivityRow {
  id: string;
  user_id: string | null;
  course_id: string | null;
  request_payload: any;
  outline: any;
  created_at: string;
}

export async function GET(req: NextRequest) {
  console.log('[Activity API] Starting generate-course activity fetch');
  
  try {
    await ensureCourseGenerationActivitySeeded();
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const date = searchParams.get('date')
    const courseId = searchParams.get('course')
    
    console.log('[Activity API] Request params:', { userId, date, courseId });

    let activityRows: CourseGenerationActivityRow[] = []
    try {
      activityRows = await DatabaseService.getRecords<CourseGenerationActivityRow>('course_generation_activity', {
        orderBy: { column: 'created_at', ascending: false },
      })
    } catch (error) {
      console.error('[Activity API] Failed to read course_generation_activity table:', error)
      activityRows = []
    }

    let payload
    if (activityRows.length > 0) {
      payload = await buildActivityPayload({ rows: activityRows, userId, date, courseId })
    } else {
      console.warn('[Activity API] Falling back to legacy course-based activity logs')
      payload = await buildLegacyPayload({ userId, date })
    }

    console.log(`[Activity API] Returning ${payload.length} formatted course generation records`)
    return NextResponse.json(payload)
    
  } catch (error) {
    console.error('[Activity API] Error fetching generate-course logs:', error)
    if (error instanceof Error) {
      console.error('[Activity API] Error details:', error.message)
      console.error('[Activity API] Error stack:', error.stack)
    }
    return NextResponse.json(
      { error: 'Failed to fetch generate-course logs' },
      { status: 500 }
    )
  }
}

async function buildActivityPayload({
  rows,
  userId,
  date,
  courseId,
}: {
  rows: CourseGenerationActivityRow[]
  userId: string | null
  date: string | null
  courseId: string | null
}) {
  const userCache = new Map<string, User | null>()
  const courseCache = new Map<string, Course | null>()

  const filteredRows = rows.filter((row) => {
    if (userId && row.user_id !== userId) return false
    if (courseId && row.course_id !== courseId) return false
    if (date) {
      const target = new Date(date)
      const start = new Date(target)
      start.setHours(0, 0, 0, 0)
      const end = new Date(target)
      end.setHours(23, 59, 59, 999)
      const createdAt = new Date(row.created_at)
      if (createdAt < start || createdAt > end) return false
    }
    return true
  })

  const payload = []
  for (const row of filteredRows) {
    const user = await fetchCached<User>(userCache, row.user_id, 'users')
    const course = await fetchCached<Course>(courseCache, row.course_id, 'courses')
    const requestPayload = typeof row.request_payload === 'object' && row.request_payload !== null ? row.request_payload : {}
    const outlineArray = Array.isArray(row.outline) ? row.outline : []

    const modules = outlineArray.map((module: any, moduleIdx: number) => ({
      title: module?.module || `Modul ${moduleIdx + 1}`,
      subtopics: Array.isArray(module?.subtopics)
        ? module.subtopics
            .filter(Boolean)
            .map((subtopic: any, subIdx: number) => ({
              title: subtopic?.title || `Subtopik ${subIdx + 1}`,
              overview: subtopic?.overview || '',
            }))
        : [],
    }))

    payload.push({
      id: row.id,
      timestamp: new Date(row.created_at).toLocaleString('id-ID'),
      userEmail: user?.email ?? 'Unknown User',
      userId: row.user_id ?? 'unknown',
      courseId: row.course_id ?? null,
      courseName: course?.title ?? requestPayload?.step1?.topic ?? 'Permintaan Kursus',
      steps: {
        step1: requestPayload?.step1 ?? {},
        step2: requestPayload?.step2 ?? {},
        step3: requestPayload?.step3 ?? {},
      },
      outline: modules,
    })
  }

  return payload
}

async function fetchCached<T extends { id: string }>(
  cache: Map<string, T | null>,
  id: string | null,
  table: string
): Promise<T | null> {
  if (!id) return null
  if (cache.has(id)) return cache.get(id) ?? null
  try {
    const [record] = await DatabaseService.getRecords<T>(table, {
      filter: { id },
      limit: 1,
    })
    cache.set(id, record ?? null)
    return record ?? null
  } catch (error) {
    console.error(`[Activity API] Failed to fetch ${table} record ${id}:`, error)
    cache.set(id, null)
    return null
  }
}

async function buildLegacyPayload({
  userId,
  date,
}: {
  userId: string | null
  date: string | null
}) {
  try {
    const courses = await DatabaseService.getRecords<Course>('courses', {
      orderBy: { column: 'created_at', ascending: false },
    })

    let filtered = courses
    if (userId) {
      filtered = filtered.filter((course) => course.created_by === userId)
    }
    if (date) {
      const target = new Date(date)
      const start = new Date(target)
      start.setHours(0, 0, 0, 0)
      const end = new Date(target)
      end.setHours(23, 59, 59, 999)
      filtered = filtered.filter((course) => {
        const createdAt = new Date(course.created_at)
        return createdAt >= start && createdAt <= end
      })
    }

    const payload = []
    for (const course of filtered) {
      const [user] = await DatabaseService.getRecords<User>('users', {
        filter: { id: course.created_by },
        limit: 1,
      })

      payload.push({
        id: course.id,
        timestamp: new Date(course.created_at).toLocaleDateString('id-ID'),
        courseName: course.title || 'Untitled Course',
        userEmail: user?.email ?? 'Unknown User',
        userId: course.created_by,
        steps: {
          step1: {
            topic: course.subject ?? course.title,
            goal: course.description ?? '-',
          },
          step2: {
            level: course.difficulty_level ?? '-',
            extraTopics: '-',
          },
          step3: {
            problem: '-',
            assumption: '-',
          },
        },
        outline: [],
      })
    }

    return payload
  } catch (error) {
    console.error('[Activity API] Legacy payload fallback failed:', error)
    return []
  }
}
