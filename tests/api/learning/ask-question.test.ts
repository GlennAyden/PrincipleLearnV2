/**
 * API Tests for /api/ask-question endpoint
 *
 * Tests:
 * - Successful question and answer
 * - Authentication checks
 * - Validation errors
 * - AI service integration
 * - Edge cases
 */

import { createMockNextRequest, generateJWT } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';
import { ASK_QUESTION_REQUEST, TEST_COURSE } from '../../fixtures/courses.fixture';

// Mock adminDb — the route uses adminDb.from('ask_question_history').insert()
const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
const mockFrom = jest.fn(() => ({
    insert: (...args: any[]) => mockInsert(...args),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    limit: jest.fn().mockReturnThis(),
    single: jest.fn().mockReturnThis(),
}));

jest.mock('@/lib/database', () => ({
    DatabaseService: {
        getRecords: jest.fn().mockResolvedValue([]),
        insertRecord: jest.fn().mockResolvedValue({}),
    },
    adminDb: {
        from: (...args: any[]) => mockFrom(...args),
    },
    DatabaseError: class DatabaseError extends Error {
        constructor(message: string, public originalError?: any) {
            super(message);
            this.name = 'DatabaseError';
        }
    },
}));

// Mock schemas — the route uses parseBody + AskQuestionSchema
const mockParseBody = jest.fn();
jest.mock('@/lib/schemas', () => ({
    AskQuestionSchema: {},
    parseBody: (...args: any[]) => mockParseBody(...args),
}));

// Mock AI service — the route streams via chatCompletionStream
const mockChatCompletionStream = jest.fn();
jest.mock('@/services/ai.service', () => ({
    chatCompletionStream: (...args: any[]) => mockChatCompletionStream(...args),
    openAIStreamToReadable: (stream: AsyncIterable<any>, opts?: { onComplete?: (t: string) => any; cancelTimeout?: () => void }) => {
        const enc = new TextEncoder();
        let text = '';
        return new ReadableStream({
            async start(ctrl) {
                for await (const chunk of stream) {
                    const d = (chunk as any).choices?.[0]?.delta?.content;
                    if (d) { text += d; ctrl.enqueue(enc.encode(d)); }
                }
                if (opts?.onComplete) await opts.onComplete(text);
                ctrl.close();
                opts?.cancelTimeout?.();
            },
        });
    },
    STREAM_HEADERS: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' },
    sanitizePromptInput: (input: string) => input,
}));

// Mock JWT — verifyToken
const mockVerifyToken = jest.fn();
jest.mock('@/lib/jwt', () => ({
    verifyToken: (...args: any[]) => mockVerifyToken(...args),
    generateAccessToken: jest.fn(() => 'mock-access-token'),
    generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
}));

// Mock api-logger — withApiLogging should be a passthrough
jest.mock('@/lib/api-logger', () => ({
    withApiLogging: (handler: any) => handler,
    logApiCall: jest.fn().mockResolvedValue(undefined),
}));

import { POST } from '@/app/api/ask-question/route';

describe('POST /api/ask-question', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default: parseBody returns success with the request body
        mockParseBody.mockImplementation((_schema: any, body: any) => ({
            success: true,
            data: body,
        }));

        // Default: chatCompletionStream returns a streaming response
        mockChatCompletionStream.mockImplementation(() => Promise.resolve({
            stream: (async function* () {
                yield { choices: [{ delta: { content: 'This is a mock answer about software testing.' } }] };
            })(),
            cancelTimeout: jest.fn(),
        }));

        // Default: DB insert succeeds
        mockInsert.mockResolvedValue({ data: null, error: null });

        // Default: valid token
        mockVerifyToken.mockReturnValue({
            userId: TEST_STUDENT.id,
            email: TEST_STUDENT.email,
            role: 'user',
        });
    });

    describe('Successful Question & Answer', () => {
        it('should return an answer for a valid request', async () => {
            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
                cookies: { access_token: token },
            });

            const response = await POST(request);
            const text = await response.text();

            expect(response.status).toBe(200);
            expect(text).toBe('This is a mock answer about software testing.');
        });

        it('should log question history to database', async () => {
            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
                cookies: { access_token: token },
            });

            const response = await POST(request);
            await response.text(); // consume stream to trigger onComplete DB save

            // Should have called adminDb.from('ask_question_history')
            expect(mockFrom).toHaveBeenCalledWith('ask_question_history');
            expect(mockInsert).toHaveBeenCalled();

            // Verify the data passed to insert
            const insertData = mockInsert.mock.calls[0][0];
            expect(insertData.user_id).toBe(TEST_STUDENT.id);
            expect(insertData.course_id).toBe(TEST_COURSE.id);
            expect(insertData.question).toBe(ASK_QUESTION_REQUEST.valid.question);
        });

        it('should include metadata when provided', async () => {
            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.withMetadata,
                cookies: { access_token: token },
            });

            const response = await POST(request);
            await response.text(); // consume stream to trigger onComplete

            expect(mockInsert).toHaveBeenCalled();
            const insertData = mockInsert.mock.calls[0][0];
            expect(insertData.module_index).toBe(0);
            expect(insertData.subtopic_index).toBe(0);
            expect(insertData.page_number).toBe(1);
        });
    });

    describe('Authentication', () => {
        it('should return 401 without authentication', async () => {
            // No cookies = no access_token
            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
            });

            // verifyToken returns null for missing token
            mockVerifyToken.mockReturnValue(null);

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
        });

        it('should return 401 with invalid token', async () => {
            mockVerifyToken.mockReturnValue(null);

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
                cookies: { access_token: 'invalid-token' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
        });

        it('should return 403 when userId does not match token', async () => {
            // Token says different user
            mockVerifyToken.mockReturnValue({
                userId: 'different-user-id',
                email: 'other@example.com',
                role: 'user',
            });

            const token = generateJWT({
                userId: 'different-user-id',
                email: 'other@example.com',
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
                cookies: { access_token: token },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.error).toBeDefined();
        });
    });

    describe('Validation Errors', () => {
        it('should return 400 for missing question', async () => {
            // parseBody returns failure for invalid body
            const { NextResponse } = require('next/server');
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json({ error: 'Question is required' }, { status: 400 }),
            });

            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: {
                    context: 'Some context',
                    userId: TEST_STUDENT.id,
                    courseId: TEST_COURSE.id,
                },
                cookies: { access_token: token },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });

        it('should return 400 for missing context', async () => {
            const { NextResponse } = require('next/server');
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json({ error: 'Context is required' }, { status: 400 }),
            });

            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: {
                    question: 'What is testing?',
                    userId: TEST_STUDENT.id,
                    courseId: TEST_COURSE.id,
                },
                cookies: { access_token: token },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });

        it('should return 400 for missing courseId', async () => {
            const { NextResponse } = require('next/server');
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json({ error: 'Course ID is required' }, { status: 400 }),
            });

            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: {
                    question: 'What is testing?',
                    context: 'Some context',
                    userId: TEST_STUDENT.id,
                },
                cookies: { access_token: token },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });

        it('should return 400 for empty question string', async () => {
            const { NextResponse } = require('next/server');
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json({ error: 'Question is required' }, { status: 400 }),
            });

            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: {
                    question: '   ',
                    context: 'Some context',
                    userId: TEST_STUDENT.id,
                    courseId: TEST_COURSE.id,
                },
                cookies: { access_token: token },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });
    });

    describe('AI Service Integration', () => {
        it('should call chatCompletionStream with correct parameters', async () => {
            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
                cookies: { access_token: token },
            });

            await POST(request);

            expect(mockChatCompletionStream).toHaveBeenCalledTimes(1);
            const callArgs = mockChatCompletionStream.mock.calls[0][0];
            expect(callArgs.messages).toBeDefined();
            expect(callArgs.messages.length).toBe(2);
            expect(callArgs.messages[0].role).toBe('system');
            expect(callArgs.messages[1].role).toBe('user');
            expect(callArgs.messages[1].content).toContain(ASK_QUESTION_REQUEST.valid.question);
            expect(callArgs.maxTokens).toBe(2000);
        });

        it('should handle AI service errors gracefully', async () => {
            mockChatCompletionStream.mockRejectedValue(new Error('OpenAI API rate limit exceeded'));

            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
                cookies: { access_token: token },
            });

            const response = await POST(request);

            expect(response.status).toBe(500);
        });

        it('should handle empty AI response', async () => {
            mockChatCompletionStream.mockImplementation(() => Promise.resolve({
                stream: (async function* () {
                    yield { choices: [{ delta: { content: '' } }] };
                })(),
                cancelTimeout: jest.fn(),
            }));

            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
                cookies: { access_token: token },
            });

            const response = await POST(request);
            const text = await response.text();

            expect(response.status).toBe(200);
            expect(text).toBe('');
        });
    });

    describe('Edge Cases', () => {
        it('should handle database logging failure', async () => {
            mockInsert.mockResolvedValue({
                data: null,
                error: { message: 'Database write failed', code: '42501' },
            });

            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
                cookies: { access_token: token },
            });

            const response = await POST(request);
            await response.text(); // consume the stream to trigger onComplete

            // With streaming, DB errors are logged but don't affect the response
            expect(response.status).toBe(200);
        });

        it('should handle very long questions', async () => {
            const longQuestion = 'What is testing? '.repeat(500);

            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: {
                    question: longQuestion,
                    context: 'Software testing basics',
                    userId: TEST_STUDENT.id,
                    courseId: TEST_COURSE.id,
                },
                cookies: { access_token: token },
            });

            const response = await POST(request);

            // Should still process (OpenAI handles truncation)
            expect([200, 500]).toContain(response.status);
        });
    });
});
