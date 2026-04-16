import { NextRequest } from 'next/server'
import { sign } from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-purposes-only'

let tableData: Record<string, any[]> = {}

const mockQueryChain = () => {
  let currentTable = ''
  let currentFilters: Record<string, any> = {}
  let nullFilters: string[] = []
  let limitCount: number | null = null
  let maybeSingle = false

  const chain: any = {
    select: jest.fn().mockReturnThis(),
    eq: jest.fn((key: string, value: any) => {
      currentFilters[key] = value
      return chain
    }),
    is: jest.fn((key: string, value: any) => {
      if (value === null) {
        nullFilters.push(key)
      } else {
        currentFilters[key] = value
      }
      return chain
    }),
    order: jest.fn().mockReturnThis(),
    limit: jest.fn((count: number) => {
      limitCount = count
      return chain
    }),
    maybeSingle: jest.fn(() => {
      maybeSingle = true
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

        for (const key of nullFilters) {
          data = data.filter((item: any) => item[key] == null)
        }

        if (limitCount != null) {
          data = data.slice(0, limitCount)
        }

        resolve({
          data: maybeSingle ? (data[0] ?? null) : data,
          error: null,
        })
      }
    },
  })

  chain._setTable = (table: string) => {
    currentTable = table
    currentFilters = {}
    nullFilters = []
    limitCount = null
    maybeSingle = false
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

import { GET } from '@/app/api/admin/users/[id]/activity-summary/route'

function createAdminRequest(url = '/api/admin/users/user-1/activity-summary') {
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

describe('GET /api/admin/users/[id]/activity-summary', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    tableData = {}
  })

  it('returns unified recentReflection from jurnal and avoids double counting mirror totals', async () => {
    const now = new Date().toISOString()
    setupMockDatabase({
      users: [
        { id: 'user-1', email: 'student@example.com', deleted_at: null },
      ],
      discussion_sessions: [],
      jurnal: [
        {
          id: 'journal-1',
          user_id: 'user-1',
          subtopic_label: 'Sorting',
          content: JSON.stringify({
            understood: 'Saya paham cara kerja quick sort.',
            confused: '',
            strategy: '',
            promptEvolution: '',
            contentRating: 4,
            contentFeedback: 'Contoh visual membantu.',
          }),
          reflection: JSON.stringify({
            subtopic: 'Sorting',
            fields: {
              understood: 'Saya paham cara kerja quick sort.',
              confused: '',
              strategy: '',
              promptEvolution: '',
              contentRating: 4,
              contentFeedback: 'Contoh visual membantu.',
            },
          }),
          created_at: now,
        },
      ],
      transcript: [],
      ask_question_history: [],
      challenge_responses: [],
      quiz_submissions: [],
      feedback: [
        {
          id: 'feedback-1',
          user_id: 'user-1',
          rating: 4,
          comment: 'Contoh visual membantu.',
          created_at: new Date(Date.now() + 1000).toISOString(),
        },
      ],
      courses: [],
    })

    const response = await GET(createAdminRequest(), {
      params: Promise.resolve({ id: 'user-1' }),
    })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.recentReflection).toEqual({
      id: 'journal-1',
      title: 'Sorting',
      snippet: 'Saya paham cara kerja quick sort.',
      rating: 4,
      createdAt: now,
      source: 'jurnal',
    })
    expect(data.totals.reflections).toBe(1)
    expect(data.totals.journals).toBe(1)
    expect(data.totals.feedbacks).toBe(1)
  })

  it('falls back to direct feedback when no jurnal exists', async () => {
    const now = new Date().toISOString()
    setupMockDatabase({
      users: [
        { id: 'user-1', email: 'student@example.com', deleted_at: null },
      ],
      discussion_sessions: [],
      jurnal: [],
      transcript: [],
      ask_question_history: [],
      challenge_responses: [],
      quiz_submissions: [],
      feedback: [
        {
          id: 'feedback-legacy-1',
          user_id: 'user-1',
          rating: 5,
          comment: 'Materinya sangat jelas.',
          created_at: now,
        },
      ],
      courses: [],
    })

    const response = await GET(createAdminRequest(), {
      params: Promise.resolve({ id: 'user-1' }),
    })
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data.recentReflection).toEqual({
      id: 'feedback-legacy-1',
      title: 'Refleksi terbaru',
      snippet: 'Materinya sangat jelas.',
      rating: 5,
      createdAt: now,
      source: 'feedback',
    })
    expect(data.totals.reflections).toBe(1)
  })
})
