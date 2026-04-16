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
 * The route now requires admin authentication via access_token cookie + jwt verify.
 * It uses adminDb (Supabase-style) queries, not DatabaseService.getRecords.
 */

import { NextRequest } from 'next/server';
import { sign } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-purposes-only';

// Table data storage for mock adminDb queries
let tableData: Record<string, any[]> = {};

// Mock adminDb — safeQuery uses adminDb.from(table).select(...).eq(...).gte(...).order(...).limit(...)
const mockQueryChain = () => {
    let currentTable = '';
    let currentFilters: Record<string, any> = {};
    const chain: any = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn((key: string, value: any) => {
            currentFilters[key] = value;
            return chain;
        }),
        gte: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
    };

    // Resolve based on table name and filters
    Object.defineProperty(chain, 'then', {
        get() {
            return (resolve: any) => {
                let data = tableData[currentTable] || [];
                // Apply eq filters
                for (const [key, value] of Object.entries(currentFilters)) {
                    data = data.filter((item: any) => item[key] === value);
                }
                resolve({ data, error: null });
            };
        },
    });

    // Store table setter
    chain._setTable = (table: string) => {
        currentTable = table;
        currentFilters = {};
    };

    return chain;
};

const mockFrom = jest.fn((table: string) => {
    const chain = mockQueryChain();
    chain._setTable(table);
    return chain;
});

jest.mock('@/lib/database', () => ({
    adminDb: {
        from: (...args: any[]) => mockFrom(...args),
    },
}));

// Mock api-middleware — withCacheHeaders is just a passthrough
jest.mock('@/lib/api-middleware', () => ({
    withCacheHeaders: (response: any) => response,
}));

import { GET } from '@/app/api/admin/dashboard/route';

// Helper to create an admin-authenticated NextRequest
function createAdminRequest(url = '/api/admin/dashboard'): NextRequest {
    const token = sign(
        { userId: 'admin-1', email: 'admin@example.com', role: 'admin' },
        JWT_SECRET,
        { expiresIn: '15m' }
    );

    const fullUrl = url.startsWith('http') ? url : `http://localhost:3000${url}`;
    const req = new NextRequest(fullUrl, {
        method: 'GET',
        headers: { Cookie: `access_token=${token}` },
    });

    return req;
}

// Helper to set up mock data for all tables
function setupMockDatabase(data: Record<string, any[]>) {
    tableData = { ...data };
}

describe('GET /api/admin/dashboard', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        tableData = {};
    });

    describe('Authentication', () => {
        it('should return 401 when no access_token cookie is present', async () => {
            const req = new NextRequest('http://localhost:3000/api/admin/dashboard');

            const response = await GET(req);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBe('Unauthorized');
        });

        it('should return 401 when token has non-admin role', async () => {
            const token = sign(
                { userId: 'user-1', email: 'user@example.com', role: 'user' },
                JWT_SECRET,
                { expiresIn: '15m' }
            );

            const req = new NextRequest('http://localhost:3000/api/admin/dashboard', {
                method: 'GET',
                headers: { Cookie: `access_token=${token}` },
            });

            const response = await GET(req);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBe('Unauthorized');
        });
    });

    describe('Successful Dashboard Access', () => {
        it('should return dashboard stats with all KPI fields', async () => {
            setupMockDatabase({
                users: [
                    { id: 'user-1', email: 'student1@example.com', role: 'user' },
                    { id: 'user-2', email: 'student2@example.com', role: 'user' },
                ],
                courses: [
                    { id: 'course-1', title: 'Course 1', created_by: 'user-1', created_at: new Date().toISOString() },
                ],
                quiz_submissions: [
                    { id: 'quiz-1', user_id: 'user-1', is_correct: true, created_at: new Date().toISOString() },
                    { id: 'quiz-2', user_id: 'user-1', is_correct: false, created_at: new Date().toISOString() },
                ],
                discussion_sessions: [
                    { id: 'disc-1', user_id: 'user-1', status: 'completed', learning_goals: [], created_at: new Date().toISOString() },
                ],
                jurnal: [
                    { id: 'journal-1', user_id: 'user-1', created_at: new Date().toISOString() },
                ],
                challenge_responses: [
                    { id: 'challenge-1', user_id: 'user-1', question: 'Test challenge', created_at: new Date().toISOString() },
                ],
                ask_question_history: [
                    { id: 'ask-1', user_id: 'user-1', question: 'What is X?', created_at: new Date().toISOString() },
                ],
                feedback: [
                    { id: 'fb-1', user_id: 'user-1', rating: 4, created_at: new Date().toISOString() },
                    { id: 'fb-2', user_id: 'user-2', rating: 5, created_at: new Date().toISOString() },
                ],
                transcript: [],
                learning_profiles: [],
                prompt_classifications: [],
                cognitive_indicators: [],
            });

            const request = createAdminRequest();

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
            expect(data.kpi.totalJournals).toBe(3);
            expect(data.kpi.totalChallenges).toBe(1);
            expect(data.kpi.totalAskQuestions).toBe(1);
            expect(data.kpi.totalFeedbacks).toBe(2);
            expect(data.kpi.avgRating).toBeGreaterThan(0);
        });

        it('should merge jurnal and feedback mirrors without double counting', async () => {
            const now = new Date().toISOString();
            setupMockDatabase({
                users: [
                    { id: 'user-1', email: 'student1@example.com', role: 'user', created_at: now },
                ],
                courses: [],
                quiz_submissions: [],
                discussion_sessions: [],
                jurnal: [
                    {
                        id: 'journal-1',
                        user_id: 'user-1',
                        course_id: 'course-1',
                        subtopic_id: 'subtopic-1',
                        subtopic_label: 'Intro',
                        module_index: 1,
                        subtopic_index: 1,
                        type: 'structured_reflection',
                        content: JSON.stringify({
                            understood: 'Saya paham',
                            confused: '',
                            strategy: '',
                            promptEvolution: '',
                            contentRating: 5,
                            contentFeedback: 'Sangat membantu',
                        }),
                        reflection: JSON.stringify({
                            subtopic: 'Intro',
                            moduleIndex: 1,
                            subtopicIndex: 1,
                            subtopicId: 'subtopic-1',
                            fields: {
                                understood: 'Saya paham',
                                confused: '',
                                strategy: '',
                                promptEvolution: '',
                                contentRating: 5,
                                contentFeedback: 'Sangat membantu',
                            },
                        }),
                        created_at: now,
                    },
                ],
                challenge_responses: [],
                ask_question_history: [],
                feedback: [
                    {
                        id: 'feedback-1',
                        user_id: 'user-1',
                        course_id: 'course-1',
                        subtopic_id: 'subtopic-1',
                        subtopic_label: 'Intro',
                        module_index: 1,
                        subtopic_index: 1,
                        rating: 5,
                        comment: 'Sangat membantu',
                        created_at: new Date(Date.now() + 1000).toISOString(),
                    },
                ],
                transcript: [],
                learning_profiles: [],
                prompt_classifications: [],
                cognitive_indicators: [],
            });

            const request = createAdminRequest();
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.kpi.totalJournals).toBe(1);
            expect(data.kpi.totalFeedbacks).toBe(1);
            expect(data.kpi.avgRating).toBe(5);
            expect(data.recentActivity).toHaveLength(1);
            expect(data.recentActivity[0].type).toBe('journal');
        });

        it('should return student summary for each user', async () => {
            setupMockDatabase({
                users: [
                    { id: 'user-1', email: 'student1@example.com', role: 'user', created_at: new Date().toISOString() },
                ],
                courses: [
                    { id: 'course-1', title: 'Course 1', created_by: 'user-1', created_at: new Date().toISOString() },
                ],
                quiz_submissions: [],
                discussion_sessions: [],
                jurnal: [],
                challenge_responses: [],
                ask_question_history: [],
                feedback: [],
                transcript: [],
                learning_profiles: [],
                prompt_classifications: [],
                cognitive_indicators: [],
            });

            const request = createAdminRequest();

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
                ask_question_history: [
                    {
                        id: 'ask-1',
                        user_id: 'user-1',
                        question: 'What?',
                        prompt_components: { tujuan: 'test' },
                        created_at: new Date().toISOString(),
                    },
                    {
                        id: 'ask-2',
                        user_id: 'user-2',
                        question: 'How?',
                        prompt_components: { tujuan: 'test', konteks: 'context', batasan: 'limits' },
                        created_at: new Date().toISOString(),
                    },
                ],
                feedback: [],
                transcript: [],
                learning_profiles: [],
                prompt_classifications: [],
                cognitive_indicators: [],
            });

            const request = createAdminRequest();

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
                    { id: 'q1', user_id: 'u1', is_correct: true, created_at: new Date().toISOString() },
                    { id: 'q2', user_id: 'u1', is_correct: true, created_at: new Date().toISOString() },
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
                        created_at: new Date().toISOString(),
                    },
                ],
                jurnal: [],
                challenge_responses: [
                    { id: 'c1', user_id: 'u1', question: 'Q', created_at: new Date().toISOString() },
                ],
                ask_question_history: [],
                feedback: [],
                transcript: [],
                learning_profiles: [],
                prompt_classifications: [],
                cognitive_indicators: [],
            });

            const request = createAdminRequest();

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
                    { id: 'user-1', email: 'student@example.com', role: 'user', created_at: now },
                ],
                courses: [
                    { id: 'c1', title: 'Course 1', created_by: 'user-1', created_at: now },
                ],
                quiz_submissions: [
                    { id: 'q1', user_id: 'user-1', is_correct: true, created_at: now },
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
                transcript: [],
                learning_profiles: [],
                prompt_classifications: [],
                cognitive_indicators: [],
            });

            const request = createAdminRequest();

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.recentActivity).toBeDefined();
            expect(Array.isArray(data.recentActivity)).toBe(true);
            expect(data.recentActivity.length).toBeGreaterThan(0);
            expect(data.recentActivity.length).toBeLessThanOrEqual(15);
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
                transcript: [],
                learning_profiles: [],
                prompt_classifications: [],
                cognitive_indicators: [],
            });

            const request = createAdminRequest();

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
            // Make adminDb.from throw — safeQuery catches exceptions and returns []
            // so the route returns 200 with empty data rather than 500
            mockFrom.mockImplementation(() => {
                throw new Error('Database connection failed');
            });

            const request = createAdminRequest();

            const response = await GET(request);
            const data = await response.json();

            // safeQuery is resilient — returns empty arrays on failure
            // so the dashboard still renders with zero counts
            expect(response.status).toBe(200);
            expect(data.kpi).toBeDefined();
            expect(data.kpi.activeStudents).toBe(0);
            expect(data.kpi.totalCourses).toBe(0);
        });
    });
});
