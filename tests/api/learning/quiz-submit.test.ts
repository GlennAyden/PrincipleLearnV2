import { NextResponse } from 'next/server';
import { createMockNextRequest, generateJWT } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';
import { TEST_COURSE } from '../../fixtures/courses.fixture';

const mockParseBody = jest.fn();
const mockVerifyToken = jest.fn();
const mockResolveUserByIdentifier = jest.fn();
const mockScoreAndSave = jest.fn();
const mockAssertCourseOwnership = jest.fn();
const mockToOwnershipError = jest.fn();
const mockGetRecords = jest.fn();
const mockSubtopicsMaybeSingle = jest.fn();
const mockAttemptMaybeSingle = jest.fn();
const mockCacheMaybeSingle = jest.fn();
const mockCacheUpdate = jest.fn().mockResolvedValue({ data: null, error: null });
const mockInsert = jest.fn();
const mockApiLogsInsert = jest.fn().mockResolvedValue({ data: null, error: null });

jest.mock('@/lib/schemas', () => ({
  QuizSubmitSchema: { safeParse: jest.fn() },
  parseBody: (...args: unknown[]) => mockParseBody(...args),
}));

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    after: (callback: () => unknown) => callback(),
  };
});

jest.mock('@/lib/api-middleware', () => ({
  withProtection: (handler: unknown) => handler,
}));

jest.mock('@/lib/jwt', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

jest.mock('@/services/auth.service', () => ({
  resolveUserByIdentifier: (...args: unknown[]) => mockResolveUserByIdentifier(...args),
}));

jest.mock('@/services/cognitive-scoring.service', () => ({
  scoreAndSave: (...args: unknown[]) => mockScoreAndSave(...args),
}));

jest.mock('@/lib/ownership', () => ({
  assertCourseOwnership: (...args: unknown[]) => mockAssertCourseOwnership(...args),
  toOwnershipError: (...args: unknown[]) => mockToOwnershipError(...args),
}));

const quizSubmissionsTable = {
  insert: (...args: unknown[]) => mockInsert(...args),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
  maybeSingle: () => mockAttemptMaybeSingle(),
};

const subtopicsTable = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  maybeSingle: () => mockSubtopicsMaybeSingle(),
};

const subtopicCacheTable = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: () => mockCacheMaybeSingle(),
  update: (...args: unknown[]) => mockCacheUpdate(...args),
};

const apiLogsTable = {
  insert: (...args: unknown[]) => mockApiLogsInsert(...args),
};

jest.mock('@/lib/database', () => ({
  DatabaseService: {
    getRecords: (...args: unknown[]) => mockGetRecords(...args),
  },
  DatabaseError: class DatabaseError extends Error {
    constructor(message: string, public originalError?: unknown) {
      super(message);
      this.name = 'DatabaseError';
    }
  },
  adminDb: {
    from: (table: string) => {
      switch (table) {
        case 'subtopics':
          return subtopicsTable;
        case 'quiz_submissions':
          return quizSubmissionsTable;
        case 'subtopic_cache':
          return subtopicCacheTable;
        case 'api_logs':
          return apiLogsTable;
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    },
  },
}));

jest.mock('@/lib/api-logger', () => ({
  withApiLogging: (handler: unknown) => handler,
  logApiCall: jest.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/quiz/submit/route';

const mockUser = {
  id: TEST_STUDENT.id,
  email: TEST_STUDENT.email,
  name: TEST_STUDENT.name,
  role: TEST_STUDENT.role,
};

const mockCourse = {
  id: TEST_COURSE.id,
  title: TEST_COURSE.title,
};

const quizBlueprint = Array.from({ length: 5 }, (_, index) => ({
  question: `Question ${index + 1}?`,
  options: [
    `Option ${index + 1}A`,
    `Option ${index + 1}B`,
    `Option ${index + 1}C`,
    `Option ${index + 1}D`,
  ],
  correctIndex: 1,
}));

const mockQuizQuestions = quizBlueprint.map((item, index) => ({
  id: `quiz-q-00${index + 1}`,
  course_id: TEST_COURSE.id,
  question: item.question,
  options: item.options,
  correct_answer: item.options[item.correctIndex],
}));

const validAnswers = quizBlueprint.map((item, index) => ({
  question: item.question,
  options: item.options,
  userAnswer: item.options[item.correctIndex],
  isCorrect: true,
  questionIndex: index,
  reasoningNote: `Karena opsi ${index + 1} paling tepat`,
}));

const validBody = {
  userId: TEST_STUDENT.id,
  courseId: TEST_COURSE.id,
  subtopic: 'What is Software Testing?',
  moduleTitle: 'Software Testing Basics',
  subtopicTitle: 'What is Software Testing?',
  moduleIndex: 0,
  subtopicIndex: 0,
  score: 100,
  answers: validAnswers,
};

function createAuthenticatedRequest(body: Record<string, unknown>) {
  const token = generateJWT({
    userId: TEST_STUDENT.id,
    email: TEST_STUDENT.email,
    role: 'user',
  });

  return createMockNextRequest('POST', '/api/quiz/submit', {
    body,
    cookies: { access_token: token },
  });
}

describe('POST /api/quiz/submit', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockParseBody.mockImplementation((_schema: unknown, body: unknown) => ({
      success: true,
      data: body,
    }));
    mockVerifyToken.mockReturnValue({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });
    mockResolveUserByIdentifier.mockResolvedValue(mockUser);
    mockAssertCourseOwnership.mockResolvedValue(undefined);
    mockToOwnershipError.mockReturnValue(null);
    mockSubtopicsMaybeSingle.mockResolvedValue({
      data: { id: 'subtopic-001' },
      error: null,
    });
    mockAttemptMaybeSingle.mockResolvedValue({
      data: null,
      error: null,
    });
    mockCacheMaybeSingle.mockResolvedValue({
      data: {
        content: {
          quiz: quizBlueprint,
          completed_users: [],
        },
      },
      error: null,
    });
    mockInsert.mockResolvedValue({
      data: [{ id: 'submission-001' }, { id: 'submission-002' }, { id: 'submission-003' }, { id: 'submission-004' }, { id: 'submission-005' }],
      error: null,
    });
    mockScoreAndSave.mockResolvedValue(undefined);

    mockGetRecords.mockImplementation((table: string, options?: { filter?: Record<string, unknown> }) => {
      if (table === 'courses') {
        return Promise.resolve(
          options?.filter?.created_by === TEST_STUDENT.id ? [mockCourse] : [],
        );
      }

      if (table === 'quiz') {
        return Promise.resolve(mockQuizQuestions);
      }

      if (table === 'subtopics') {
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    });
  });

  it('saves a full five-question attempt and returns server evaluations', async () => {
    const response = await POST(createAuthenticatedRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.score).toBe(100);
    expect(data.correctCount).toBe(5);
    expect(data.totalQuestions).toBe(5);
    expect(data.questionEvaluations).toHaveLength(5);
    expect(data.matchingResults).toHaveLength(5);
    expect(data.details.totalAnswers).toBe(5);
    expect(data.details.successfulMatches).toBe(5);
    expect(data.details.failedMatches).toBe(0);
    expect(mockAssertCourseOwnership).toHaveBeenCalledWith(
      TEST_STUDENT.id,
      TEST_COURSE.id,
      'user',
    );

    const completionPayload = mockCacheUpdate.mock.calls[0][0];
    expect(completionPayload.content.completed_users).toContain(TEST_STUDENT.id);
    expect(completionPayload.content.last_quiz_attempt_id).toEqual(expect.any(String));
  });

  it('returns the validation response from parseBody when payload is invalid', async () => {
    mockParseBody.mockReturnValueOnce({
      success: false,
      response: NextResponse.json(
        { error: 'Quiz harus berisi tepat 5 jawaban' },
        { status: 400 },
      ),
    });

    const response = await POST(createAuthenticatedRequest({ ...validBody, answers: [] }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain('5 jawaban');
  });

  it('returns 404 when the authenticated user cannot be resolved', async () => {
    mockResolveUserByIdentifier.mockResolvedValueOnce(null);

    const response = await POST(createAuthenticatedRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe('Pengguna tidak ditemukan');
  });

  it('returns 404 when no quiz questions can be loaded for the active subtopic', async () => {
    mockGetRecords.mockImplementation((table: string, options?: { filter?: Record<string, unknown> }) => {
      if (table === 'courses') {
        return Promise.resolve(
          options?.filter?.created_by === TEST_STUDENT.id ? [mockCourse] : [],
        );
      }

      if (table === 'quiz') {
        return Promise.resolve([]);
      }

      return Promise.resolve([]);
    });
    mockCacheMaybeSingle.mockResolvedValueOnce({
      data: { content: { completed_users: [] } },
      error: null,
    });

    const response = await POST(createAuthenticatedRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Pertanyaan kuis tidak ditemukan');
  });

  it('rejects drifted quiz payloads when the answer count no longer matches the active quiz', async () => {
    const driftedBody = {
      ...validBody,
      answers: validAnswers.slice(0, 4),
      score: 80,
    };

    const response = await POST(createAuthenticatedRequest(driftedBody));
    const data = await response.json();

    expect(response.status).toBe(409);
    expect(data.code).toBe('QUIZ_QUESTIONS_DRIFTED');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  it('returns 500 when quiz submission insert fails', async () => {
    mockInsert.mockResolvedValueOnce({
      data: null,
      error: { message: 'Database write failed', code: '42501' },
    });

    const response = await POST(createAuthenticatedRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Gagal menyimpan percobaan kuis');
  });
});
