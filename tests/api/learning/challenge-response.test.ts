import { createMockNextRequest, generateJWT } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';
import { TEST_COURSE } from '../../fixtures/courses.fixture';

const mockChallengeInsert = jest.fn();
const mockApiLogInsert = jest.fn();

const challengeQuery = {
  insert: (...args: unknown[]) => mockChallengeInsert(...args),
  select: jest.fn().mockReturnThis(),
  eq: jest.fn().mockReturnThis(),
  order: jest.fn().mockReturnThis(),
  limit: jest.fn().mockReturnThis(),
};

const apiLogQuery = {
  insert: (...args: unknown[]) => mockApiLogInsert(...args),
};

const mockFrom = jest.fn((tableName: string) => {
  if (tableName === 'challenge_responses') {
    return challengeQuery;
  }

  if (tableName === 'api_logs') {
    return apiLogQuery;
  }

  throw new Error(`Unexpected table: ${tableName}`);
});

jest.mock('next/server', () => {
  const actual = jest.requireActual('next/server');
  return {
    ...actual,
    after: (callback: () => unknown) => callback(),
  };
});

jest.mock('@/lib/database', () => ({
  adminDb: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
  DatabaseError: class DatabaseError extends Error {
    constructor(message: string, public originalError?: unknown) {
      super(message);
      this.name = 'DatabaseError';
    }
  },
}));

const mockVerifyToken = jest.fn();
jest.mock('@/lib/jwt', () => ({
  verifyToken: (...args: unknown[]) => mockVerifyToken(...args),
}));

const mockParseBody = jest.fn();
jest.mock('@/lib/schemas', () => ({
  ChallengeResponseSchema: {},
  parseBody: (...args: unknown[]) => mockParseBody(...args),
}));

jest.mock('@/lib/api-logger', () => ({
  withApiLogging: (handler: unknown) => handler,
}));

jest.mock('@/lib/api-middleware', () => ({
  withProtection: (handler: unknown) => handler,
}));

const mockScoreAndSave = jest.fn();
jest.mock('@/services/cognitive-scoring.service', () => ({
  scoreAndSave: (...args: unknown[]) => mockScoreAndSave(...args),
}));

import { POST } from '@/app/api/challenge-response/route';

const validBody = {
  userId: TEST_STUDENT.id,
  courseId: TEST_COURSE.id,
  moduleIndex: 1,
  subtopicIndex: 2,
  pageNumber: 3,
  question: 'Apa langkah konkret yang Anda ambil?',
  answer: 'Saya akan menenangkan audiens dan menyelaraskan rundown.',
  feedback: 'Jawaban sudah relevan dan kontekstual.',
  reasoningNote: 'Saya memilih ini agar transisi tetap tertib.',
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('POST /api/challenge-response', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockParseBody.mockImplementation((_schema: unknown, body: typeof validBody) => ({
      success: true,
      data: body,
    }));

    mockVerifyToken.mockReturnValue({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });

    mockChallengeInsert.mockResolvedValue({ data: { id: 'saved-id' }, error: null });
    mockApiLogInsert.mockResolvedValue({ data: null, error: null });
    mockScoreAndSave.mockResolvedValue(undefined);
  });

  it('persists a challenge response with a UUID primary key', async () => {
    const token = generateJWT({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });

    const request = createMockNextRequest('POST', '/api/challenge-response', {
      body: validBody,
      cookies: { access_token: token },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.challengeId).toMatch(UUID_REGEX);
    expect(mockFrom).toHaveBeenCalledWith('challenge_responses');

    const insertedRow = mockChallengeInsert.mock.calls[0][0];
    expect(insertedRow.id).toMatch(UUID_REGEX);
    expect(insertedRow.id).not.toContain(TEST_COURSE.id);
    expect(insertedRow.user_id).toBe(TEST_STUDENT.id);
    expect(insertedRow.course_id).toBe(TEST_COURSE.id);
    expect(insertedRow.reasoning_note).toBe(validBody.reasoningNote);
  });

  it('logs DB insert details to api_logs when persistence fails', async () => {
    const token = generateJWT({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });

    mockChallengeInsert.mockResolvedValue({
      data: null,
      error: { message: 'invalid input syntax for type uuid: "broken-id"' },
    });

    const request = createMockNextRequest('POST', '/api/challenge-response', {
      body: validBody,
      cookies: { access_token: token },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Gagal menyimpan respons tantangan');
    expect(mockApiLogInsert).toHaveBeenCalled();

    const logRow = mockApiLogInsert.mock.calls[0][0];
    expect(logRow.path).toBe('/api/challenge-response');
    expect(logRow.label).toBe('challenge-response-db-error');
    expect(logRow.error_message).toContain('invalid input syntax for type uuid');
    expect(logRow.metadata.course_id).toBe(TEST_COURSE.id);
    expect(logRow.metadata.page_number).toBe(validBody.pageNumber);
  });
});
