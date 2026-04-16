import { createMockNextRequest, generateJWT } from '../../setup/test-utils'
import { TEST_STUDENT } from '../../fixtures/users.fixture'
import { TEST_COURSE, TEST_SUBTOPIC } from '../../fixtures/courses.fixture'

const mockGetRecords = jest.fn()
const mockFetch = jest.fn()

jest.mock('@/lib/api-middleware', () => ({
  withProtection: (handler: unknown) => handler,
}))

jest.mock('@/lib/database', () => ({
  DatabaseService: {
    getRecords: (...args: unknown[]) => mockGetRecords(...args),
  },
}))

import { GET } from '@/app/api/admin/activity/quiz/route'

describe('GET /api/admin/activity/quiz', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    global.fetch = mockFetch as unknown as typeof fetch

    mockGetRecords.mockImplementation((table: string, options?: { filter?: Record<string, unknown> }) => {
      if (table === 'quiz') {
        const quizId = options?.filter?.id
        if (quizId === 'quiz-3') {
          return Promise.resolve([
            {
              id: 'quiz-3',
              course_id: TEST_COURSE.id,
              subtopic_id: TEST_SUBTOPIC.id,
              question: 'Question 3?',
              options: ['A', 'B', 'C', 'D'],
              correct_answer: 'A',
            },
          ])
        }
        return Promise.resolve([])
      }

      if (table === 'users') {
        return Promise.resolve([
          { id: TEST_STUDENT.id, email: TEST_STUDENT.email },
        ])
      }

      if (table === 'courses') {
        return Promise.resolve([
          { id: TEST_COURSE.id, title: TEST_COURSE.title },
        ])
      }

      if (table === 'subtopics') {
        return Promise.resolve([
          { id: TEST_SUBTOPIC.id, title: TEST_SUBTOPIC.title },
        ])
      }

      return Promise.resolve([])
    })

    mockFetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(input.toString())
      if (url.pathname.endsWith('/rest/v1/quiz_submissions')) {
        const isCountQuery = url.searchParams.get('select') === 'id'
        if (isCountQuery) {
          return new Response(JSON.stringify([{ id: 'submission-count' }]), {
            status: 200,
            headers: {
              'content-range': '0-0/3',
            },
          })
        }

        return new Response(
          JSON.stringify([
            {
              id: 'submission-3',
              user_id: TEST_STUDENT.id,
              quiz_id: 'quiz-3',
              course_id: TEST_COURSE.id,
              subtopic_id: TEST_SUBTOPIC.id,
              answer: 'A',
              is_correct: true,
              reasoning_note: 'Because it is correct',
              attempt_number: 2,
              quiz_attempt_id: 'attempt-2',
              created_at: '2025-02-03T10:00:00.000Z',
            },
          ]),
          {
            status: 200,
            headers: {
              'content-range': '2-2/3',
            },
          },
        )
      }

      if (url.pathname.endsWith('/rest/v1/subtopics')) {
        return new Response(
          JSON.stringify([
            { id: TEST_SUBTOPIC.id, title: TEST_SUBTOPIC.title },
          ]),
          { status: 200 },
        )
      }

      throw new Error(`Unexpected fetch URL: ${url.toString()}`)
    })
  })

  it('returns paginated quiz logs with metadata and respects page/pageSize', async () => {
    const token = generateJWT({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'ADMIN',
    })

    const request = createMockNextRequest(
      'GET',
      `/api/admin/activity/quiz?userId=${TEST_STUDENT.id}&course=${TEST_COURSE.id}&date=2025-02-03&page=2&pageSize=2`,
      {
        cookies: { access_token: token },
      },
    )

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(Array.isArray(data.data)).toBe(true)
    expect(data.data).toHaveLength(1)
    expect(data.data[0]).toMatchObject({
      id: 'submission-3',
      userId: TEST_STUDENT.id,
      courseTitle: TEST_COURSE.title,
      topic: TEST_SUBTOPIC.title,
      quizAttemptId: 'attempt-2',
    })
    expect(data.pagination).toEqual({
      page: 2,
      pageSize: 2,
      totalItems: 3,
      totalPages: 2,
      hasNextPage: false,
      hasPreviousPage: true,
    })

    const countCall = mockFetch.mock.calls[0]?.[0] as string | URL
    const pageCall = mockFetch.mock.calls[1]?.[0] as string | URL
    const countUrl = new URL(countCall.toString())
    const pageUrl = new URL(pageCall.toString())

    expect(countUrl.searchParams.get('user_id')).toBe(`eq.${TEST_STUDENT.id}`)
    expect(countUrl.searchParams.get('course_id')).toBe(`eq.${TEST_COURSE.id}`)
    expect(countUrl.searchParams.get('created_at')).toContain('gte.')
    expect(pageUrl.searchParams.get('offset')).toBe('2')
    expect(pageUrl.searchParams.get('limit')).toBe('2')
  })

  it('returns an empty page when the topic filter matches no subtopics', async () => {
    mockFetch.mockImplementationOnce(async () => new Response(JSON.stringify([]), { status: 200 }))

    const token = generateJWT({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'ADMIN',
    })

    const request = createMockNextRequest(
      'GET',
      `/api/admin/activity/quiz?topic=No%20Match&page=1&pageSize=10`,
      {
        cookies: { access_token: token },
      },
    )

    const response = await GET(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.data).toEqual([])
    expect(data.pagination).toEqual({
      page: 1,
      pageSize: 10,
      totalItems: 0,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
    })
  })
})
