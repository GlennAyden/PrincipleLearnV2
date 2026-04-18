import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DatabaseService } from '@/lib/database'
import { withProtection } from '@/lib/api-middleware'

const DEFAULT_PAGE_SIZE = 25
const MAX_PAGE_SIZE = 100

interface QuizSubmission {
  id: string
  user_id: string
  quiz_id: string
  course_id?: string | null
  subtopic_id?: string | null
  leaf_subtopic_id?: string | null
  subtopic_label?: string | null
  module_index?: number | null
  subtopic_index?: number | null
  answer: string
  is_correct: boolean
  reasoning_note?: string | null
  attempt_number?: number | null
  quiz_attempt_id?: string | null
  submitted_at?: string
  created_at?: string
}

interface Quiz {
  id: string
  course_id: string
  subtopic_id: string
  question: string
  options: unknown
  correct_answer: string | null
}

interface User {
  id: string
  email: string
}

interface Course {
  id: string
  title: string
}

interface Subtopic {
  id: string
  title: string
}

interface LeafSubtopic {
  id: string
  title: string
  parent_subtopic_id?: string | null
}

interface PaginationMeta {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

interface QuizActivityItem {
  id: string
  timestamp: string
  rawTimestamp: string | null
  userEmail: string
  userId: string
  topic: string
  subtopicId: string | null
  courseTitle: string
  question: string
  options: unknown[]
  userAnswer: string
  correctAnswer: string
  isCorrect: boolean
  reasoningNote: string
  moduleIndex: number | null
  subtopicIndex: number | null
  attemptNumber: number
  quizAttemptId: string | null
}

function resolveSubmissionTimestamp(submission: QuizSubmission): Date | null {
  const rawValue = submission.submitted_at ?? submission.created_at ?? null
  if (!rawValue) return null
  const parsed = new Date(rawValue)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function parsePositiveInt(rawValue: string | null, fallback: number, max?: number): number {
  const parsed = rawValue ? Number.parseInt(rawValue, 10) : Number.NaN
  if (!Number.isFinite(parsed) || parsed < 1) return fallback
  return typeof max === 'number' ? Math.min(parsed, max) : parsed
}

function parseContentRangeTotal(contentRange: string | null): number {
  if (!contentRange) return 0
  const totalText = contentRange.split('/').pop()
  const parsed = totalText ? Number.parseInt(totalText, 10) : Number.NaN
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0
}

function startOfDay(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(0, 0, 0, 0)
  return date.toISOString()
}

function endOfDay(value: string): string | null {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  date.setHours(23, 59, 59, 999)
  return date.toISOString()
}

function buildSupabaseRestConfig() {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!baseUrl || !serviceKey) {
    throw new Error('Supabase environment is not configured')
  }

  return {
    restBaseUrl: `${baseUrl.replace(/\/$/, '')}/rest/v1`,
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  }
}

function appendFilter(params: URLSearchParams, column: string, operator: string, value: string) {
  params.append(column, `${operator}.${value}`)
}

function buildSubmissionQuery(filters: {
  userId?: string | null
  courseId?: string | null
  subtopicIds?: string[] | null
  leafSubtopicIds?: string[] | null
  dateFrom?: string | null
  dateTo?: string | null
  select?: string
  limit: number
  offset?: number
}) {
  const params = new URLSearchParams()
  params.set('select', filters.select ?? '*')
  params.set('order', 'created_at.desc')
  params.set('limit', String(filters.limit))
  if (typeof filters.offset === 'number' && filters.offset > 0) {
    params.set('offset', String(filters.offset))
  }
  if (filters.userId) appendFilter(params, 'user_id', 'eq', filters.userId)
  if (filters.courseId) appendFilter(params, 'course_id', 'eq', filters.courseId)
  if (filters.subtopicIds?.length && filters.leafSubtopicIds?.length) {
    params.append('or', `(subtopic_id.in.(${filters.subtopicIds.join(',')}),leaf_subtopic_id.in.(${filters.leafSubtopicIds.join(',')}))`)
  } else if (filters.subtopicIds && filters.subtopicIds.length > 0) {
    appendFilter(params, 'subtopic_id', 'in', `(${filters.subtopicIds.join(',')})`)
  } else if (filters.leafSubtopicIds && filters.leafSubtopicIds.length > 0) {
    appendFilter(params, 'leaf_subtopic_id', 'in', `(${filters.leafSubtopicIds.join(',')})`)
  }
  if (filters.dateFrom) appendFilter(params, 'created_at', 'gte', filters.dateFrom)
  if (filters.dateTo) appendFilter(params, 'created_at', 'lte', filters.dateTo)
  return params
}

async function fetchSupabaseRows<T>(table: string, query: URLSearchParams) {
  const { restBaseUrl, headers } = buildSupabaseRestConfig()
  const url = new URL(`${restBaseUrl}/${table}`)
  url.search = query.toString()

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      ...headers,
      Prefer: 'count=exact',
    },
  })

  if (!response.ok) {
    const body = await response.text().catch(() => '')
    throw new Error(`Supabase query failed for ${table}: ${response.status} ${body}`)
  }

  const data = (await response.json().catch(() => [])) as T[]
  return {
    data,
    totalItems: parseContentRangeTotal(response.headers.get('content-range')),
  }
}

async function fetchTopicIds(courseId: string | null, topicFilter: string): Promise<{ subtopicIds: string[]; leafSubtopicIds: string[] }> {
  const { restBaseUrl, headers } = buildSupabaseRestConfig()
  const subtopicsUrl = new URL(`${restBaseUrl}/subtopics`)
  subtopicsUrl.searchParams.set('select', 'id,title')
  subtopicsUrl.searchParams.set('title', `ilike.%${topicFilter}%`)
  if (courseId) appendFilter(subtopicsUrl.searchParams, 'course_id', 'eq', courseId)

  const leafUrl = new URL(`${restBaseUrl}/leaf_subtopics`)
  leafUrl.searchParams.set('select', 'id,title')
  leafUrl.searchParams.set('title', `ilike.%${topicFilter}%`)
  if (courseId) appendFilter(leafUrl.searchParams, 'course_id', 'eq', courseId)

  async function fetchTopicRows(url: URL, label: string): Promise<{ rows: Array<{ id?: string }>; error: Error | null }> {
    try {
      const response = await fetch(url, { method: 'GET', headers })
      if (!response.ok) {
        const body = await response.text().catch(() => '')
        return { rows: [], error: new Error(`Failed to resolve ${label} topic filter: ${response.status} ${body}`) }
      }
      return {
        rows: (await response.json().catch(() => [])) as Array<{ id?: string }>,
        error: null,
      }
    } catch (error) {
      return {
        rows: [],
        error: error instanceof Error ? error : new Error(String(error)),
      }
    }
  }

  const [subtopicResult, leafResult] = await Promise.all([
    fetchTopicRows(subtopicsUrl, 'subtopic'),
    fetchTopicRows(leafUrl, 'leaf subtopic'),
  ])

  if (subtopicResult.error && leafResult.error) {
    throw new Error(`${subtopicResult.error.message}; ${leafResult.error.message}`)
  }
  if (subtopicResult.error) {
    console.warn('[Activity API] Could not resolve topic against subtopics:', subtopicResult.error.message)
  }
  if (leafResult.error) {
    console.warn('[Activity API] Could not resolve topic against leaf_subtopics:', leafResult.error.message)
  }

  const subtopicRows = subtopicResult.rows
  const leafRows = leafResult.rows
  return {
    subtopicIds: subtopicRows.map((row) => row.id).filter((id): id is string => typeof id === 'string' && id.length > 0),
    leafSubtopicIds: leafRows.map((row) => row.id).filter((id): id is string => typeof id === 'string' && id.length > 0),
  }
}

async function activityHandler(req: NextRequest) {
  console.log('[Activity API] Starting quiz activity fetch')

  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')?.trim() || null
    const date = searchParams.get('date')?.trim() || null
    const dateTo = searchParams.get('dateTo')?.trim() || null
    const courseId = searchParams.get('course')?.trim() || null
    const topicFilter = searchParams.get('topic')?.trim() || null
    const page = parsePositiveInt(searchParams.get('page'), 1)
    const pageSize = parsePositiveInt(searchParams.get('pageSize'), DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)

    console.log('[Activity API] Request params:', { userId, date, dateTo, courseId, topic: topicFilter, page, pageSize })

    let topicSubtopicIds: string[] | null = null
    let topicLeafSubtopicIds: string[] | null = null
    if (topicFilter) {
      const topicIds = await fetchTopicIds(courseId, topicFilter)
      topicSubtopicIds = topicIds.subtopicIds
      topicLeafSubtopicIds = topicIds.leafSubtopicIds
      if (topicSubtopicIds.length === 0 && topicLeafSubtopicIds.length === 0) {
        return NextResponse.json({
          data: [],
          pagination: {
            page: 1,
            pageSize,
            totalItems: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPreviousPage: false,
          } satisfies PaginationMeta,
          filters: { userId, date, dateTo, courseId, topic: topicFilter },
        })
      }
    }

    let dateFromIso: string | null = null
    let dateToIso: string | null = null
    if (date) {
      const from = startOfDay(date)
      if (from) dateFromIso = from
      const toSource = dateTo || date
      const to = endOfDay(toSource)
      if (to) dateToIso = to
    } else if (dateTo) {
      const from = startOfDay(dateTo)
      const to = endOfDay(dateTo)
      if (from) dateFromIso = from
      if (to) dateToIso = to
    }

    const countQuery = buildSubmissionQuery({
      userId,
      courseId,
      subtopicIds: topicSubtopicIds,
      leafSubtopicIds: topicLeafSubtopicIds,
      dateFrom: dateFromIso,
      dateTo: dateToIso,
      select: 'id',
      limit: 1,
    })
    const countResult = await fetchSupabaseRows<{ id: string }>('quiz_submissions', countQuery)
    const totalItems = countResult.totalItems
    const totalPages = totalItems > 0 ? Math.ceil(totalItems / pageSize) : 0
    const currentPage = totalPages > 0 ? Math.min(page, totalPages) : 1
    const offset = totalItems > 0 ? (currentPage - 1) * pageSize : 0

    const pageQuery = buildSubmissionQuery({
      userId,
      courseId,
      subtopicIds: topicSubtopicIds,
      leafSubtopicIds: topicLeafSubtopicIds,
      dateFrom: dateFromIso,
      dateTo: dateToIso,
      select: 'id,user_id,quiz_id,course_id,subtopic_id,leaf_subtopic_id,subtopic_label,module_index,subtopic_index,answer,is_correct,reasoning_note,attempt_number,quiz_attempt_id,created_at',
      limit: pageSize,
      offset,
    })
    const quizSubmissionsResult = await fetchSupabaseRows<QuizSubmission>('quiz_submissions', pageQuery)
    const quizSubmissions = quizSubmissionsResult.data

    let payload: QuizActivityItem[] = []
    try {
      payload = await hydrateQuizSubmissions(quizSubmissions)
    } catch (hydrateError) {
      console.error('[Activity API] Error hydrating quiz submissions:', hydrateError)
      return NextResponse.json({ error: 'Failed to fetch quiz logs' }, { status: 500 })
    }

    console.log(
      `[Activity API] Returning ${payload.length} quiz records (${currentPage}/${totalPages || 1}, total=${totalItems})`
    )
    return NextResponse.json({
      data: payload,
      pagination: {
        page: currentPage,
        pageSize,
        totalItems,
        totalPages,
        hasNextPage: totalPages > 0 ? currentPage < totalPages : false,
        hasPreviousPage: totalPages > 0 ? currentPage > 1 : false,
      } satisfies PaginationMeta,
      filters: {
        userId,
        date,
        dateTo,
        courseId,
        topic: topicFilter,
      },
    })
  } catch (error) {
    console.error('[Activity API] Error fetching quiz logs:', error)
    return NextResponse.json({ error: 'Failed to fetch quiz logs' }, { status: 500 })
  }
}

async function hydrateQuizSubmissions(quizSubmissions: QuizSubmission[]): Promise<QuizActivityItem[]> {
  const userCache = new Map<string, User | null>()
  const quizCache = new Map<string, Quiz | null>()
  const subtopicCache = new Map<string, Subtopic | null>()
  const leafSubtopicCache = new Map<string, LeafSubtopic | null>()
  const courseCache = new Map<string, Course | null>()

  const payload: QuizActivityItem[] = []
  for (const submission of quizSubmissions) {
    const quiz = await fetchCached(quizCache, submission.quiz_id, 'quiz')
    if (!quiz) continue

    const resolvedCourseId = submission.course_id ?? quiz.course_id
    const [leafSubtopic, subtopic, course, user] = await Promise.all([
      fetchCached(leafSubtopicCache, submission.leaf_subtopic_id ?? null, 'leaf_subtopics'),
      fetchCached(subtopicCache, submission.subtopic_id ?? quiz.subtopic_id, 'subtopics'),
      fetchCached(courseCache, resolvedCourseId, 'courses'),
      fetchCached(userCache, submission.user_id, 'users'),
    ])

    const submissionTimestamp = resolveSubmissionTimestamp(submission)

    payload.push({
      id: submission.id,
      timestamp: submissionTimestamp ? submissionTimestamp.toLocaleString('id-ID') : 'Unknown time',
      rawTimestamp: submissionTimestamp ? submissionTimestamp.toISOString() : null,
      userEmail: user?.email ?? 'Unknown User',
      userId: submission.user_id,
      topic: submission.subtopic_label ?? leafSubtopic?.title ?? subtopic?.title ?? 'Tanpa Subtopik',
      subtopicId: submission.leaf_subtopic_id ?? submission.subtopic_id ?? quiz.subtopic_id ?? null,
      courseTitle: course?.title ?? 'Tanpa Kursus',
      question: quiz.question,
      options: Array.isArray(quiz.options) ? quiz.options : [],
      userAnswer: submission.answer,
      correctAnswer: quiz.correct_answer ?? '',
      isCorrect: submission.is_correct,
      reasoningNote: submission.reasoning_note ?? '',
      moduleIndex: submission.module_index ?? null,
      subtopicIndex: submission.subtopic_index ?? null,
      attemptNumber: submission.attempt_number ?? 1,
      quizAttemptId: submission.quiz_attempt_id ?? null,
    })
  }

  return payload
}

export const GET = withProtection(activityHandler, {
  adminOnly: true,
  requireAuth: true,
  csrfProtection: false,
})

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
