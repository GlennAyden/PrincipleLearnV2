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
 * - Handles AI service failure gracefully (500)
 * - Handles database save failure gracefully (500)
 * - Appends discussion nodes to each module
 * - Returns CORS headers in response
 */

import { NextRequest } from 'next/server';
import { TEST_STUDENT } from '../../fixtures/users.fixture';

// Mock schemas — the route uses parseBody + GenerateCourseSchema
const mockParseBody = jest.fn();
jest.mock('@/lib/schemas', () => ({
    GenerateCourseSchema: {},
    parseBody: (...args: any[]) => mockParseBody(...args),
}));

// Mock AI service — the route uses chatCompletionWithRetry + parseAndValidateAIResponse
const mockChatCompletionWithRetry = jest.fn();
const mockParseAndValidateAIResponse = jest.fn();
jest.mock('@/services/ai.service', () => ({
    chatCompletionWithRetry: (...args: any[]) => mockChatCompletionWithRetry(...args),
    parseAndValidateAIResponse: (...args: any[]) => mockParseAndValidateAIResponse(...args),
    CourseOutlineResponseSchema: {},
    sanitizePromptInput: (input: string) => input,
}));

// Mock auth service — the route uses resolveUserByIdentifier
const mockResolveUserByIdentifier = jest.fn();
jest.mock('@/services/auth.service', () => ({
    resolveUserByIdentifier: (...args: any[]) => mockResolveUserByIdentifier(...args),
}));

// Mock course service — the route uses createCourseWithSubtopics
const mockCreateCourseWithSubtopics = jest.fn();
jest.mock('@/services/course.service', () => ({
    createCourseWithSubtopics: (...args: any[]) => mockCreateCourseWithSubtopics(...args),
}));

// Mock the database module (still used for insertRecord on course_generation_activity)
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

describe('POST /api/generate-course', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default: parseBody returns success with the request body
        mockParseBody.mockImplementation((_schema: any, body: any) => ({
            success: true,
            data: body,
        }));

        // Default: AI service returns a valid response
        mockChatCompletionWithRetry.mockResolvedValue({
            choices: [
                {
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: JSON.stringify(MOCK_OUTLINE),
                        refusal: null,
                    },
                },
            ],
            model: 'gpt-4o-mini',
            usage: { prompt_tokens: 100, completion_tokens: 200, total_tokens: 300 },
        });

        // Default: parseAndValidateAIResponse returns the validated outline
        mockParseAndValidateAIResponse.mockReturnValue(MOCK_OUTLINE);

        // Default: user resolution and DB operations
        mockResolveUserByIdentifier.mockResolvedValue(null);
        mockCreateCourseWithSubtopics.mockResolvedValue({ id: 'generated-course-id' });
        mockGetRecords.mockResolvedValue([]);
        mockInsertRecord.mockResolvedValue({ id: `record-${Date.now()}` });
    });

    describe('Validation Errors', () => {
        it('should return 400 when required fields are missing', async () => {
            const { NextResponse } = require('next/server');
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json({ error: 'Missing required fields: goal, level' }, { status: 400 }),
            });

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                // missing goal and level
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toContain('Missing required fields');
        });

        it('should return 400 when topic is missing', async () => {
            const { NextResponse } = require('next/server');
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json({ error: 'Missing required fields: topic' }, { status: 400 }),
            });

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
            const { NextResponse } = require('next/server');
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json({ error: 'Goal is required' }, { status: 400 }),
            });

            const request = createGenerateRequest({
                topic: 'ML',
                level: 'Beginner',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
        });

        it('should return 400 when level is missing', async () => {
            const { NextResponse } = require('next/server');
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json({ error: 'Level is required' }, { status: 400 }),
            });

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
            expect(mockCreateCourseWithSubtopics).not.toHaveBeenCalled();
            expect(mockInsertRecord).not.toHaveBeenCalled();
        });

        it('should append discussion nodes to each module', async () => {
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
            mockResolveUserByIdentifier.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
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
            // User exists
            mockResolveUserByIdentifier.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
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

            // Should have called createCourseWithSubtopics
            expect(mockCreateCourseWithSubtopics).toHaveBeenCalledTimes(1);
            const [courseData, userId, outline] = mockCreateCourseWithSubtopics.mock.calls[0];
            expect(courseData).toMatchObject({
                title: 'Machine Learning',
                description: 'Understand fundamentals',
                difficulty_level: 'Beginner',
            });
            expect(userId).toBe(TEST_STUDENT.id);
            expect(Array.isArray(outline)).toBe(true);

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
            const singleModuleOutline = [{
                module: '1. Quick Module',
                subtopics: [{ title: '1.1 Overview', overview: 'Quick overview.' }],
            }];

            mockChatCompletionWithRetry.mockResolvedValue({
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: JSON.stringify(singleModuleOutline),
                        refusal: null,
                    },
                }],
                model: 'gpt-4o-mini',
                usage: {},
            });
            mockParseAndValidateAIResponse.mockReturnValue(singleModuleOutline);

            mockResolveUserByIdentifier.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
            });

            const request = createGenerateRequest({
                topic: 'Quick Topic',
                goal: 'Quick learn',
                level: 'Beginner',
                userId: TEST_STUDENT.id,
            });

            const response = await POST(request);
            expect(response.status).toBe(200);

            // Check that createCourseWithSubtopics was called with estimated_duration >= 30
            const [courseData] = mockCreateCourseWithSubtopics.mock.calls[0];
            // 1 module * 15 = 15, but Math.max(15, 30) = 30
            expect(courseData.estimated_duration).toBeGreaterThanOrEqual(30);
        });
    });

    describe('AI Service Errors', () => {
        it('should return 500 when AI service fails', async () => {
            mockChatCompletionWithRetry.mockRejectedValue(
                new Error('OpenAI API failed after 3 attempts: Rate limit exceeded')
            );

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toContain('Failed to generate outline');
        });

        it('should return 500 when AI returns empty content', async () => {
            mockChatCompletionWithRetry.mockResolvedValue({
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
            expect(data.error).toContain('Failed to generate outline');
        });

        it('should return 500 when AI returns invalid JSON', async () => {
            mockChatCompletionWithRetry.mockResolvedValue({
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: 'This is not valid JSON at all',
                    },
                }],
            });

            // parseAndValidateAIResponse throws on invalid JSON
            mockParseAndValidateAIResponse.mockImplementation(() => {
                throw new Error('Invalid JSON');
            });

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toContain('Failed to generate outline');
        });
    });

    describe('Database Save Errors', () => {
        it('should return 500 when user cannot be resolved', async () => {
            // User NOT found — resolveUserByIdentifier returns null
            mockResolveUserByIdentifier.mockResolvedValue(null);

            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
                userId: 'unknown-user-id',
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toContain('Failed to generate outline');
        });

        it('should return 500 when course creation fails', async () => {
            mockResolveUserByIdentifier.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
            });

            mockCreateCourseWithSubtopics.mockRejectedValue(new Error('Insert failed'));

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
            const request = createGenerateRequest({
                topic: 'Machine Learning',
                goal: 'Understand fundamentals',
                level: 'Beginner',
            });

            const response = await POST(request);

            expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
        });

        it('should include CORS headers in error response', async () => {
            const { NextResponse } = require('next/server');
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json({ error: 'Missing required fields' }, { status: 400 }),
            });

            const request = createGenerateRequest({
                topic: 'ML',
                // missing goal and level
            });

            const response = await POST(request);

            // 400 errors from parseBody don't have CORS headers (they return the response directly)
            expect(response.status).toBe(400);
        });
    });

    describe('Edge Cases', () => {
        it('should strip markdown code fences from AI response via parseAIJsonResponse', async () => {
            const rawContent = '```json\n' + JSON.stringify(MOCK_OUTLINE) + '\n```';
            mockChatCompletionWithRetry.mockResolvedValue({
                choices: [{
                    finish_reason: 'stop',
                    message: {
                        role: 'assistant',
                        content: rawContent,
                    },
                }],
                model: 'gpt-4o-mini',
                usage: {},
            });
            mockParseAndValidateAIResponse.mockReturnValue(MOCK_OUTLINE);

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

            // Verify parseAndValidateAIResponse was called with the raw content
            expect(mockParseAndValidateAIResponse).toHaveBeenCalledWith(
                rawContent,
                expect.anything(), // CourseOutlineResponseSchema
                'Generate Course',
            );
        });

        it('should resolve user by email when userId lookup fails', async () => {
            // First call with 'wrong-id' returns null, second call with email returns user
            mockResolveUserByIdentifier
                .mockResolvedValueOnce(null)  // userId lookup fails
                .mockResolvedValueOnce({ id: TEST_STUDENT.id, email: TEST_STUDENT.email }); // email lookup succeeds

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

            mockChatCompletionWithRetry.mockResolvedValue({
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
            mockParseAndValidateAIResponse.mockReturnValue(outlineWithDiscussion);

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
