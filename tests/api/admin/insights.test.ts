/**
 * API Tests for /api/admin/insights endpoint
 *
 * Covers unified reflection analytics across jurnal + feedback.
 */

import { NextRequest } from 'next/server'
import { sign } from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-purposes-only'

let tableData: Record<string, any[]> = {}

const mockQueryChain = () => {
  let currentTable = ''
  let currentFilters: Record<string, any> = {}
  const chain: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn((key: string, value: any) => {
      currentFilters[key] = value
      return chain
    }),
  }

  Object.defineProperty(chain, 'then', {
    get() {
      return (resolve: any) => {
        let data = tableData[currentTable] || []
        for (const [key, value] of Object.entries(currentFilters)) {
          data = data.filter((item: any) => item[key] === value)
        }
        resolve({ data, error: null })
      }
    },
  })

  chain._setTable = (table: string) => {
    currentTable = table
    currentFilters = {}
  }

  return chain
}

const mockFrom = jest.fn((table: string) => {
  const chain = mockQueryChain()
  chain._setTable(table)
  return chain
})

jest.mock('@/lib/database', () => ({
  adminDb: {
    from: (...args: any[]) => mockFrom(...args),
  },
}))

jest.mock('@/lib/api-middleware', () => ({
  withCacheHeaders: (response: any) => response,
}))

import { GET } from '@/app/api/admin/insights/route'

function createAdminRequest(url = '/api/admin/insights'): NextRequest {
  const token = sign(
    { userId: 'admin-1', email: 'admin@example.com', role: 'admin' },
    JWT_SECRET,
    { expiresIn: '15m' },
  )

  const fullUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`
  return new NextRequest(fullUrl, {
    method: 'GET',
    headers: { Cookie: `access_token=${token}` },
  })
}

function setupMockDatabase(data: Record<string, any[]>) {
  tableData = { ...data }
}

describe('GET /api/admin/insights', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    tableData = {}
  })

  it('merges jurnal and feedback into a single reflection metric', async () => {
    const now = new Date().toISOString()
    setupMockDatabase({
      users: [
        { id: 'user-1', email: 'student1@example.com', created_at: now, role: 'user' },
      ],
      courses: [
        { id: 'course-1', title: 'Course 1', created_at: now, created_by: 'user-1' },
      ],
      ask_question_history: [],
      quiz_submissions: [],
      jurnal: [
        {
          id: 'journal-1',
          user_id: 'user-1',
          course_id: 'course-1',
          subtopic_id: 'subtopic-1',
          subtopic_label: 'Intro',
          module_index: 1,
          subtopic_index: 1,
          type: 'structured_reflection',
          content: JSON.stringify({
            understood: 'Paham',
            confused: '',
            strategy: '',
            promptEvolution: '',
            contentRating: 5,
            contentFeedback: 'Bagus',
          }),
          reflection: JSON.stringify({
            fields: {
              understood: 'Paham',
              confused: '',
              strategy: '',
              promptEvolution: '',
              contentRating: 5,
              contentFeedback: 'Bagus',
            },
          }),
          created_at: now,
        },
      ],
      feedback: [
        {
          id: 'feedback-1',
          user_id: 'user-1',
          course_id: 'course-1',
          subtopic_id: 'subtopic-1',
          subtopic_label: 'Intro',
          module_index: 1,
          subtopic_index: 1,
          rating: 5,
          comment: 'Bagus',
          created_at: new Date(Date.now() + 1000).toISOString(),
        },
      ],
      challenge_responses: [],
      discussion_sessions: [],
      prompt_classifications: [],
    })

    const response = await GET(createAdminRequest())
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.summary.reflectionTotal).toBe(1)
    expect(data.summary.structuredReflections).toBe(1)
    expect(data.summary.avgContentRating).toBe(5)
    expect(data.summary.ctIndicators).toBe(1)
    expect(data.studentSummary).toHaveLength(1)
    expect(data.studentSummary[0].totalReflections).toBe(1)
  })
})
