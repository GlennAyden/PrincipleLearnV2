/**
 * API Tests for /api/admin/dashboard endpoint
 *
 * Tests:
 * - Successful retrieval of dashboard stats
 * - KPI data structure
 * - RM2/RM3 metrics
 * - Student summary
 * - Edge cases (empty data, DB errors)
 *
 * NOTE: This route does NOT have auth middleware — it returns data for any request.
 * Auth checks should be added at the middleware or route level if needed.
 */

import { createMockNextRequest } from '../../setup/test-utils';

// Mock the database module — named export DatabaseService with static methods
const mockGetRecords = jest.fn();
jest.mock('@/lib/database', () => ({
    DatabaseService: {
        getRecords: (...args: any[]) => mockGetRecords(...args),
    },
    adminDb: {
        from: jest.fn(() => ({
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

import { GET } from '@/app/api/admin/dashboard/route';

/**
 * Helper: set up mockGetRecords to return data based on table name
 */
function setupMockDatabase(tableData: Record<string, any[]>) {
    mockGetRecords.mockImplementation((table: string) => {
        return Promise.resolve(tableData[table] || []);
    });
}

describe('GET /api/admin/dashboard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Successful Dashboard Access', () => {
        it('should return dashboard stats with all KPI fields', async () => {
            setupMockDatabase({
                users: [
                    { id: 'user-1', email: 'student1@example.com', role: 'USER' },
                    { id: 'user-2', email: 'student2@example.com', role: 'USER' },
                ],
                courses: [
                    { id: 'course-1', title: 'Course 1', user_id: 'user-1', created_at: new Date().toISOString() },
                ],
                quiz_submissions: [
                    { id: 'quiz-1', user_id: 'user-1', is_correct: true, submitted_at: new Date().toISOString() },
                    { id: 'quiz-2', user_id: 'user-1', is_correct: false, submitted_at: new Date().toISOString() },
                ],
                discussion_sessions: [
                    { id: 'disc-1', user_id: 'user-1', status: 'completed', learning_goals: [] },
                ],
                jurnal: [
                    { id: 'journal-1', user_id: 'user-1' },
                ],
                challenge_responses: [
                    { id: 'challenge-1', user_id: 'user-1', question: 'Test challenge', created_at: new Date().toISOString() },
                ],
                ask_question_history: [
                    { id: 'ask-1', user_id: 'user-1', question: 'What is X?', created_at: new Date().toISOString() },
                ],
                feedback: [
                    { id: 'fb-1', user_id: 'user-1', rating: 4 },
                    { id: 'fb-2', user_id: 'user-2', rating: 5 },
                ],
                course_generation_activity: [],
            });

            const request = createMockNextRequest('GET', '/api/admin/dashboard');

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);

            // Check KPI structure
            expect(data.kpi).toBeDefined();
            expect(data.kpi.activeStudents).toBe(2);
            expect(data.kpi.totalCourses).toBe(1);
            expect(data.kpi.quizAccuracy).toBe(50);
            expect(data.kpi.totalDiscussions).toBe(1);
            expect(data.kpi.completedDiscussions).toBe(1);
            expect(data.kpi.totalJournals).toBe(1);
            expect(data.kpi.totalChallenges).toBe(1);
            expect(data.kpi.totalAskQuestions).toBe(1);
            expect(data.kpi.totalFeedbacks).toBe(2);
            expect(data.kpi.avgRating).toBeGreaterThan(0);
        });

        it('should return student summary for each user', async () => {
            setupMockDatabase({
                users: [
                    { id: 'user-1', email: 'student1@example.com', role: 'USER' },
                ],
                courses: [
                    { id: 'course-1', title: 'Course 1', user_id: 'user-1', created_at: new Date().toISOString() },
                ],
                quiz_submissions: [],
                discussion_sessions: [],
                jurnal: [],
                challenge_responses: [],
                ask_question_history: [],
                feedback: [],
                course_generation_activity: [],
            });

            const request = createMockNextRequest('GET', '/api/admin/dashboard');

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.studentSummary).toBeDefined();
            expect(Array.isArray(data.studentSummary)).toBe(true);
            expect(data.studentSummary.length).toBe(1);
            expect(data.studentSummary[0].email).toBe('student1@example.com');
            expect(data.studentSummary[0].courses).toBe(1);
        });

        it('should return RM2 prompt stage distribution', async () => {
            setupMockDatabase({
                users: [],
                courses: [],
                quiz_submissions: [],
                discussion_sessions: [],
                jurnal: [],
                challenge_responses: [],
                ask_question_history: [],
                feedback: [],
                course_generation_activity: [
                    {
                        id: 'log-1',
                        user_id: 'user-1',
                        steps: {
                            step1: { topic: 'Math', goal: 'Learn algebra' },
                            step2: { level: 'beginner', extraTopics: '' },
                            step3: { problem: '', assumption: '' },
                        },
                    },
                    {
                        id: 'log-2',
                        user_id: 'user-2',
                        steps: {
                            step1: { topic: 'Science', goal: 'Learn physics' },
                            step2: { level: 'intermediate', extraTopics: 'Quantum' },
                            step3: { problem: 'Understanding waves', assumption: 'Basic math knowledge' },
                        },
                    },
                ],
            });

            const request = createMockNextRequest('GET', '/api/admin/dashboard');

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.rm2).toBeDefined();
            expect(data.rm2.stages).toBeDefined();
            expect(data.rm2.totalPrompts).toBe(2);
        });

        it('should return RM3 critical thinking metrics', async () => {
            setupMockDatabase({
                users: [],
                courses: [],
                quiz_submissions: [
                    { id: 'q1', user_id: 'u1', is_correct: true },
                    { id: 'q2', user_id: 'u1', is_correct: true },
                ],
                discussion_sessions: [
                    {
                        id: 'd1',
                        user_id: 'u1',
                        status: 'completed',
                        learning_goals: [
                            { name: 'Goal 1', covered: true },
                            { name: 'Goal 2', covered: false },
                        ],
                    },
                ],
                jurnal: [],
                challenge_responses: [
                    { id: 'c1', user_id: 'u1', question: 'Q', created_at: new Date().toISOString() },
                ],
                ask_question_history: [],
                feedback: [],
                course_generation_activity: [],
            });

            const request = createMockNextRequest('GET', '/api/admin/dashboard');

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.rm3).toBeDefined();
            expect(data.rm3.totalGoals).toBe(2);
            expect(data.rm3.coveredGoals).toBe(1);
            expect(data.rm3.ctCoverageRate).toBe(50);
            expect(data.rm3.quizAccuracy).toBe(100);
        });

        it('should return recent activity feed', async () => {
            const now = new Date().toISOString();
            setupMockDatabase({
                users: [
                    { id: 'user-1', email: 'student@example.com', role: 'USER' },
                ],
                courses: [
                    { id: 'c1', title: 'Course 1', user_id: 'user-1', created_at: now },
                ],
                quiz_submissions: [
                    { id: 'q1', user_id: 'user-1', is_correct: true, submitted_at: now },
                ],
                discussion_sessions: [],
                jurnal: [],
                challenge_responses: [
                    { id: 'ch1', user_id: 'user-1', question: 'Challenge Q', created_at: now },
                ],
                ask_question_history: [
                    { id: 'a1', user_id: 'user-1', question: 'Ask Q', created_at: now },
                ],
                feedback: [],
                course_generation_activity: [],
            });

            const request = createMockNextRequest('GET', '/api/admin/dashboard');

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.recentActivity).toBeDefined();
            expect(Array.isArray(data.recentActivity)).toBe(true);
            expect(data.recentActivity.length).toBeGreaterThan(0);
            expect(data.recentActivity.length).toBeLessThanOrEqual(10);
        });
    });

    describe('Empty Data', () => {
        it('should handle empty database gracefully', async () => {
            setupMockDatabase({
                users: [],
                courses: [],
                quiz_submissions: [],
                discussion_sessions: [],
                jurnal: [],
                challenge_responses: [],
                ask_question_history: [],
                feedback: [],
                course_generation_activity: [],
            });

            const request = createMockNextRequest('GET', '/api/admin/dashboard');

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.kpi.activeStudents).toBe(0);
            expect(data.kpi.totalCourses).toBe(0);
            expect(data.kpi.quizAccuracy).toBe(0);
            expect(data.kpi.avgRating).toBe(0);
            expect(data.studentSummary).toEqual([]);
            expect(data.recentActivity).toEqual([]);
        });
    });

    describe('Edge Cases', () => {
        it('should handle database errors gracefully', async () => {
            mockGetRecords.mockRejectedValue(new Error('Database connection failed'));

            const request = createMockNextRequest('GET', '/api/admin/dashboard');

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.message).toBeDefined();
        });
    });
});
