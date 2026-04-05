/**
 * API Tests for POST /api/challenge-thinking endpoint
 *
 * Tests:
 * - Successful challenge question generation
 * - Validation error (missing context)
 * - Rate limited (429)
 * - AI service error (500)
 * - Different difficulty levels (beginner, intermediate, advanced)
 */

import { createMockNextRequest } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';

// ── Mocks ──────────────────────────────────────────────────────────────

jest.mock('@/lib/api-middleware', () => ({
    withProtection: (handler: any) => handler,
}));

jest.mock('@/lib/rate-limit', () => ({
    aiRateLimiter: { isAllowed: jest.fn().mockResolvedValue(true) },
    loginRateLimiter: { isAllowed: jest.fn().mockResolvedValue(true) },
    registerRateLimiter: { isAllowed: jest.fn().mockResolvedValue(true) },
}));

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

jest.mock('@/lib/schemas', () => ({
    ChallengeThinkingSchema: {},
    parseBody: jest.fn(),
}));

// ── Imports (after mocks) ──────────────────────────────────────────────

import { POST } from '@/app/api/challenge-thinking/route';
import { aiRateLimiter } from '@/lib/rate-limit';
import { chatCompletionStream } from '@/services/ai.service';
import { parseBody } from '@/lib/schemas';

const mockAiRateLimiter = aiRateLimiter.isAllowed as jest.MockedFunction<typeof aiRateLimiter.isAllowed>;
const _mockChatCompletionStream = chatCompletionStream as jest.MockedFunction<typeof chatCompletionStream>;
const mockParseBody = parseBody as jest.MockedFunction<typeof parseBody>;

// ── Test suite ─────────────────────────────────────────────────────────

describe('POST /api/challenge-thinking', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Defaults: rate limiter allows, AI returns a streamed question
        mockAiRateLimiter.mockResolvedValue(true);
        mockChatCompletionStream.mockImplementation(() => Promise.resolve({
            stream: (async function* () {
                yield { choices: [{ delta: { content: 'What is the main concept?' } }] };
            })(),
            cancelTimeout: jest.fn(),
        }));
    });

    describe('Successful challenge question generation', () => {
        it('should return a challenge question for valid input', async () => {
            const body = {
                context: 'Software testing is the process of evaluating software to find defects.',
                level: 'intermediate',
            };

            mockParseBody.mockReturnValue({
                success: true,
                data: { context: body.context, level: 'intermediate' },
            } as any);

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body,
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            const response = await POST(request);
            const text = await response.text();

            expect(response.status).toBe(200);
            expect(typeof text).toBe('string');
            expect(text.length).toBeGreaterThan(0);
        });

        it('should call chatCompletionStream with system and user messages', async () => {
            const context = 'Unit testing verifies individual components work correctly.';

            mockParseBody.mockReturnValue({
                success: true,
                data: { context, level: 'intermediate' },
            } as any);

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body: { context, level: 'intermediate' },
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            await POST(request);

            expect(mockChatCompletionStream).toHaveBeenCalledTimes(1);
            const callArgs = mockChatCompletionStream.mock.calls[0][0] as any;
            expect(callArgs.messages).toBeDefined();
            expect(callArgs.messages.length).toBe(2);
            expect(callArgs.messages[0].role).toBe('system');
            expect(callArgs.messages[1].role).toBe('user');
            expect(callArgs.messages[1].content).toContain(context);
        });

        it('should check rate limit using x-user-id header', async () => {
            mockParseBody.mockReturnValue({
                success: true,
                data: { context: 'Some content', level: 'intermediate' },
            } as any);

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body: { context: 'Some content' },
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            await POST(request);

            expect(mockAiRateLimiter).toHaveBeenCalledWith(TEST_STUDENT.id);
        });

        it('should use "unknown" for rate limit when x-user-id header is missing', async () => {
            mockParseBody.mockReturnValue({
                success: true,
                data: { context: 'Some content', level: 'intermediate' },
            } as any);

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body: { context: 'Some content' },
            });

            await POST(request);

            expect(mockAiRateLimiter).toHaveBeenCalledWith('unknown');
        });
    });

    describe('Validation error', () => {
        it('should return 400 when context is missing', async () => {
            const body = { level: 'intermediate' };

            mockParseBody.mockReturnValue({
                success: false,
                response: new Response(
                    JSON.stringify({ error: 'Context is required' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } },
                ),
            } as any);

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body,
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();

            // AI service should not be called when validation fails
            expect(mockChatCompletionStream).not.toHaveBeenCalled();
        });

        it('should return 400 when context is an empty string', async () => {
            const body = { context: '', level: 'beginner' };

            mockParseBody.mockReturnValue({
                success: false,
                response: new Response(
                    JSON.stringify({ error: 'Context is required' }),
                    { status: 400, headers: { 'Content-Type': 'application/json' } },
                ),
            } as any);

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body,
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });
    });

    describe('Rate limited', () => {
        it('should return 429 when rate limit is exceeded', async () => {
            mockAiRateLimiter.mockResolvedValue(false);

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body: { context: 'Some learning content', level: 'intermediate' },
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(429);
            expect(data.error).toContain('Too many requests');

            // Should not attempt to parse body or call AI when rate limited
            expect(mockChatCompletionStream).not.toHaveBeenCalled();
        });
    });

    describe('AI service error', () => {
        it('should return 500 when chatCompletionStream throws an error', async () => {
            mockParseBody.mockReturnValue({
                success: true,
                data: { context: 'Some content about testing', level: 'intermediate' },
            } as any);

            mockChatCompletionStream.mockRejectedValue(new Error('OpenAI API quota exceeded'));

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body: { context: 'Some content about testing' },
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toBe('Failed to generate challenge question');
        });

        it('should return 500 when chatCompletionStream returns an unexpected response', async () => {
            mockParseBody.mockReturnValue({
                success: true,
                data: { context: 'Testing concepts', level: 'intermediate' },
            } as any);

            mockChatCompletionStream.mockRejectedValue(new Error('Network timeout'));

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body: { context: 'Testing concepts' },
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toBe('Failed to generate challenge question');
        });
    });

    describe('Different difficulty levels', () => {
        it('should generate a beginner-level challenge question', async () => {
            const context = 'Variables store data values in programming.';
            const questionText = 'What is the main purpose of a variable?';

            mockParseBody.mockReturnValue({
                success: true,
                data: { context, level: 'beginner' },
            } as any);

            mockChatCompletionStream.mockImplementation(() => Promise.resolve({
                stream: (async function* () {
                    yield { choices: [{ delta: { content: questionText } }] };
                })(),
                cancelTimeout: jest.fn(),
            }));

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body: { context, level: 'beginner' },
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            const response = await POST(request);
            const text = await response.text();

            expect(response.status).toBe(200);
            expect(text).toBe(questionText);

            // Verify the system message mentions beginner level
            const callArgs = mockChatCompletionStream.mock.calls[0][0] as any;
            const systemMsg = callArgs.messages[0].content;
            expect(systemMsg).toContain('beginner');
            expect(systemMsg).toContain('simple');
        });

        it('should generate an intermediate-level challenge question', async () => {
            const context = 'Design patterns provide reusable solutions to common problems.';
            const questionText = 'How would you apply the observer pattern in a real application?';

            mockParseBody.mockReturnValue({
                success: true,
                data: { context, level: 'intermediate' },
            } as any);

            mockChatCompletionStream.mockImplementation(() => Promise.resolve({
                stream: (async function* () {
                    yield { choices: [{ delta: { content: questionText } }] };
                })(),
                cancelTimeout: jest.fn(),
            }));

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body: { context, level: 'intermediate' },
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            const response = await POST(request);
            const text = await response.text();

            expect(response.status).toBe(200);
            expect(text).toBe(questionText);

            const callArgs = mockChatCompletionStream.mock.calls[0][0] as any;
            const systemMsg = callArgs.messages[0].content;
            expect(systemMsg).toContain('intermediate');
            expect(systemMsg).toContain('moderate');
        });

        it('should generate an advanced-level challenge question', async () => {
            const context = 'Microservices architecture decomposes applications into small, independent services.';
            const questionText = 'Analyze the trade-offs between microservices and monolithic architectures in terms of scalability and data consistency.';

            mockParseBody.mockReturnValue({
                success: true,
                data: { context, level: 'advanced' },
            } as any);

            mockChatCompletionStream.mockImplementation(() => Promise.resolve({
                stream: (async function* () {
                    yield { choices: [{ delta: { content: questionText } }] };
                })(),
                cancelTimeout: jest.fn(),
            }));

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body: { context, level: 'advanced' },
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            const response = await POST(request);
            const text = await response.text();

            expect(response.status).toBe(200);
            expect(text).toContain('Analyze the trade-offs');

            const callArgs = mockChatCompletionStream.mock.calls[0][0] as any;
            const systemMsg = callArgs.messages[0].content;
            expect(systemMsg).toContain('advanced');
            expect(systemMsg).toContain('challenging');
        });

        it('should default to intermediate when level is not provided', async () => {
            const context = 'Algorithms are step-by-step procedures for solving problems.';

            mockParseBody.mockReturnValue({
                success: true,
                data: { context, level: 'intermediate' },
            } as any);

            const request = createMockNextRequest('POST', '/api/challenge-thinking', {
                body: { context },
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            const response = await POST(request);

            expect(response.status).toBe(200);

            const callArgs = mockChatCompletionStream.mock.calls[0][0] as any;
            const userMsg = callArgs.messages[1].content;
            expect(userMsg).toContain('intermediate');
        });
    });
});
