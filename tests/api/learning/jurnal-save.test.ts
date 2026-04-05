/**
 * API Tests for POST /api/jurnal/save endpoint
 *
 * Tests:
 * - Successful journal save (free text)
 * - Successful structured reflection save
 * - Validation errors (missing userId, courseId, content)
 * - User not found (404)
 * - Course not found (404)
 * - Database insert error (500)
 */

import { createMockNextRequest } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';
import { TEST_COURSE } from '../../fixtures/courses.fixture';

// ── Mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/api-logger', () => ({
    withApiLogging: (handler: any) => handler,
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
    JurnalSchema: {},
    parseBody: jest.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────

import { POST } from '@/app/api/jurnal/save/route';
import { resolveUserByIdentifier } from '@/services/auth.service';
import { DatabaseService } from '@/lib/database';
import { parseBody } from '@/lib/schemas';

const mockResolveUser = resolveUserByIdentifier as jest.MockedFunction<typeof resolveUserByIdentifier>;
const mockGetRecords = DatabaseService.getRecords as jest.MockedFunction<typeof DatabaseService.getRecords>;
const mockInsertRecord = DatabaseService.insertRecord as jest.MockedFunction<typeof DatabaseService.insertRecord>;
const mockParseBody = parseBody as jest.MockedFunction<typeof parseBody>;

// ── Test suite ─────────────────────────────────────────────────────────

describe('POST /api/jurnal/save', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Successful journal save (free text)', () => {
        it('should save a free-text journal entry and return success', async () => {
            const body = {
                userId: TEST_STUDENT.id,
                courseId: TEST_COURSE.id,
                content: 'Today I learned about software testing fundamentals.',
            };

            // parseBody returns validated data
            mockParseBody.mockReturnValue({
                success: true,
                data: body,
            } as any);

            // User found
            mockResolveUser.mockResolvedValue({ id: TEST_STUDENT.id, email: TEST_STUDENT.email } as any);

            // Course found
            mockGetRecords.mockResolvedValue([{ id: TEST_COURSE.id, title: TEST_COURSE.title }] as any);

            // Insert succeeds
            mockInsertRecord.mockResolvedValue({ id: 'jurnal-001' } as any);

            const request = createMockNextRequest('POST', '/api/jurnal/save', { body });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.id).toBe('jurnal-001');

            // Verify resolveUserByIdentifier was called with the userId
            expect(mockResolveUser).toHaveBeenCalledWith(TEST_STUDENT.id);

            // Verify course lookup
            expect(mockGetRecords).toHaveBeenCalledWith('courses', {
                filter: { id: TEST_COURSE.id },
                limit: 1,
            });

            // Verify insert was called with correct data
            expect(mockInsertRecord).toHaveBeenCalledWith('jurnal', expect.objectContaining({
                user_id: TEST_STUDENT.id,
                course_id: TEST_COURSE.id,
                content: 'Today I learned about software testing fundamentals.',
                type: 'free_text',
            }));
        });

        it('should default type to free_text when not provided', async () => {
            const body = {
                userId: TEST_STUDENT.id,
                courseId: TEST_COURSE.id,
                content: 'Learning notes for today.',
            };

            mockParseBody.mockReturnValue({ success: true, data: body } as any);
            mockResolveUser.mockResolvedValue({ id: TEST_STUDENT.id, email: TEST_STUDENT.email } as any);
            mockGetRecords.mockResolvedValue([{ id: TEST_COURSE.id }] as any);
            mockInsertRecord.mockResolvedValue({ id: 'jurnal-002' } as any);

            const request = createMockNextRequest('POST', '/api/jurnal/save', { body });
            const response = await POST(request);

            expect(response.status).toBe(200);

            const insertCall = mockInsertRecord.mock.calls[0];
            expect((insertCall[1] as any).type).toBe('free_text');
        });
    });

    describe('Successful structured reflection save', () => {
        it('should save a structured reflection with all fields', async () => {
            const body = {
                userId: TEST_STUDENT.id,
                courseId: TEST_COURSE.id,
                content: {
                    understood: 'I understood the basics of unit testing.',
                    confused: 'Integration testing is still unclear.',
                    strategy: 'Practice more with real projects.',
                    promptEvolution: 'My questions became more specific.',
                    contentRating: 4,
                    contentFeedback: 'Good content overall.',
                },
                subtopic: 'Unit Testing Basics',
                moduleIndex: 0,
                subtopicIndex: 1,
                type: 'structured_reflection',
            };

            mockParseBody.mockReturnValue({ success: true, data: body } as any);
            mockResolveUser.mockResolvedValue({ id: TEST_STUDENT.id, email: TEST_STUDENT.email } as any);
            mockGetRecords.mockResolvedValue([{ id: TEST_COURSE.id }] as any);
            mockInsertRecord.mockResolvedValue({ id: 'jurnal-003' } as any);

            const request = createMockNextRequest('POST', '/api/jurnal/save', { body });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.id).toBe('jurnal-003');

            // Verify the content was serialized as JSON for structured reflection
            const insertCall = mockInsertRecord.mock.calls[0];
            const insertData = insertCall[1] as any;
            expect(insertData.type).toBe('structured_reflection');

            // Content should be a JSON string for structured reflections
            const parsedContent = JSON.parse(insertData.content);
            expect(parsedContent.understood).toBe('I understood the basics of unit testing.');
            expect(parsedContent.confused).toBe('Integration testing is still unclear.');
            expect(parsedContent.strategy).toBe('Practice more with real projects.');
            expect(parsedContent.contentRating).toBe(4);
        });

        it('should include subtopic and index metadata in the reflection field', async () => {
            const body = {
                userId: TEST_STUDENT.id,
                courseId: TEST_COURSE.id,
                content: {
                    understood: 'Clear explanation.',
                    confused: '',
                    strategy: 'Review notes.',
                },
                subtopic: 'Testing Strategies',
                moduleIndex: 2,
                subtopicIndex: 3,
                type: 'structured_reflection',
            };

            mockParseBody.mockReturnValue({ success: true, data: body } as any);
            mockResolveUser.mockResolvedValue({ id: TEST_STUDENT.id, email: TEST_STUDENT.email } as any);
            mockGetRecords.mockResolvedValue([{ id: TEST_COURSE.id }] as any);
            mockInsertRecord.mockResolvedValue({ id: 'jurnal-004' } as any);

            const request = createMockNextRequest('POST', '/api/jurnal/save', { body });
            const response = await POST(request);

            expect(response.status).toBe(200);

            const insertData = (mockInsertRecord.mock.calls[0] as any)[1];
            const reflection = JSON.parse(insertData.reflection);
            expect(reflection.subtopic).toBe('Testing Strategies');
            expect(reflection.moduleIndex).toBe(2);
            expect(reflection.subtopicIndex).toBe(3);
            expect(reflection.fields).toBeDefined();
            expect(reflection.fields.understood).toBe('Clear explanation.');
        });
    });

    describe('Validation errors', () => {
        it('should return 400 when userId is missing', async () => {
            const body = {
                courseId: TEST_COURSE.id,
                content: 'Some content',
            };

            mockParseBody.mockReturnValue({
                success: false,
                response: new Response(JSON.stringify({ error: 'userId is required' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }),
            } as any);

            const request = createMockNextRequest('POST', '/api/jurnal/save', { body });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });

        it('should return 400 when courseId is missing', async () => {
            const body = {
                userId: TEST_STUDENT.id,
                content: 'Some content',
            };

            mockParseBody.mockReturnValue({
                success: false,
                response: new Response(JSON.stringify({ error: 'courseId is required' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }),
            } as any);

            const request = createMockNextRequest('POST', '/api/jurnal/save', { body });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });

        it('should return 400 when content is missing', async () => {
            const body = {
                userId: TEST_STUDENT.id,
                courseId: TEST_COURSE.id,
            };

            mockParseBody.mockReturnValue({
                success: false,
                response: new Response(JSON.stringify({ error: 'Invalid request body' }), {
                    status: 400,
                    headers: { 'Content-Type': 'application/json' },
                }),
            } as any);

            const request = createMockNextRequest('POST', '/api/jurnal/save', { body });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });
    });

    describe('User not found', () => {
        it('should return 404 when user does not exist', async () => {
            const body = {
                userId: 'nonexistent-user-id',
                courseId: TEST_COURSE.id,
                content: 'Some content',
            };

            mockParseBody.mockReturnValue({ success: true, data: body } as any);
            mockResolveUser.mockResolvedValue(null as any);

            const request = createMockNextRequest('POST', '/api/jurnal/save', { body });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('User not found');
            expect(mockGetRecords).not.toHaveBeenCalled();
            expect(mockInsertRecord).not.toHaveBeenCalled();
        });
    });

    describe('Course not found', () => {
        it('should return 404 when course does not exist', async () => {
            const body = {
                userId: TEST_STUDENT.id,
                courseId: 'nonexistent-course-id',
                content: 'Some content',
            };

            mockParseBody.mockReturnValue({ success: true, data: body } as any);
            mockResolveUser.mockResolvedValue({ id: TEST_STUDENT.id, email: TEST_STUDENT.email } as any);
            mockGetRecords.mockResolvedValue([] as any);

            const request = createMockNextRequest('POST', '/api/jurnal/save', { body });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Course not found');
            expect(mockInsertRecord).not.toHaveBeenCalled();
        });
    });

    describe('Database insert error', () => {
        it('should return 500 when database insert fails', async () => {
            const body = {
                userId: TEST_STUDENT.id,
                courseId: TEST_COURSE.id,
                content: 'Some journal content',
            };

            mockParseBody.mockReturnValue({ success: true, data: body } as any);
            mockResolveUser.mockResolvedValue({ id: TEST_STUDENT.id, email: TEST_STUDENT.email } as any);
            mockGetRecords.mockResolvedValue([{ id: TEST_COURSE.id }] as any);
            mockInsertRecord.mockRejectedValue(new Error('Database connection failed'));

            const request = createMockNextRequest('POST', '/api/jurnal/save', { body });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toBe('Failed to save jurnal refleksi');
        });

        it('should return 500 when an unexpected error occurs', async () => {
            const body = {
                userId: TEST_STUDENT.id,
                courseId: TEST_COURSE.id,
                content: 'Some content',
            };

            mockParseBody.mockReturnValue({ success: true, data: body } as any);
            mockResolveUser.mockRejectedValue(new Error('Unexpected service failure'));

            const request = createMockNextRequest('POST', '/api/jurnal/save', { body });
            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toBe('Failed to save jurnal refleksi');
        });
    });
});
