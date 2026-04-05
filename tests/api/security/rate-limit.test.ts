/**
 * API Tests for rate limiting behavior across endpoints
 *
 * Tests:
 * - Login rate limiter: allows and denies requests
 * - Register rate limiter: allows and denies requests
 * - AI rate limiter on ask-question: allows and denies requests
 */

import { createMockNextRequest, generateJWT } from '../../setup/test-utils';
import { TEST_STUDENT, REGISTRATION_DATA, LOGIN_CREDENTIALS } from '../../fixtures/users.fixture';
import { ASK_QUESTION_REQUEST } from '../../fixtures/courses.fixture';

// ── Mocks (must be declared before route imports) ──────────────────────

// Mock rate limiting
jest.mock('@/lib/rate-limit', () => ({
    loginRateLimiter: { isAllowed: jest.fn().mockResolvedValue(true) },
    registerRateLimiter: { isAllowed: jest.fn().mockResolvedValue(true) },
    aiRateLimiter: { isAllowed: jest.fn().mockResolvedValue(true) },
}));

// Mock schemas — parseBody returns success with the provided data
jest.mock('@/lib/schemas', () => ({
    LoginSchema: {},
    RegisterSchema: {},
    AskQuestionSchema: {},
    parseBody: jest.fn((_schema: unknown, body: unknown) => ({
        success: true,
        data: body,
    })),
}));

// Mock auth service
jest.mock('@/services/auth.service', () => ({
    findUserByEmail: jest.fn(),
    verifyPassword: jest.fn(),
    generateAuthTokens: jest.fn(() => ({
        accessToken: 'mock-access-token',
        refreshToken: 'mock-refresh-token',
    })),
    generateCsrfToken: jest.fn(() => 'mock-csrf-token'),
    hashPassword: jest.fn(() => Promise.resolve('hashed_password')),
}));

// Mock AI service (streaming)
jest.mock('@/services/ai.service', () => ({
    chatCompletionStream: jest.fn().mockImplementation(() => Promise.resolve({
        stream: (async function* () {
            yield { choices: [{ delta: { content: 'Mock AI answer.' } }] };
        })(),
        cancelTimeout: jest.fn(),
    })),
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

// Mock database
const mockInsert = jest.fn().mockResolvedValue({ data: null, error: null });
jest.mock('@/lib/database', () => ({
    DatabaseService: {
        getRecords: jest.fn().mockResolvedValue([]),
        insertRecord: jest.fn().mockResolvedValue({ id: 'new-id', email: 'test@example.com', role: 'user' }),
    },
    adminDb: {
        from: jest.fn(() => ({
            insert: (...args: any[]) => mockInsert(...args),
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            single: jest.fn().mockReturnThis(),
        })),
    },
    DatabaseError: class DatabaseError extends Error {
        constructor(message: string, public originalError?: any) {
            super(message);
            this.name = 'DatabaseError';
        }
    },
}));

// Mock bcryptjs (used internally by auth.service in real code, but also by older routes)
jest.mock('bcryptjs', () => ({
    compare: jest.fn().mockResolvedValue(true),
    hash: jest.fn(() => Promise.resolve('hashed_password')),
    genSalt: jest.fn(() => Promise.resolve('salt')),
}));

// Mock JWT
const mockVerifyToken = jest.fn();
jest.mock('@/lib/jwt', () => ({
    generateAccessToken: jest.fn(() => 'mock-access-token'),
    generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
    getTokenExpiration: jest.fn(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    verifyToken: (...args: any[]) => mockVerifyToken(...args),
}));

// Mock validation (register route may still reference it)
jest.mock('@/lib/validation', () => ({
    validateEmail: jest.fn(() => ({ valid: true })),
    validatePassword: jest.fn(() => ({ valid: true })),
}));

// Mock api-logger — withApiLogging should be a passthrough
jest.mock('@/lib/api-logger', () => ({
    withApiLogging: (handler: any) => handler,
    logApiCall: jest.fn().mockResolvedValue(undefined),
}));

// ── Route imports (after all mocks) ────────────────────────────────────

import { POST as loginPOST } from '@/app/api/auth/login/route';
import { POST as registerPOST } from '@/app/api/auth/register/route';
import { POST as askQuestionPOST } from '@/app/api/ask-question/route';

// Re-import mocked modules for assertions
import { loginRateLimiter, registerRateLimiter, aiRateLimiter } from '@/lib/rate-limit';
import { findUserByEmail, verifyPassword } from '@/services/auth.service';

// ── Test suites ────────────────────────────────────────────────────────

describe('Rate Limiting', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default: all rate limiters allow
        (loginRateLimiter.isAllowed as jest.Mock).mockResolvedValue(true);
        (registerRateLimiter.isAllowed as jest.Mock).mockResolvedValue(true);
        (aiRateLimiter.isAllowed as jest.Mock).mockResolvedValue(true);

        // Default: DB insert succeeds
        mockInsert.mockResolvedValue({ data: null, error: null });
    });

    // ── Login Rate Limiter ─────────────────────────────────────────────

    describe('Login Rate Limiter', () => {
        beforeEach(() => {
            // Setup successful login mocks
            (findUserByEmail as jest.Mock).mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                password_hash: 'hashed_password',
                role: 'user',
                name: TEST_STUDENT.name,
            });
            (verifyPassword as jest.Mock).mockResolvedValue(true);
        });

        it('should allow login request and return 200 when rate limiter permits', async () => {
            (loginRateLimiter.isAllowed as jest.Mock).mockResolvedValue(true);

            const request = createMockNextRequest('POST', '/api/auth/login', {
                body: LOGIN_CREDENTIALS.validStudent,
            });

            const response = await loginPOST(request);
            const data = await response.json();

            expect(loginRateLimiter.isAllowed).toHaveBeenCalled();
            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.user).toBeDefined();
            expect(data.user.email).toBe(TEST_STUDENT.email);
        });

        it('should deny login request and return 429 when rate limiter blocks', async () => {
            (loginRateLimiter.isAllowed as jest.Mock).mockResolvedValue(false);

            const request = createMockNextRequest('POST', '/api/auth/login', {
                body: LOGIN_CREDENTIALS.validStudent,
            });

            const response = await loginPOST(request);
            const data = await response.json();

            expect(loginRateLimiter.isAllowed).toHaveBeenCalled();
            expect(response.status).toBe(429);
            expect(data.error).toBeDefined();
            expect(data.error).toMatch(/too many/i);
        });

        it('should not call findUserByEmail when rate limiter denies', async () => {
            (loginRateLimiter.isAllowed as jest.Mock).mockResolvedValue(false);

            const request = createMockNextRequest('POST', '/api/auth/login', {
                body: LOGIN_CREDENTIALS.validStudent,
            });

            await loginPOST(request);

            expect(findUserByEmail).not.toHaveBeenCalled();
        });
    });

    // ── Register Rate Limiter ──────────────────────────────────────────

    describe('Register Rate Limiter', () => {
        beforeEach(() => {
            // No existing user (registration can proceed)
            (findUserByEmail as jest.Mock).mockResolvedValue(null);
        });

        it('should allow registration and return 200 when rate limiter permits', async () => {
            (registerRateLimiter.isAllowed as jest.Mock).mockResolvedValue(true);

            const request = createMockNextRequest('POST', '/api/auth/register', {
                body: REGISTRATION_DATA.valid,
            });

            const response = await registerPOST(request);
            const data = await response.json();

            expect(registerRateLimiter.isAllowed).toHaveBeenCalled();
            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });

        it('should deny registration and return 429 when rate limiter blocks', async () => {
            (registerRateLimiter.isAllowed as jest.Mock).mockResolvedValue(false);

            const request = createMockNextRequest('POST', '/api/auth/register', {
                body: REGISTRATION_DATA.valid,
            });

            const response = await registerPOST(request);
            const data = await response.json();

            expect(registerRateLimiter.isAllowed).toHaveBeenCalled();
            expect(response.status).toBe(429);
            expect(data.error).toBeDefined();
            expect(data.error).toMatch(/too many/i);
        });

        it('should not attempt user lookup when rate limiter denies', async () => {
            (registerRateLimiter.isAllowed as jest.Mock).mockResolvedValue(false);

            const request = createMockNextRequest('POST', '/api/auth/register', {
                body: REGISTRATION_DATA.valid,
            });

            await registerPOST(request);

            expect(findUserByEmail).not.toHaveBeenCalled();
        });
    });

    // ── AI Rate Limiter (ask-question) ─────────────────────────────────

    describe('AI Rate Limiter (ask-question)', () => {
        beforeEach(() => {
            // Setup valid authentication
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });
        });

        it('should allow ask-question request and return 200 when rate limiter permits', async () => {
            (aiRateLimiter.isAllowed as jest.Mock).mockResolvedValue(true);

            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
                cookies: { access_token: token },
            });

            const response = await askQuestionPOST(request);
            const text = await response.text();

            expect(aiRateLimiter.isAllowed).toHaveBeenCalledWith(TEST_STUDENT.id);
            expect(response.status).toBe(200);
            expect(text.length).toBeGreaterThan(0);
        });

        it('should deny ask-question request and return 429 when rate limiter blocks', async () => {
            (aiRateLimiter.isAllowed as jest.Mock).mockResolvedValue(false);

            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
                cookies: { access_token: token },
            });

            const response = await askQuestionPOST(request);
            const data = await response.json();

            expect(aiRateLimiter.isAllowed).toHaveBeenCalledWith(TEST_STUDENT.id);
            expect(response.status).toBe(429);
            expect(data.error).toBeDefined();
            expect(data.error).toMatch(/too many/i);
        });

        it('should check authentication before rate limiting', async () => {
            mockVerifyToken.mockReturnValue(null);

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
            });

            const response = await askQuestionPOST(request);

            expect(response.status).toBe(401);
            // AI rate limiter should NOT be called when auth fails
            expect(aiRateLimiter.isAllowed).not.toHaveBeenCalled();
        });

        it('should not call chatCompletionStream when rate limiter denies', async () => {
            (aiRateLimiter.isAllowed as jest.Mock).mockResolvedValue(false);

            const { chatCompletionStream } = require('@/services/ai.service');

            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const request = createMockNextRequest('POST', '/api/ask-question', {
                body: ASK_QUESTION_REQUEST.valid,
                cookies: { access_token: token },
            });

            await askQuestionPOST(request);

            expect(chatCompletionStream).not.toHaveBeenCalled();
        });
    });
});
