/**
 * API Tests for POST /api/jurnal/save endpoint
 *
 * Focus:
 * - auth-derived identity
 * - course ownership and subtopic scoping
 * - structured reflection serialization
 * - feedback mirror dedupe behaviour
 */

import { createMockNextRequest } from '../../setup/test-utils'
import { TEST_STUDENT } from '../../fixtures/users.fixture'
import { TEST_COURSE, TEST_SUBTOPIC } from '../../fixtures/courses.fixture'

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server')
  return {
    ...actual,
    after: jest.fn(),
  }
})

jest.mock('@/lib/api-logger', () => ({
  withApiLogging: (handler: unknown) => handler,
}))

jest.mock('@/lib/auth-helper', () => ({
  resolveAuthUserId: jest.fn(),
}))

jest.mock('@/services/auth.service', () => ({
  resolveUserByIdentifier: jest.fn(),
}))

const feedbackInsertSpy = jest.fn()
const feedbackUpdateSpy = jest.fn()
let feedbackSelectResult: { data: unknown[]; error: null | { message: string } }
let feedbackInsertResult: { data: { id: string } | null; error: null | { message: string } }
let feedbackUpdateResult: { data: unknown[] | null; error: null | { message: string } }

const mockAdminFrom = jest.fn((table: string) => {
  if (table === 'feedback') {
    const chain: any = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      is: jest.fn(() => chain),
      order: jest.fn(() => chain),
      limit: jest.fn(async () => feedbackSelectResult),
      insert: jest.fn(async (payload: unknown) => {
        feedbackInsertSpy(payload)
        return feedbackInsertResult
      }),
      update: jest.fn(async (payload: unknown) => {
        feedbackUpdateSpy(payload)
        return feedbackUpdateResult
      }),
    }
    return chain
  }

  return {
    insert: jest.fn(async () => ({ error: null })),
  }
})

jest.mock('@/lib/database', () => ({
  DatabaseService: {
    getRecords: jest.fn(),
    insertRecord: jest.fn(),
  },
  adminDb: {
    from: (...args: unknown[]) => mockAdminFrom(...args),
  },
}))

jest.mock('@/lib/schemas', () => ({
  JurnalSchema: {},
  parseBody: jest.fn(),
}))

import { POST } from '@/app/api/jurnal/save/route'
import { resolveAuthUserId } from '@/lib/auth-helper'
import { resolveUserByIdentifier } from '@/services/auth.service'
import { DatabaseService } from '@/lib/database'
import { parseBody } from '@/lib/schemas'

const mockResolveAuthUserId = resolveAuthUserId as jest.MockedFunction<typeof resolveAuthUserId>
const mockResolveUser = resolveUserByIdentifier as jest.MockedFunction<typeof resolveUserByIdentifier>
const mockGetRecords = DatabaseService.getRecords as jest.MockedFunction<typeof DatabaseService.getRecords>
const mockInsertRecord = DatabaseService.insertRecord as jest.MockedFunction<typeof DatabaseService.insertRecord>
const mockParseBody = parseBody as jest.MockedFunction<typeof parseBody>

describe('POST /api/jurnal/save', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    feedbackSelectResult = { data: [], error: null }
    feedbackInsertResult = { data: { id: 'feedback-001' }, error: null }
    feedbackUpdateResult = { data: [], error: null }
    mockResolveAuthUserId.mockReturnValue(TEST_STUDENT.id)
    mockResolveUser.mockResolvedValue({ id: TEST_STUDENT.id, email: TEST_STUDENT.email } as never)
  })

  it('saves a free-text journal for the authenticated course owner', async () => {
    const body = {
      courseId: TEST_COURSE.id,
      content: 'Today I learned about software testing fundamentals.',
    }

    mockParseBody.mockReturnValue({ success: true, data: body } as never)
    mockGetRecords.mockResolvedValueOnce([{ id: TEST_COURSE.id, title: TEST_COURSE.title }] as never)
    mockInsertRecord.mockResolvedValue({ id: 'jurnal-001' } as never)

    const request = createMockNextRequest('POST', '/api/jurnal/save', { body })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toMatchObject({
      success: true,
      id: 'jurnal-001',
      feedbackSaved: false,
      feedbackMirrorAction: 'skipped',
    })

    expect(mockResolveUser).toHaveBeenCalledWith(TEST_STUDENT.id)
    expect(mockGetRecords).toHaveBeenCalledWith('courses', {
      filter: { id: TEST_COURSE.id, created_by: TEST_STUDENT.id },
      limit: 1,
    })
    expect(mockInsertRecord).toHaveBeenCalledWith('jurnal', expect.objectContaining({
      user_id: TEST_STUDENT.id,
      course_id: TEST_COURSE.id,
      type: 'free_text',
      content: 'Today I learned about software testing fundamentals.',
    }))
    expect(mockAdminFrom).not.toHaveBeenCalledWith('feedback')
  })

  it('saves a structured reflection and creates one feedback mirror when no recent duplicate exists', async () => {
    const body = {
      courseId: TEST_COURSE.id,
      subtopicId: TEST_SUBTOPIC.id,
      subtopic: TEST_SUBTOPIC.title,
      moduleIndex: 0,
      subtopicIndex: 1,
      type: 'structured_reflection',
      content: {
        understood: 'I understood the basics of unit testing.',
        confused: 'Integration testing is still unclear.',
        strategy: 'Practice more with real projects.',
        promptEvolution: 'My questions became more specific.',
        contentRating: 4,
        contentFeedback: 'Good content overall.',
      },
    }

    mockParseBody.mockReturnValue({ success: true, data: body } as never)
    mockGetRecords
      .mockResolvedValueOnce([{ id: TEST_COURSE.id, title: TEST_COURSE.title }] as never)
      .mockResolvedValueOnce([{ id: TEST_SUBTOPIC.id }] as never)
    mockInsertRecord.mockResolvedValue({ id: 'jurnal-structured-001' } as never)

    const request = createMockNextRequest('POST', '/api/jurnal/save', { body })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toMatchObject({
      success: true,
      id: 'jurnal-structured-001',
      feedbackSaved: true,
      feedbackMirrorAction: 'created',
    })

    const insertedJournal = mockInsertRecord.mock.calls[0]?.[1] as Record<string, string>
    expect(insertedJournal.type).toBe('structured_reflection')
    expect(JSON.parse(insertedJournal.content)).toMatchObject({
      understood: 'I understood the basics of unit testing.',
      contentRating: 4,
      contentFeedback: 'Good content overall.',
    })

    expect(feedbackInsertSpy).toHaveBeenCalledWith(expect.objectContaining({
      user_id: TEST_STUDENT.id,
      course_id: TEST_COURSE.id,
      subtopic_id: TEST_SUBTOPIC.id,
      subtopic_label: TEST_SUBTOPIC.title,
      origin_jurnal_id: 'jurnal-structured-001',
      rating: 4,
      comment: 'Good content overall.',
    }))
  })

  it('reuses a recent identical feedback mirror instead of inserting a duplicate row', async () => {
    const body = {
      courseId: TEST_COURSE.id,
      subtopicId: TEST_SUBTOPIC.id,
      subtopic: TEST_SUBTOPIC.title,
      moduleIndex: 0,
      subtopicIndex: 1,
      type: 'structured_reflection',
      content: {
        understood: 'Saya paham konsep inti.',
        confused: 'Saya masih ingin memperjelas contoh edge case.',
        strategy: 'Saya akan mencoba latihan ulang dengan contoh kecil.',
        promptEvolution: 'Saya mulai bertanya dengan konteks yang lebih spesifik.',
        contentRating: 5,
        contentFeedback: 'Materinya sangat membantu.',
      },
    }

    feedbackSelectResult = {
      data: [
        {
          id: 'feedback-existing-001',
          origin_jurnal_id: null,
          subtopic_id: TEST_SUBTOPIC.id,
          subtopic_label: TEST_SUBTOPIC.title,
          module_index: 0,
          subtopic_index: 1,
          rating: 5,
          comment: 'Materinya sangat membantu.',
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    }

    mockParseBody.mockReturnValue({ success: true, data: body } as never)
    mockGetRecords
      .mockResolvedValueOnce([{ id: TEST_COURSE.id, title: TEST_COURSE.title }] as never)
      .mockResolvedValueOnce([{ id: TEST_SUBTOPIC.id }] as never)
    mockInsertRecord.mockResolvedValue({ id: 'jurnal-structured-002' } as never)

    const request = createMockNextRequest('POST', '/api/jurnal/save', { body })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toMatchObject({
      success: true,
      feedbackSaved: true,
      feedbackMirrorAction: 'reused',
    })
    expect(feedbackInsertSpy).not.toHaveBeenCalled()
    expect(feedbackUpdateSpy).toHaveBeenCalledWith({
      origin_jurnal_id: 'jurnal-structured-002',
    })
  })

  it('reuses an already linked duplicate feedback mirror without relinking it', async () => {
    const body = {
      courseId: TEST_COURSE.id,
      subtopicId: TEST_SUBTOPIC.id,
      subtopic: TEST_SUBTOPIC.title,
      moduleIndex: 0,
      subtopicIndex: 1,
      type: 'structured_reflection',
      content: {
        understood: 'Saya paham konsep inti.',
        confused: 'Saya masih ingin memperjelas contoh edge case.',
        strategy: 'Saya akan mencoba latihan ulang dengan contoh kecil.',
        promptEvolution: 'Saya mulai bertanya dengan konteks yang lebih spesifik.',
        contentRating: 5,
        contentFeedback: 'Materinya sangat membantu.',
      },
    }

    feedbackSelectResult = {
      data: [
        {
          id: 'feedback-existing-linked-001',
          origin_jurnal_id: 'jurnal-existing-001',
          subtopic_id: TEST_SUBTOPIC.id,
          subtopic_label: TEST_SUBTOPIC.title,
          module_index: 0,
          subtopic_index: 1,
          rating: 5,
          comment: 'Materinya sangat membantu.',
          created_at: new Date().toISOString(),
        },
      ],
      error: null,
    }

    mockParseBody.mockReturnValue({ success: true, data: body } as never)
    mockGetRecords
      .mockResolvedValueOnce([{ id: TEST_COURSE.id, title: TEST_COURSE.title }] as never)
      .mockResolvedValueOnce([{ id: TEST_SUBTOPIC.id }] as never)
    mockInsertRecord.mockResolvedValue({ id: 'jurnal-structured-003' } as never)

    const request = createMockNextRequest('POST', '/api/jurnal/save', { body })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(200)
    expect(data).toMatchObject({
      success: true,
      feedbackSaved: true,
      feedbackMirrorAction: 'reused',
    })
    expect(feedbackInsertSpy).not.toHaveBeenCalled()
    expect(feedbackUpdateSpy).not.toHaveBeenCalled()
  })

  it('returns 400 when the subtopic does not belong to the supplied course', async () => {
    const body = {
      courseId: TEST_COURSE.id,
      subtopicId: TEST_SUBTOPIC.id,
      content: 'Some content',
    }

    mockParseBody.mockReturnValue({ success: true, data: body } as never)
    mockGetRecords
      .mockResolvedValueOnce([{ id: TEST_COURSE.id, title: TEST_COURSE.title }] as never)
      .mockResolvedValueOnce([] as never)

    const request = createMockNextRequest('POST', '/api/jurnal/save', { body })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(400)
    expect(data.error).toBe('Subtopic not found in this course')
    expect(mockInsertRecord).not.toHaveBeenCalled()
  })

  it('returns 403 when the authenticated user does not own the course', async () => {
    const body = {
      courseId: TEST_COURSE.id,
      content: 'Some content',
    }

    mockParseBody.mockReturnValue({ success: true, data: body } as never)
    mockGetRecords.mockResolvedValueOnce([] as never)

    const request = createMockNextRequest('POST', '/api/jurnal/save', { body })
    const response = await POST(request)
    const data = await response.json()

    expect(response.status).toBe(403)
    expect(data.error).toBe('Course not found or access denied')
    expect(mockInsertRecord).not.toHaveBeenCalled()
  })
})
