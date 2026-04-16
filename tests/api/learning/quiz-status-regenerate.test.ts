import { createMockNextRequest, generateJWT } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';
import { TEST_COURSE } from '../../fixtures/courses.fixture';

const mockResolveUserByIdentifier = jest.fn();
const mockAssertCourseOwnership = jest.fn();
const mockToOwnershipError = jest.fn();
const mockChatCompletion = jest.fn();
const mockAppendNewQuizQuestions = jest.fn();
const mockBuildSubtopicCacheKey = jest.fn();
const mockApiRateAllowed = jest.fn();
const mockAiRateAllowed = jest.fn();
const mockSubtopicsMaybeSingle = jest.fn();
const mockQuizSubmissionsOrder = jest.fn();
const mockCacheMaybeSingle = jest.fn();
const mockCacheUpdate = jest.fn().mockResolvedValue({ data: null, error: null });
const mockRpc = jest.fn();

const subtopicsQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  ilike: jest.fn().mockReturnThis(),
  maybeSingle: () => mockSubtopicsMaybeSingle(),
};

const quizSubmissionsQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: (...args: unknown[]) => mockQuizSubmissionsOrder(...args),
};

const subtopicCacheQuery = {
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  maybeSingle: () => mockCacheMaybeSingle(),
  update: (...args: unknown[]) => mockCacheUpdate(...args),
};

jest.mock('@/services/auth.service', () => ({
  resolveUserByIdentifier: (...args: unknown[]) => mockResolveUserByIdentifier(...args),
}));

jest.mock('@/lib/ownership', () => ({
  assertCourseOwnership: (...args: unknown[]) => mockAssertCourseOwnership(...args),
  toOwnershipError: (...args: unknown[]) => mockToOwnershipError(...args),
}));

jest.mock('@/lib/rate-limit', () => ({
  apiRateLimiter: {
    isAllowed: (...args: unknown[]) => mockApiRateAllowed(...args),
  },
  aiRateLimiter: {
    isAllowed: (...args: unknown[]) => mockAiRateAllowed(...args),
  },
}));

jest.mock('@/services/ai.service', () => ({
  chatCompletion: (...args: unknown[]) => mockChatCompletion(...args),
}));

jest.mock('@/lib/quiz-sync', () => ({
  appendNewQuizQuestions: (...args: unknown[]) => mockAppendNewQuizQuestions(...args),
  buildSubtopicCacheKey: (...args: unknown[]) => mockBuildSubtopicCacheKey(...args),
}));

jest.mock('@/lib/database', () => ({
  adminDb: {
    rpc: (...args: unknown[]) => mockRpc(...args),
    from: (table: string) => {
      switch (table) {
        case 'subtopics':
          return subtopicsQuery;
        case 'quiz_submissions':
          return quizSubmissionsQuery;
        case 'subtopic_cache':
          return subtopicCacheQuery;
        default:
          throw new Error(`Unexpected table: ${table}`);
      }
    },
  },
}));

jest.mock('@/lib/api-logger', () => ({
  withApiLogging: (handler: unknown) => handler,
}));

import { GET as getQuizStatus } from '@/app/api/quiz/status/route';
import { POST as postQuizRegenerate } from '@/app/api/quiz/regenerate/route';

const mockUser = {
  id: TEST_STUDENT.id,
  email: TEST_STUDENT.email,
  name: TEST_STUDENT.name,
  role: TEST_STUDENT.role,
};

const quizRows = [
  {
    attempt_number: 2,
    quiz_attempt_id: 'attempt-2',
    is_correct: true,
    created_at: '2025-01-02T10:00:00.000Z',
  },
  {
    attempt_number: 2,
    quiz_attempt_id: 'attempt-2',
    is_correct: false,
    created_at: '2025-01-02T10:01:00.000Z',
  },
  {
    attempt_number: 1,
    quiz_attempt_id: 'attempt-1',
    is_correct: true,
    created_at: '2025-01-01T10:00:00.000Z',
  },
];

const regeneratedQuiz = Array.from({ length: 5 }, (_, index) => ({
  question: `Fresh question ${index + 1}`,
  options: [`A${index + 1}`, `B${index + 1}`, `C${index + 1}`, `D${index + 1}`],
  correctIndex: index % 4,
}));

describe('Quiz status and regenerate routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockResolveUserByIdentifier.mockResolvedValue(mockUser);
    mockAssertCourseOwnership.mockResolvedValue(undefined);
    mockToOwnershipError.mockReturnValue(null);
    mockApiRateAllowed.mockResolvedValue(true);
    mockAiRateAllowed.mockResolvedValue(true);
    mockBuildSubtopicCacheKey.mockReturnValue('course-1::testing-basics::unit-testing');
    mockSubtopicsMaybeSingle.mockResolvedValue({
      data: { id: 'subtopic-001' },
      error: null,
    });
    mockRpc.mockImplementation((fnName: string) => {
      if (fnName === 'ensure_leaf_subtopic') {
        return Promise.resolve({ data: 'leaf-subtopic-001', error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
    mockQuizSubmissionsOrder.mockResolvedValue({
      data: quizRows,
      error: null,
    });
    mockCacheMaybeSingle.mockResolvedValue({
      data: {
        content: {
          pages: [{ title: 'Intro', paragraphs: ['Hello world'] }],
          keyTakeaways: ['Keep practice lightweight'],
        },
      },
      error: null,
    });
    mockCacheUpdate.mockResolvedValue({ data: null, error: null });
    mockChatCompletion.mockResolvedValue({
      choices: [
        {
          message: {
            content: JSON.stringify({ quiz: regeneratedQuiz }),
          },
        },
      ],
    });
    mockAppendNewQuizQuestions.mockResolvedValue({
      insertedCount: 5,
    });
  });

  it('returns the latest grouped quiz attempt summary', async () => {
    const token = generateJWT({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });

    const request = createMockNextRequest(
      'GET',
      `/api/quiz/status?courseId=${TEST_COURSE.id}&moduleTitle=Testing%20Basics&subtopicTitle=Unit%20Testing`,
      {
        cookies: { access_token: token },
      },
    );

    const response = await getQuizStatus(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.completed).toBe(true);
    expect(data.attemptCount).toBe(2);
    expect(data.latest.attemptNumber).toBe(2);
    expect(data.latest.quizAttemptId).toBe('attempt-2');
    expect(data.latest.score).toBe(50);
    expect(data.latest.correctCount).toBe(1);
    expect(data.latest.totalQuestions).toBe(2);
    expect(data.latest.submittedAt).toBe('2025-01-02T10:01:00.000Z');
    expect(mockResolveUserByIdentifier).toHaveBeenCalledWith(TEST_STUDENT.id);
  });

  it('falls back to the broader submission query when subtopic_label filtering fails', async () => {
    const token = generateJWT({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });

    mockQuizSubmissionsOrder
      .mockResolvedValueOnce({
        data: null,
        error: { message: 'column subtopic_label does not exist' },
      })
      .mockResolvedValueOnce({
        data: quizRows,
        error: null,
      });
    mockRpc.mockResolvedValueOnce({ data: null, error: null });

    const request = createMockNextRequest(
      'GET',
      `/api/quiz/status?courseId=${TEST_COURSE.id}&moduleTitle=Testing%20Basics&subtopicTitle=Unit%20Testing`,
      {
        cookies: { access_token: token },
      },
    );

    const response = await getQuizStatus(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.completed).toBe(true);
    expect(data.attemptCount).toBe(2);
    expect(mockQuizSubmissionsOrder).toHaveBeenCalledTimes(2);
    expect(mockResolveUserByIdentifier).toHaveBeenCalledWith(TEST_STUDENT.id);
  });

  it('regenerates five fresh quiz questions and updates the cache payload', async () => {
    const token = generateJWT({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });

    const request = createMockNextRequest('POST', '/api/quiz/regenerate', {
      body: {
        courseId: TEST_COURSE.id,
        moduleTitle: 'Testing Basics',
        subtopicTitle: 'Unit Testing',
      },
      cookies: { access_token: token },
    });

    const response = await postQuizRegenerate(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.quiz).toHaveLength(5);
    expect(mockAssertCourseOwnership).toHaveBeenCalledWith(
      TEST_STUDENT.id,
      TEST_COURSE.id,
      TEST_STUDENT.role,
    );
    expect(mockAppendNewQuizQuestions).toHaveBeenCalledWith(
      expect.objectContaining({
        courseId: TEST_COURSE.id,
        moduleTitle: 'Testing Basics',
        subtopicTitle: 'Unit Testing',
      }),
    );
    expect(mockBuildSubtopicCacheKey).toHaveBeenCalledWith(
      TEST_COURSE.id,
      'Testing Basics',
      'Unit Testing',
    );
    expect(mockCacheUpdate).toHaveBeenCalled();

    const updatePayload = mockCacheUpdate.mock.calls[0][0];
    expect(updatePayload.content.quiz).toHaveLength(5);
    expect(updatePayload.content.quiz_regenerated_at).toEqual(expect.any(String));
  });

  it('returns 404 when the subtopic cache row is missing', async () => {
    const token = generateJWT({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });

    mockCacheMaybeSingle.mockResolvedValueOnce({ data: null, error: null });

    const request = createMockNextRequest('POST', '/api/quiz/regenerate', {
      body: {
        courseId: TEST_COURSE.id,
        moduleTitle: 'Testing Basics',
        subtopicTitle: 'Unit Testing',
      },
      cookies: { access_token: token },
    });

    const response = await postQuizRegenerate(request);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toContain('Konten subtopik tidak ditemukan');
    expect(mockChatCompletion).not.toHaveBeenCalled();
    expect(mockAppendNewQuizQuestions).not.toHaveBeenCalled();
  });
});
