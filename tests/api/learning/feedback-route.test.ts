/**
 * API Tests for POST /api/feedback endpoint
 */

import { createMockNextRequest } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';
import { TEST_COURSE, TEST_SUBTOPIC } from '../../fixtures/courses.fixture';

jest.mock('@/lib/api-logger', () => ({
  withApiLogging: (handler: unknown) => handler,
}));

jest.mock('@/lib/auth-helper', () => ({
  resolveAuthUserId: jest.fn(),
}));

jest.mock('@/services/auth.service', () => ({
  resolveUserByIdentifier: jest.fn(),
}));

jest.mock('@/lib/database', () => ({
  DatabaseService: {
    getRecords: jest.fn(),
    insertRecord: jest.fn(),
  },
}));

jest.mock('@/lib/schemas', () => ({
  FeedbackSchema: {},
  parseBody: jest.fn(),
}));

import { POST } from '@/app/api/feedback/route';
import { resolveAuthUserId } from '@/lib/auth-helper';
import { resolveUserByIdentifier } from '@/services/auth.service';
import { DatabaseService } from '@/lib/database';
import { parseBody } from '@/lib/schemas';

const mockResolveAuthUserId = resolveAuthUserId as jest.MockedFunction<typeof resolveAuthUserId>;
const mockResolveUser = resolveUserByIdentifier as jest.MockedFunction<typeof resolveUserByIdentifier>;
const mockGetRecords = DatabaseService.getRecords as jest.MockedFunction<typeof DatabaseService.getRecords>;
const mockInsertRecord = DatabaseService.insertRecord as jest.MockedFunction<typeof DatabaseService.insertRecord>;
const mockParseBody = parseBody as jest.MockedFunction<typeof parseBody>;

describe('POST /api/feedback', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockResolveAuthUserId.mockReturnValue(TEST_STUDENT.id);
  });

  it('saves feedback when the course is owned and the subtopic belongs to that course', async () => {
    const body = {
      userId: TEST_STUDENT.id,
      courseId: TEST_COURSE.id,
      subtopicId: TEST_SUBTOPIC.id,
      subtopic: TEST_SUBTOPIC.title,
      moduleIndex: 0,
      subtopicIndex: 1,
      rating: 5,
      comment: 'Materinya jelas dan membantu.',
    };

    mockParseBody.mockReturnValue({ success: true, data: body } as never);
    mockResolveUser.mockResolvedValue({ id: TEST_STUDENT.id, email: TEST_STUDENT.email });
    mockGetRecords
      .mockResolvedValueOnce([{ id: TEST_COURSE.id, title: TEST_COURSE.title }] as never)
      .mockResolvedValueOnce([{ id: TEST_SUBTOPIC.id, title: TEST_SUBTOPIC.title }] as never);
    mockInsertRecord.mockResolvedValue({ id: 'feedback-001' } as never);

    const request = createMockNextRequest('POST', '/api/feedback', { body });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockGetRecords).toHaveBeenNthCalledWith(1, 'courses', {
      filter: { id: TEST_COURSE.id, created_by: TEST_STUDENT.id },
      limit: 1,
    });
    expect(mockGetRecords).toHaveBeenNthCalledWith(2, 'subtopics', {
      filter: { id: TEST_SUBTOPIC.id, course_id: TEST_COURSE.id },
      limit: 1,
    });
    expect(mockInsertRecord).toHaveBeenCalledWith('feedback', expect.objectContaining({
      user_id: TEST_STUDENT.id,
      course_id: TEST_COURSE.id,
      subtopic_id: TEST_SUBTOPIC.id,
      subtopic_label: TEST_SUBTOPIC.title,
      rating: 5,
      comment: 'Materinya jelas dan membantu.',
    }));
  });

  it('returns 403 when the course is not owned by the authenticated user', async () => {
    const body = {
      userId: TEST_STUDENT.id,
      courseId: TEST_COURSE.id,
      rating: 4,
      comment: 'Komentar.',
    };

    mockParseBody.mockReturnValue({ success: true, data: body } as never);
    mockResolveUser.mockResolvedValue({ id: TEST_STUDENT.id, email: TEST_STUDENT.email });
    mockGetRecords.mockResolvedValueOnce([] as never);

    const request = createMockNextRequest('POST', '/api/feedback', { body });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe('Course not found or access denied');
    expect(mockInsertRecord).not.toHaveBeenCalled();
  });

  it('returns 400 when the subtopic does not belong to the supplied course', async () => {
    const body = {
      userId: TEST_STUDENT.id,
      courseId: TEST_COURSE.id,
      subtopicId: TEST_SUBTOPIC.id,
      subtopic: TEST_SUBTOPIC.title,
      rating: 4,
      comment: 'Komentar.',
    };

    mockParseBody.mockReturnValue({ success: true, data: body } as never);
    mockResolveUser.mockResolvedValue({ id: TEST_STUDENT.id, email: TEST_STUDENT.email });
    mockGetRecords
      .mockResolvedValueOnce([{ id: TEST_COURSE.id, title: TEST_COURSE.title }] as never)
      .mockResolvedValueOnce([] as never);

    const request = createMockNextRequest('POST', '/api/feedback', { body });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Subtopic not found in this course');
    expect(mockInsertRecord).not.toHaveBeenCalled();
  });
});
