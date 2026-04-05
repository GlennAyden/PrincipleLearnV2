/**
 * API Tests for POST /api/quiz/submit endpoint
 *
 * Tests:
 * - Successful quiz submission
 * - Validation errors (missing fields, empty answers)
 * - User not found
 * - Course not found
 * - Quiz questions not found
 * - Database error handling
 */

import { NextResponse } from 'next/server';
import { createMockNextRequest } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';
import { TEST_COURSE } from '../../fixtures/courses.fixture';

// ---------------------------------------------------------------------------
// Mock dependencies — MUST be declared before importing the route
// ---------------------------------------------------------------------------

const mockParseBody = jest.fn();
jest.mock('@/lib/schemas', () => ({
    QuizSubmitSchema: { safeParse: jest.fn() },
    parseBody: (...args: any[]) => mockParseBody(...args),
}));

const mockResolveUserByIdentifier = jest.fn();
jest.mock('@/services/auth.service', () => ({
    resolveUserByIdentifier: (...args: any[]) => mockResolveUserByIdentifier(...args),
}));

const mockGetRecords = jest.fn();
const mockInsert = jest.fn().mockResolvedValue({ data: [], error: null });
const mockUpdate = jest.fn().mockResolvedValue({ data: null, error: null });
const mockMaybeSingle = jest.fn().mockResolvedValue({ data: null, error: null });
const mockFrom = jest.fn(() => ({
    insert: (...args: any[]) => mockInsert(...args),
    select: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    maybeSingle: () => mockMaybeSingle(),
    update: (...args: any[]) => mockUpdate(...args),
}));

jest.mock('@/lib/database', () => ({
    DatabaseService: {
        getRecords: (...args: any[]) => mockGetRecords(...args),
    },
    DatabaseError: class DatabaseError extends Error {
        constructor(message: string, public originalError?: any) {
            super(message);
            this.name = 'DatabaseError';
        }
    },
    adminDb: {
        from: (...args: any[]) => mockFrom(...args),
    },
}));

jest.mock('@/lib/api-logger', () => ({
    withApiLogging: (handler: any) => handler,
    logApiCall: jest.fn().mockResolvedValue(undefined),
}));

// ---------------------------------------------------------------------------
// Import route handler AFTER mocks are set up
// ---------------------------------------------------------------------------

import { POST } from '@/app/api/quiz/submit/route';

// ---------------------------------------------------------------------------
// Shared test data
// ---------------------------------------------------------------------------

const QUIZ_QUESTION_TEXT = 'What is the primary purpose of unit testing?';

const validAnswers = [
    {
        question: QUIZ_QUESTION_TEXT,
        options: [
            'To test the entire system',
            'To test individual components in isolation',
            'To test user interface',
            'To test performance',
        ],
        userAnswer: 'To test individual components in isolation',
        isCorrect: true,
        questionIndex: 0,
    },
];

const validBody = {
    userId: TEST_STUDENT.id,
    courseId: TEST_COURSE.id,
    subtopic: 'What is Software Testing?',
    score: 100,
    answers: validAnswers,
};

const mockUser = {
    id: TEST_STUDENT.id,
    email: TEST_STUDENT.email,
    name: TEST_STUDENT.name,
    role: TEST_STUDENT.role,
};

const mockCourse = {
    id: TEST_COURSE.id,
    title: TEST_COURSE.title,
};

const mockQuizQuestions = [
    {
        id: 'quiz-q-001',
        course_id: TEST_COURSE.id,
        question: QUIZ_QUESTION_TEXT,
        options: [
            'To test the entire system',
            'To test individual components in isolation',
            'To test user interface',
            'To test performance',
        ],
        correct_answer: 1,
    },
];

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/quiz/submit', () => {
    beforeEach(() => {
        jest.clearAllMocks();

        // Default: parseBody returns success
        mockParseBody.mockReturnValue({ success: true, data: validBody });

        // Default: user found
        mockResolveUserByIdentifier.mockResolvedValue(mockUser);

        // Default: course found, then quiz questions found
        // getRecords is called multiple times:
        //   1st call — courses lookup
        //   2nd call — quiz lookup (fallback: all quiz for course)
        //   3rd call — resolveModuleContext subtopics lookup
        mockGetRecords
            .mockResolvedValueOnce([mockCourse])   // courses
            .mockResolvedValueOnce(mockQuizQuestions) // quiz (fallback)
            .mockResolvedValueOnce([]);              // subtopics for resolveModuleContext

        // Default: insert succeeds
        mockInsert.mockResolvedValue({
            data: [{ id: 'submission-001' }],
            error: null,
        });

        // Default: subtopic cache lookup (maybeSingle)
        mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    });

    // -----------------------------------------------------------------------
    // 1. Successful quiz submission
    // -----------------------------------------------------------------------
    describe('Successful Submission', () => {
        it('should save quiz answers and return success', async () => {
            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: validBody,
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.submissionIds).toBeDefined();
            expect(data.message).toContain('1/1');
            expect(data.details.totalAnswers).toBe(1);
            expect(data.details.successfulMatches).toBe(1);
            expect(data.details.failedMatches).toBe(0);
        });

        it('should call resolveUserByIdentifier with the userId', async () => {
            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: validBody,
            });

            await POST(request);

            expect(mockResolveUserByIdentifier).toHaveBeenCalledWith(TEST_STUDENT.id);
        });

        it('should look up the course in database', async () => {
            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: validBody,
            });

            await POST(request);

            expect(mockGetRecords).toHaveBeenCalledWith('courses', expect.objectContaining({
                filter: { id: TEST_COURSE.id },
                limit: 1,
            }));
        });

        it('should insert matched rows via adminDb', async () => {
            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: validBody,
            });

            await POST(request);

            expect(mockFrom).toHaveBeenCalledWith('quiz_submissions');
            expect(mockInsert).toHaveBeenCalled();

            const insertedRows = mockInsert.mock.calls[0][0];
            expect(insertedRows).toHaveLength(1);
            expect(insertedRows[0].user_id).toBe(TEST_STUDENT.id);
            expect(insertedRows[0].quiz_id).toBe('quiz-q-001');
            expect(insertedRows[0].course_id).toBe(TEST_COURSE.id);
            expect(insertedRows[0].is_correct).toBe(true);
        });

        it('should return matchingResults with exact_text method', async () => {
            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: validBody,
            });

            const response = await POST(request);
            const data = await response.json();

            expect(data.matchingResults).toBeDefined();
            expect(data.matchingResults).toHaveLength(1);
            expect(data.matchingResults[0].matched).toBe(true);
            expect(data.matchingResults[0].method).toBe('exact_text');
        });
    });

    // -----------------------------------------------------------------------
    // 2. Validation errors
    // -----------------------------------------------------------------------
    describe('Validation Errors', () => {
        it('should return 400 when userId is missing', async () => {
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json(
                    { error: 'User ID is required' },
                    { status: 400 }
                ),
            });

            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: { ...validBody, userId: '' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });

        it('should return 400 when courseId is missing', async () => {
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json(
                    { error: 'Course ID is required' },
                    { status: 400 }
                ),
            });

            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: { ...validBody, courseId: '' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });

        it('should return 400 when subtopic is missing', async () => {
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json(
                    { error: 'Subtopic is required' },
                    { status: 400 }
                ),
            });

            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: { ...validBody, subtopic: '' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });

        it('should return 400 when answers array is empty', async () => {
            mockParseBody.mockReturnValue({
                success: false,
                response: NextResponse.json(
                    { error: 'Quiz answers are required' },
                    { status: 400 }
                ),
            });

            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: { ...validBody, answers: [] },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(400);
            expect(data.error).toBeDefined();
        });
    });

    // -----------------------------------------------------------------------
    // 3. User not found
    // -----------------------------------------------------------------------
    describe('User Not Found', () => {
        it('should return 404 when user does not exist', async () => {
            mockResolveUserByIdentifier.mockResolvedValue(null);

            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: validBody,
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('User not found');
        });
    });

    // -----------------------------------------------------------------------
    // 4. Course not found
    // -----------------------------------------------------------------------
    describe('Course Not Found', () => {
        it('should return 404 when course does not exist', async () => {
            mockGetRecords
                .mockReset()
                .mockResolvedValueOnce([]);  // courses — empty

            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: validBody,
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toBe('Course not found');
        });
    });

    // -----------------------------------------------------------------------
    // 5. Quiz questions not found
    // -----------------------------------------------------------------------
    describe('Quiz Questions Not Found', () => {
        it('should return 404 when no quiz questions exist for the course', async () => {
            mockGetRecords
                .mockReset()
                .mockResolvedValueOnce([mockCourse])  // courses — found
                .mockResolvedValueOnce([]);            // quiz — empty (fallback)

            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: validBody,
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.error).toContain('Quiz questions not found');
        });
    });

    // -----------------------------------------------------------------------
    // 6. Database error handling
    // -----------------------------------------------------------------------
    describe('Database Error Handling', () => {
        it('should return 500 when quiz submission insert fails', async () => {
            mockInsert.mockResolvedValue({
                data: null,
                error: { message: 'Database write failed', code: '42501' },
            });

            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: validBody,
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toBe('Failed to save quiz attempt');
        });

        it('should return 500 when resolveUserByIdentifier throws', async () => {
            mockResolveUserByIdentifier.mockRejectedValue(
                new Error('Database connection lost')
            );

            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: validBody,
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toBe('Failed to save quiz attempt');
        });

        it('should return 500 when getRecords throws for courses', async () => {
            mockGetRecords
                .mockReset()
                .mockRejectedValueOnce(new Error('Notion API timeout'));

            const request = createMockNextRequest('POST', '/api/quiz/submit', {
                body: validBody,
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toBe('Failed to save quiz attempt');
        });
    });
});
