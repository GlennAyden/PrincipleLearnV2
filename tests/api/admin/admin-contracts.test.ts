import { NextRequest } from 'next/server'
import { sign } from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-purposes-only'

let tableData: Record<string, any[]> = {}
let queryLog: Array<{
  table: string
  filters: Array<{ key: string; value: any }>
  inFilters: Array<{ key: string; values: any[] }>
  limitCount: number | null
  rangeArgs: [number, number] | null
}> = []

const mockVerifyAdminFromCookie = jest.fn(() => ({
  userId: 'admin-1',
  email: 'admin@example.com',
  role: 'admin',
}))

const mockGetRecords = jest.fn(async (table: string, options?: {
  filter?: Record<string, any>
  orderBy?: { column: string; ascending?: boolean }
  limit?: number
}) => {
  let rows = [...(tableData[table] ?? [])]

  for (const [key, value] of Object.entries(options?.filter ?? {})) {
    rows = rows.filter((row) => row[key] === value)
  }

  if (options?.orderBy) {
    const { column, ascending = true } = options.orderBy
    rows.sort((a, b) => compareValues(a[column], b[column], ascending))
  }

  if (options?.limit != null) {
    rows = rows.slice(0, options.limit)
  }

  return rows
})

function compareValues(a: unknown, b: unknown, ascending: boolean) {
  const left = a == null ? '' : String(a)
  const right = b == null ? '' : String(b)
  if (left === right) return 0
  const result = left > right ? 1 : -1
  return ascending ? result : -result
}

const mockQueryChain = (table: string) => {
  const state: {
    filters: Array<{ key: string; value: any }>
    inFilters: Array<{ key: string; values: any[] }>
    orderBy: { column: string; ascending: boolean } | null
    limitCount: number | null
    rangeArgs: [number, number] | null
  } = {
    filters: [],
    inFilters: [],
    orderBy: null,
    limitCount: null,
    rangeArgs: null,
  }

  const chain: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn((key: string, value: any) => {
      state.filters.push({ key, value })
      return chain
    }),
    gte: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    in: jest.fn((key: string, values: any[]) => {
      state.inFilters.push({ key, values })
      return chain
    }),
    order: jest.fn((column: string, options?: { ascending?: boolean }) => {
      state.orderBy = { column, ascending: options?.ascending !== false }
      return chain
    }),
    limit: jest.fn((count: number) => {
      state.limitCount = count
      return chain
    }),
    range: jest.fn((from: number, to: number) => {
      state.rangeArgs = [from, to]
      return chain
    }),
  }

  Object.defineProperty(chain, 'then', {
    get() {
      return (resolve: any) => {
        let rows = [...(tableData[table] ?? [])]

        for (const { key, value } of state.filters) {
          rows = rows.filter((row) => row[key] === value)
        }

        for (const { key, values } of state.inFilters) {
          rows = rows.filter((row) => values.includes(row[key]))
        }

        if (state.orderBy) {
          const { column, ascending } = state.orderBy
          rows.sort((a, b) => compareValues(a[column], b[column], ascending))
        }

        if (state.rangeArgs) {
          rows = rows.slice(state.rangeArgs[0], state.rangeArgs[1] + 1)
        }

        if (state.limitCount != null) {
          rows = rows.slice(0, state.limitCount)
        }

        queryLog.push({
          table,
          filters: [...state.filters],
          inFilters: state.inFilters.map((filter) => ({
            key: filter.key,
            values: [...filter.values],
          })),
          limitCount: state.limitCount,
          rangeArgs: state.rangeArgs ? [...state.rangeArgs] : null,
        })

        resolve({ data: rows, error: null })
      }
    },
  })

  return chain
}

const mockFrom = jest.fn((table: string) => mockQueryChain(table))

jest.mock('@/lib/api-middleware', () => ({
  withProtection: (handler: unknown) => handler,
  withCacheHeaders: (response: unknown) => response,
}))

jest.mock('@/lib/activitySeed', () => ({
  ensureAskQuestionHistorySeeded: jest.fn().mockResolvedValue(undefined),
  ensureChallengeResponsesSeeded: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('@/lib/admin-auth', () => ({
  verifyAdminFromCookie: (...args: any[]) => mockVerifyAdminFromCookie(...args),
}))

jest.mock('@/lib/database', () => ({
  adminDb: {
    from: (...args: any[]) => mockFrom(...args),
  },
  DatabaseService: {
    getRecords: (...args: any[]) => mockGetRecords(...args),
  },
}))

import { GET as getAskQuestionActivity } from '@/app/api/admin/activity/ask-question/route'
import { GET as getChallengeActivity } from '@/app/api/admin/activity/challenge/route'
import { GET as getTranscriptActivity } from '@/app/api/admin/activity/transcript/route'
import { GET as searchActivity } from '@/app/api/admin/activity/search/route'
import { GET as getResearchEvidence } from '@/app/api/admin/research/evidence/route'
import { GET as exportInsights } from '@/app/api/admin/insights/export/route'

function createRequest(path: string): NextRequest {
  const token = sign(
    { userId: 'admin-1', email: 'admin@example.com', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '15m' },
  )

  return new NextRequest(`http://localhost:3000${path}`, {
    method: 'GET',
    headers: { Cookie: `access_token=${token}` },
  })
}

function setupMockDatabase(data: Record<string, any[]>) {
  tableData = { ...data }
}

const activityDateRows = {
  users: [
    { id: 'user-1', email: 'student@example.com' },
  ],
  courses: [
    { id: 'course-1', title: 'Algorithms' },
  ],
  subtopics: [],
  research_evidence_items: [],
}

describe('admin activity date range contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    tableData = {}
    queryLog = []
  })

  it.each([
    {
      label: 'ask-question',
      path: '/api/admin/activity/ask-question',
      get: getAskQuestionActivity,
      table: 'ask_question_history',
      rows: [
        askQuestionRow('ask-before', '2026-04-09T12:00:00.000Z'),
        askQuestionRow('ask-start', '2026-04-10T12:00:00.000Z'),
        askQuestionRow('ask-end', '2026-04-12T12:00:00.000Z'),
        askQuestionRow('ask-after', '2026-04-13T12:00:00.000Z'),
      ],
      expectedIds: ['ask-end', 'ask-start'],
    },
    {
      label: 'challenge',
      path: '/api/admin/activity/challenge',
      get: getChallengeActivity,
      table: 'challenge_responses',
      rows: [
        challengeRow('challenge-before', '2026-04-09T12:00:00.000Z'),
        challengeRow('challenge-start', '2026-04-10T12:00:00.000Z'),
        challengeRow('challenge-end', '2026-04-12T12:00:00.000Z'),
        challengeRow('challenge-after', '2026-04-13T12:00:00.000Z'),
      ],
      expectedIds: ['challenge-end', 'challenge-start'],
    },
    {
      label: 'transcript',
      path: '/api/admin/activity/transcript',
      get: getTranscriptActivity,
      table: 'transcript',
      rows: [
        transcriptRow('transcript-before', '2026-04-09T12:00:00.000Z'),
        transcriptRow('transcript-start', '2026-04-10T12:00:00.000Z'),
        transcriptRow('transcript-end', '2026-04-12T12:00:00.000Z'),
        transcriptRow('transcript-after', '2026-04-13T12:00:00.000Z'),
      ],
      expectedIds: ['transcript-end', 'transcript-start'],
    },
  ])('$label accepts date/dateTo and dateFrom/dateTo ranges', async ({ path, get, table, rows, expectedIds }) => {
    setupMockDatabase({
      ...activityDateRows,
      [table]: rows,
    })

    const legacyResponse = await get(createRequest(`${path}?date=2026-04-10&dateTo=2026-04-12`))
    const legacyPayload = await legacyResponse.json()

    const explicitResponse = await get(createRequest(`${path}?dateFrom=2026-04-10&dateTo=2026-04-12`))
    const explicitPayload = await explicitResponse.json()

    expect(legacyResponse.status).toBe(200)
    expect(explicitResponse.status).toBe(200)
    expect(legacyPayload.map((item: { id: string }) => item.id)).toEqual(expectedIds)
    expect(explicitPayload.map((item: { id: string }) => item.id)).toEqual(expectedIds)
  })
})

describe('GET /api/admin/activity/search contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    tableData = {}
    queryLog = []
  })

  it('returns the original user email and keeps equal timestamps in stable order', async () => {
    const createdAt = '2026-04-12T09:00:00.000Z'
    setupMockDatabase({
      users: [
        { id: 'user-1', email: 'Student.One+Case@Example.COM' },
      ],
      ask_question_history: [
        { id: 'ask-2', user_id: 'user-1', course_id: 'course-1', question: 'Second same-time question', created_at: createdAt },
        { id: 'ask-1', user_id: 'user-1', course_id: 'course-1', question: 'First same-time question', created_at: createdAt },
      ],
      challenge_responses: [
        { id: 'challenge-1', user_id: 'user-1', course_id: 'course-1', question: 'Same-time challenge', created_at: createdAt },
      ],
    })

    const firstResponse = await searchActivity(createRequest('/api/admin/activity/search?timeRange=all&types=ask,challenge&q=student.one%2Bcase%40example.com&page=1&size=10'))
    const firstPayload = await firstResponse.json()
    const secondResponse = await searchActivity(createRequest('/api/admin/activity/search?timeRange=all&types=ask,challenge&q=student.one%2Bcase%40example.com&page=1&size=10'))
    const secondPayload = await secondResponse.json()

    expect(firstResponse.status).toBe(200)
    expect(firstPayload.items.map((item: { userEmail: string }) => item.userEmail)).toEqual([
      'Student.One+Case@Example.COM',
      'Student.One+Case@Example.COM',
      'Student.One+Case@Example.COM',
    ])
    expect(firstPayload.items.map((item: { id: string }) => item.id)).toEqual([
      'ask-2',
      'ask-1',
      'challenge-1',
    ])
    expect(secondPayload.items.map((item: { id: string }) => item.id)).toEqual(
      firstPayload.items.map((item: { id: string }) => item.id),
    )
  })
})

describe('GET /api/admin/research/evidence contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    tableData = {}
    queryLog = []
  })

  it('paginates merged evidence once instead of double-offsetting raw rows', async () => {
    setupMockDatabase({
      research_evidence_items: [],
      users: [
        { id: 'user-1', name: 'Student One', email: 'student@example.com' },
      ],
      ask_question_history: [
        askQuestionEvidenceRow('ask-5', '2026-04-05T10:00:00.000Z'),
        askQuestionEvidenceRow('ask-2', '2026-04-08T10:00:00.000Z'),
        askQuestionEvidenceRow('ask-4', '2026-04-06T10:00:00.000Z'),
        askQuestionEvidenceRow('ask-1', '2026-04-09T10:00:00.000Z'),
        askQuestionEvidenceRow('ask-3', '2026-04-07T10:00:00.000Z'),
      ],
    })

    const response = await getResearchEvidence(createRequest('/api/admin/research/evidence?source_type=ask_question&limit=2&offset=2'))
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(payload.total).toBe(5)
    expect(payload.offset).toBe(2)
    expect(payload.limit).toBe(2)
    expect(payload.rows.map((row: { id: string }) => row.id)).toEqual(['ask-3', 'ask-4'])
    expect(payload.rows.map((row: { id: string }) => row.id)).not.toContain('ask-5')

    const ledgerQuery = queryLog.find((entry) => entry.table === 'research_evidence_items')
    expect(ledgerQuery?.rangeArgs?.[0]).toBe(0)
  })
})

describe('GET /api/admin/insights/export contracts', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    tableData = {}
    queryLog = []
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('produces deterministic JSON export rows without using random values', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-04-18T00:00:00.000Z'))
    setupMockDatabase({
      users: [
        { id: 'user-1', email: 'student@example.com', role: 'user', created_at: '2026-01-05T00:00:00.000Z' },
      ],
      ask_question_history: [
        { id: 'prompt-1', user_id: 'user-1', prompt_stage: 'SCP', created_at: '2026-03-01T10:00:00.000Z' },
        { id: 'prompt-2', user_id: 'user-1', prompt_stage: 'SRP', created_at: '2026-03-02T10:00:00.000Z' },
      ],
      quiz_submissions: [
        { id: 'quiz-1', user_id: 'user-1', is_correct: true, created_at: '2026-03-03T10:00:00.000Z' },
        { id: 'quiz-2', user_id: 'user-1', is_correct: false, created_at: '2026-03-04T10:00:00.000Z' },
      ],
      jurnal: [
        { id: 'journal-1', user_id: 'user-1', created_at: '2026-03-05T10:00:00.000Z' },
      ],
      feedback: [
        { id: 'feedback-1', user_id: 'user-1', created_at: '2026-03-06T10:00:00.000Z' },
      ],
      challenge_responses: [
        { id: 'challenge-1', user_id: 'user-1', created_at: '2026-03-07T10:00:00.000Z' },
      ],
      prompt_classifications: [
        { id: 'classification-1', user_id: 'user-1', prompt_stage: 'MQP', prompt_stage_score: 3, created_at: '2026-04-01T10:00:00.000Z' },
      ],
      auto_cognitive_scores: [
        { id: 'score-1', user_id: 'user-1', ct_total_score: 1, created_at: '2026-04-02T10:00:00.000Z' },
        { id: 'score-2', user_id: 'user-1', ct_total_score: 2, created_at: '2026-04-03T10:00:00.000Z' },
      ],
    })

    const firstRequest = createRequest('/api/admin/insights/export?format=json')
    const secondRequest = createRequest('/api/admin/insights/export?format=json')
    const randomSpy = jest.spyOn(Math, 'random')

    const firstResponse = await exportInsights(firstRequest)
    const firstBody = await firstResponse.text()
    const secondResponse = await exportInsights(secondRequest)
    const secondBody = await secondResponse.text()

    expect(firstResponse.status).toBe(200)
    expect(firstResponse.headers.get('content-disposition')).toContain('insights-students-2026-04-18.json')
    expect(firstBody).toBe(secondBody)
    expect(randomSpy).not.toHaveBeenCalled()
    expect(JSON.parse(firstBody)).toEqual([
      {
        userId: 'user-1',
        email: 'student@example.com',
        totalPrompts: 2,
        totalQuizzes: 2,
        quizAccuracy: 50,
        totalReflections: 1,
        totalChallenges: 1,
        joinedAt: '2026-01-05T00:00:00.000Z',
        promptStage: 'MQP',
        ctScore: 1.5,
        lastActivity: '2026-04-03T10:00:00.000Z',
        cohort: '2026-01',
      },
    ])
  })
})

function askQuestionRow(id: string, createdAt: string) {
  return {
    id,
    user_id: 'user-1',
    course_id: 'course-1',
    module_index: 0,
    subtopic_index: 0,
    page_number: 1,
    subtopic_label: 'Sorting',
    question: `Question ${id}`,
    answer: `Answer ${id}`,
    created_at: createdAt,
  }
}

function challengeRow(id: string, createdAt: string) {
  return {
    id,
    user_id: 'user-1',
    course_id: 'course-1',
    module_index: 0,
    subtopic_index: 0,
    page_number: 1,
    question: `Challenge ${id}`,
    answer: `Answer ${id}`,
    feedback: 'Good',
    reasoning_note: 'Reasoning',
    created_at: createdAt,
  }
}

function transcriptRow(id: string, createdAt: string) {
  return {
    id,
    user_id: 'user-1',
    course_id: 'course-1',
    subtopic_id: null,
    content: `Transcript ${id}`,
    notes: 'Subtopic: Sorting',
    created_at: createdAt,
    updated_at: createdAt,
  }
}

function askQuestionEvidenceRow(id: string, createdAt: string) {
  return {
    id,
    user_id: 'user-1',
    course_id: 'course-1',
    learning_session_id: null,
    session_number: null,
    prompt_stage: 'SCP',
    question: `Prompt ${id}`,
    answer: `Answer ${id}`,
    stage_confidence: 0.9,
    research_validity_status: 'valid',
    coding_status: 'uncoded',
    researcher_notes: null,
    raw_evidence_snapshot: null,
    data_collection_week: null,
    created_at: createdAt,
  }
}
