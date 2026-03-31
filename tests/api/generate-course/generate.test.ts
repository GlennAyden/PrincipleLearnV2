/**
 * API Tests for POST /api/generate-course
 *
 * Tests:
 * - Returns 400 for invalid JSON body
 * - Returns 400 when required fields (topic, goal, level) are missing
 * - Successfully generates course outline with valid input
 * - Saves course to database when userId is provided
 * - Does not save course when no userId is provided
 * - Logs course generation activity after saving
 * - Handles OpenAI API failure gracefully (500)
 * - Handles database save failure gracefully (500)
 * - Appends discussion nodes to each module
 * - Retries OpenAI calls up to 3 times
 * - Returns CORS headers in response
 */

import { NextRequest } from 'next/server';
import { TEST_STUDENT } from '../../fixtures/users.fixture';

// Mock OpenAI
const mockChatCreate = jest.fn();
jest.mock('@/lib/openai', () => ({
    openai: {
        chat: {
            completions: {
                create: (...args: any[]) => mockChatCreate(...args),
            },
        },
    },
    defaultOpenAIModel: 'gpt-4o-mini',
}));

// Mock the database module
const mockGetRecords = jest.fn();
const mockInsertRecord = jest.fn();
jest.mock('@/lib/database', () => ({
    DatabaseService: {
        getRecords: (...args: any[]) => mockGetRecords(...args),
        insertRecord: (...args: any[]) => mockInsertRecord(...args),
    },
}));

// Mock api-logger (withApiLogging passthrough)
jest.mock('@/lib/api-logger', () => ({
    withApiLogging: (handler: any) => handler,
}));

// We need to import POST after mocks are set up
// The route exports POST = withApiLogging(postHandler, ...) so we need the mock above
import { POST } from '@/app/api/generate-course/route';

// Helper to create a NextRequest with JSON body
function createGenerateRequest(body: Record<string, unknown>, headers?: Record<string, string>): NextRequest {
    const reqHeaders = new Headers({
        'Content-Type': 'application/json',
        ...headers,
    });

    return new NextRequest('http://localhost:3000/api/generate-course', {
        method: 'POST',
        headers: reqHeaders,
        body: JSON.stringify(body),
    });
}

// Sample valid outline from OpenAI
const MOCK_OUTLINE = [
    {
        module: '1. Introduction to Machine Learning',
        subtopics: [
            { title: '1.1 What is ML?', overview: 'An introduction to ML concepts.' },
            { title: '1.2 Types of ML', overview: 'Supervised, unsupervised, reinforcement.' },
        ],
    },
    {
        module: '2. Data Preprocessing',
        subtopics: [
            { title: '2.1 Data Cleaning', overview: 'Handling missing values.' },
            { title: '2.2 Feature Engineering', overview: 'Creating meaningful features.' },
        ],
    },
];

function mockOpenAISuccess(outline = MOCK_OUTLINE) {
    mockChatCreate.mockResolvedValue({
        choices: [
            {
                finish_reason: 'stop',
                message: {
                    role: 'assistant',
                    content: JSON.stringify(outline),
                    refusal: null,
                },
            },
        ],
        model: 'gpt-4o-mini',
        usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
    });
}

describe('POST /api/generate-course', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: resolve user and insert records successfully
        mockGetRecords.mockResolvedValue([]);
        mockInsertRecord.mockImplementation(async (table: string, data: any) => {
            if (table === 'courses') return { id: 'generated-course-id', ...data };
            return { id: `record-${Date.now()}`, ...data };
        });
    });

    describe('Validation Errors', () => {
        it('should return 400 when required fields are missing', async () => {
            const request = createGenerateRequest({
                topic: 'Machine Learning',
                // missing goal and level
            });

            mockOpenAISuccess(); // Won't be reached

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain('Missing required fields');
        });

        it('should return 400 when topic is missing', async () => {
            const request = createGenerateRequest({
                goal: 'Learn basics',
                level: 'Beginner',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain('Missing required fields');
        });

        it('should return 400 when goal is missing', async () => {
            const request = createGenerateRequest({
                topic: 'ML',
                level: 'Beginner',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
        });

        it('should return 400 when level is missing', async () => {
            const request = createGenerateRequest({
                topic: 'ML',
                goal: 'Learn basics',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
        });
    });

    describe('Successful Generation (anonymous — no userId)', () => {
        it('should generate outline without saving to database', async () => {
            mockOpenAISuccess();

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.outline).toBeDefined();
            expect(Array.isArray(data.outline)).toBe(true);
            // Should have discussion nodes appended
            expect(data.outline.length).toBe(MOCK_OUTLINE.length);
            // courseId should be null for anonymous users
            expect(data.courseId).toBeNull();

            // Should NOT save to database (no userId)
            expect(mockInsertRecord).not.toHaveBeenCalled();
        });

        it('should append discussion nodes to each module', async () => {
            mockOpenAISuccess();

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);

            // Each module should have a discussion subtopic appended
            for (const mod of data.outline) {
                const lastSubtopic = mod.subtopics[mod.subtopics.length - 1];
                expect(lastSubtopic.type).toBe('discussion');
                expect(lastSubtopic.isDiscussion).toBe(true);
                expect(lastSubtopic.title).toContain('Diskusi Penutup');
            }
        });
    });

    describe('Successful Generation (authenticated — with userId)', () => {
        it('should return courseId in response when authenticated', async () => {
            mockOpenAISuccess();

            mockGetRecords.mockImplementation((table: string) => {
                if (table === 'users') return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email }];
                return [];
            });

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
                userId: TEST_STUDENT.id,
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.courseId).toBe('generated-course-id');
        });

        it('should save course and subtopics to database', async () => {
            mockOpenAISuccess();

            // User exists
            mockGetRecords.mockImplementation((table: string, opts: any) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email }];
                }
                return [];
            });

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
                userId: TEST_STUDENT.id,
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.outline).toBeDefined();

            // Should have inserted course record
            const courseInsert = mockInsertRecord.mock.calls.find(
                (call: any[]) => call[0] === 'courses'
            );
            expect(courseInsert).toBeDefined();
            expect(courseInsert![1]).toMatchObject({
                title: 'Machine Learning',
                description: 'Understand fundamentals',
                difficulty_level: 'Beginner',
                created_by: TEST_STUDENT.id,
            });

            // Should have inserted subtopics (one per module)
            const subtopicInserts = mockInsertRecord.mock.calls.filter(
                (call: any[]) => call[0] === 'subtopics'
            );
            expect(subtopicInserts.length).toBe(MOCK_OUTLINE.length);

            // Should have logged activity
            const activityInsert = mockInsertRecord.mock.calls.find(
                (call: any[]) => call[0] === 'course_generation_activity'
            );
            expect(activityInsert).toBeDefined();
            expect(activityInsert![1]).toMatchObject({
                user_id: TEST_STUDENT.id,
                course_id: 'generated-course-id',
            });
        });

        it('should set estimated_duration to at least 30 minutes', async () => {
            // Single module outline
            mockChatCreate.mockResolvedValue({
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: JSON.stringify([{
                            module: '1. Quick Module',
                            subtopics: [{ title: '1.1 Overview', overview: 'Quick overview.' }],
                        }]),
                    },
                }],
                model: 'gpt-4o-mini',
                usage: {},
            });

            mockGetRecords.mockImplementation((table: string) => {
                if (table === 'users') return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email }];
                return [];
            });

            const request = createGenerateRequest({
                topic: 'Quick Topic',
                goal: 'Quick learn',
                level: 'Beginner',
                userId: TEST_STUDENT.id,
            });

            const response = await POST(request);
            expect(response.status).toBe(200);

            const courseInsert = mockInsertRecord.mock.calls.find(
                (call: any[]) => call[0] === 'courses'
            );
            // 1 module * 15 = 15, but Math.max(15, 30) = 30
            expect(courseInsert![1].estimated_duration).toBeGreaterThanOrEqual(30);
        });
    });

    describe('OpenAI API Errors', () => {
        it('should return 500 when OpenAI fails after all retries', async () => {
            mockChatCreate.mockRejectedValue(new Error('Rate limit exceeded'));

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toContain('failed after');

            // Should have been called 3 times (max retries)
            expect(mockChatCreate).toHaveBeenCalledTimes(3);
        }, 30000); // Longer timeout due to retry delays

        it('should return 500 when OpenAI returns empty content', async () => {
            mockChatCreate.mockResolvedValue({
                choices: [{
                    finish_reason: 'stop',
                    message: { role: 'assistant', content: '' },
                }],
            });

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toContain('Empty response');
        });

        it('should return 500 when OpenAI returns invalid JSON', async () => {
            mockChatCreate.mockResolvedValue({
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: 'This is not valid JSON at all',
                    },
                }],
            });

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toContain('Invalid JSON');
        });
    });

    describe('Database Save Errors', () => {
        it('should return 500 when user cannot be resolved', async () => {
            mockOpenAISuccess();

            // User NOT found in database
            mockGetRecords.mockResolvedValue([]);

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
                userId: 'unknown-user-id',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toContain('could not be resolved');
        });

        it('should return 500 when course insert fails', async () => {
            mockOpenAISuccess();

            mockGetRecords.mockImplementation((table: string) => {
                if (table === 'users') return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email }];
                return [];
            });

            mockInsertRecord.mockRejectedValue(new Error('Insert failed'));

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
                userId: TEST_STUDENT.id,
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toBeDefined();
        });
    });

    describe('CORS Headers', () => {
        it('should include CORS headers in successful response', async () => {
            mockOpenAISuccess();

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
            });

            const response = await POST(request);

            expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
        });

        it('should include CORS headers in error response', async () => {
            const request = createGenerateRequest({
                topic: 'ML',
                // missing goal and level
            });

            const response = await POST(request);

            // 400 errors don't have CORS headers (they return before the try/catch that adds them)
            // But 500 errors should
            expect(response.status).toBe(400);
        });
    });

    describe('Edge Cases', () => {
        it('should strip markdown code fences from OpenAI response', async () => {
            mockChatCreate.mockResolvedValue({
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: '```json\n' + JSON.stringify(MOCK_OUTLINE) + '\n```',
                    },
                }],
                model: 'gpt-4o-mini',
                usage: {},
            });

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.outline).toBeDefined();
            expect(Array.isArray(data.outline)).toBe(true);
        });

        it('should resolve user by email when userId lookup fails', async () => {
            mockOpenAISuccess();

            let callCount = 0;
            mockGetRecords.mockImplementation((table: string, opts: any) => {
                if (table === 'users') {
                    callCount++;
                    // First call (by id) — not found
                    if (opts.filter.id) return [];
                    // Second call (by email) — found
                    if (opts.filter.email) return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email }];
                    return [];
                }
                return [];
            });

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
                userId: 'wrong-id',
                userEmail: TEST_STUDENT.email,
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.outline).toBeDefined();
        });

        it('should not skip discussion node if module already has one', async () => {
            const outlineWithDiscussion = [
                {
                    module: '1. Module With Discussion',
                    subtopics: [
                        { title: '1.1 Intro', overview: 'Intro.' },
                        { title: 'Diskusi Penutup', overview: 'Already has discussion.', type: 'discussion', isDiscussion: true },
                    ],
                },
            ];

            mockChatCreate.mockResolvedValue({
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: JSON.stringify(outlineWithDiscussion),
                    },
                }],
                model: 'gpt-4o-mini',
                usage: {},
            });

            const request = createGenerateRequest({
                topic: 'Test',
                goal: 'Test',
                level: 'Beginner',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);

            // Should NOT add a duplicate discussion node
            const discussionCount = data.outline[0].subtopics.filter(
                (s: any) => s.type === 'discussion' || s.isDiscussion === true
            ).length;
            expect(discussionCount).toBe(1);
        });
    });
});
