import { createMockNextRequest, generateJWT } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';
import { TEST_COURSE, TEST_SUBTOPIC } from '../../fixtures/courses.fixture';

const mockResolveAuthContext = jest.fn();
const mockAssertCourseOwnership = jest.fn();
const mockToOwnershipError = jest.fn();
const mockGetRecords = jest.fn();
const mockUpdateRecord = jest.fn();
const mockInsertRecord = jest.fn();

jest.mock('@/lib/auth-helper', () => ({
  resolveAuthContext: (...args: unknown[]) => mockResolveAuthContext(...args),
}));

jest.mock('@/lib/ownership', () => ({
  assertCourseOwnership: (...args: unknown[]) => mockAssertCourseOwnership(...args),
  toOwnershipError: (...args: unknown[]) => mockToOwnershipError(...args),
}));

jest.mock('@/lib/database', () => ({
  DatabaseService: {
    getRecords: (...args: unknown[]) => mockGetRecords(...args),
    updateRecord: (...args: unknown[]) => mockUpdateRecord(...args),
    insertRecord: (...args: unknown[]) => mockInsertRecord(...args),
  },
}));

import { GET, POST } from '@/app/api/user-progress/route';

describe('user-progress route ownership checks', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockResolveAuthContext.mockReturnValue({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });
    mockAssertCourseOwnership.mockResolvedValue(undefined);
    mockToOwnershipError.mockImplementation((err: unknown) => {
      if (err && typeof err === 'object' && 'status' in err) return err as never;
      return null;
    });
    mockGetRecords.mockImplementation((table: string) => {
      if (table === 'subtopics') {
        return Promise.resolve([{ id: TEST_SUBTOPIC.id }]);
      }
      if (table === 'user_progress') {
        return Promise.resolve([]);
      }
      return Promise.resolve([]);
    });
    mockUpdateRecord.mockResolvedValue({ data: null, error: null });
    mockInsertRecord.mockResolvedValue({ data: null, error: null });
  });

  it('rejects writes when the authenticated user does not own the course', async () => {
    mockAssertCourseOwnership.mockRejectedValueOnce({
      message: 'Course not found or access denied',
      status: 403,
    });

    const token = generateJWT({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });

    const request = createMockNextRequest('POST', '/api/user-progress', {
      body: {
        courseId: TEST_COURSE.id,
        subtopicId: TEST_SUBTOPIC.id,
        isCompleted: true,
        moduleIndex: 0,
        subtopicIndex: 0,
      },
      cookies: { access_token: token },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Course not found or access denied');
    expect(mockGetRecords).not.toHaveBeenCalledWith('subtopics', expect.anything());
    expect(mockInsertRecord).not.toHaveBeenCalled();
    expect(mockUpdateRecord).not.toHaveBeenCalled();
  });

  it('rejects writes when the subtopic does not belong to the supplied course', async () => {
    mockGetRecords.mockImplementation((table: string, options?: { filter?: Record<string, unknown> }) => {
      if (table === 'subtopics') {
        if (options?.filter?.course_id === TEST_COURSE.id && options?.filter?.id === TEST_SUBTOPIC.id) {
          return Promise.resolve([]);
        }
        return Promise.resolve([{ id: TEST_SUBTOPIC.id }]);
      }
      return Promise.resolve([]);
    });

    const token = generateJWT({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });

    const request = createMockNextRequest('POST', '/api/user-progress', {
      body: {
        courseId: TEST_COURSE.id,
        subtopicId: TEST_SUBTOPIC.id,
        isCompleted: true,
      },
      cookies: { access_token: token },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Subtopic not found in this course');
    expect(mockInsertRecord).not.toHaveBeenCalled();
    expect(mockUpdateRecord).not.toHaveBeenCalled();
  });

  it('allows an owner to save progress and keeps legacy payload fields ignored', async () => {
    const token = generateJWT({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });

    const request = createMockNextRequest('POST', '/api/user-progress', {
      body: {
        courseId: TEST_COURSE.id,
        subtopicId: TEST_SUBTOPIC.id,
        isCompleted: true,
        moduleIndex: 99,
        subtopicIndex: 77,
        status: 'complete',
        timeSpent: 1234,
      },
      cookies: { access_token: token },
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockAssertCourseOwnership).toHaveBeenCalledWith(
      TEST_STUDENT.id,
      TEST_COURSE.id,
      'user',
    );
    expect(mockGetRecords).toHaveBeenCalledWith('subtopics', {
      filter: {
        id: TEST_SUBTOPIC.id,
        course_id: TEST_COURSE.id,
      },
      limit: 1,
    });
    expect(mockInsertRecord).toHaveBeenCalledWith('user_progress', expect.objectContaining({
      user_id: TEST_STUDENT.id,
      course_id: TEST_COURSE.id,
      subtopic_id: TEST_SUBTOPIC.id,
      is_completed: true,
      completed_at: expect.any(String),
      created_at: expect.any(String),
      updated_at: expect.any(String),
    }));
  });

  it('applies course ownership checks on GET when courseId is provided', async () => {
    const token = generateJWT({
      userId: TEST_STUDENT.id,
      email: TEST_STUDENT.email,
      role: 'user',
    });

    const request = createMockNextRequest(
      'GET',
      `/api/user-progress?courseId=${TEST_COURSE.id}`,
      {
        cookies: { access_token: token },
      },
    );

    const response = await GET(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockAssertCourseOwnership).toHaveBeenCalledWith(
      TEST_STUDENT.id,
      TEST_COURSE.id,
      'user',
    );
  });
});
