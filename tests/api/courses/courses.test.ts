/**
 * API Tests for GET /api/courses
 *
 * Tests:
 * - Returns courses via cookie-based auth (primary)
 * - Returns courses via x-user-id header (fallback)
 * - Returns courses for a valid userId query param (legacy)
 * - Returns courses for a valid userEmail query param (legacy)
 * - Returns 401 when no auth method is provided
 * - Returns 404 when user is not found by userId
 * - Returns 404 when user is not found by userEmail
 * - Returns empty array when user has no courses
 * - Formats courses correctly (id, title, level)
 * - Defaults level to 'Beginner' when difficulty_level is missing
 * - Handles database errors gracefully (500)
 */

import { TEST_STUDENT, TEST_STUDENT_2 } from '../../fixtures/users.fixture';
import { TEST_COURSE, TEST_COURSE_ADVANCED } from '../../fixtures/courses.fixture';

// Mock the database module
const mockGetRecords = jest.fn();
jest.mock('@/lib/database', () => ({
    DatabaseService: {
        getRecords: (...args: any[]) => mockGetRecords(...args),
    },
}));

// Mock next/headers cookies
const mockCookieGet = jest.fn();
jest.mock('next/headers', () => ({
    cookies: jest.fn(async () => ({
        get: (name: string) => mockCookieGet(name),
    })),
}));

// Mock jwt verification
const mockVerifyToken = jest.fn();
jest.mock('@/lib/jwt', () => ({
    verifyToken: (...args: any[]) => mockVerifyToken(...args),
}));

import { GET } from '@/app/api/courses/route';

describe('GET /api/courses', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockCookieGet.mockReturnValue(undefined);
        mockVerifyToken.mockReturnValue(null);
    });

    describe('Cookie-based Auth (Primary)', () => {
        it('should return courses when authenticated via cookie', async () => {
            // Mock cookie auth
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'valid-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue({ userId: TEST_STUDENT.id, email: TEST_STUDENT.email, role: 'user' });

            mockGetRecords.mockImplementation((table: string, opts: any) => {
                if (table === 'users') {
                    if (opts?.filter?.id === TEST_STUDENT.id) {
                        return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email }];
                    }
                    return [];
                }
                if (table === 'courses') {
                    return [
                        {
                            id: TEST_COURSE.id,
                            title: TEST_COURSE.title,
                            difficulty_level: TEST_COURSE.difficulty_level,
                            created_by: TEST_STUDENT.id,
                            created_at: '2026-01-01T00:00:00Z',
                        },
                    ];
                }
                return [];
            });

            const request = new Request('http://localhost:3000/api/courses');
            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.courses).toHaveLength(1);
            expect(data.courses[0]).toEqual({
                id: TEST_COURSE.id,
                title: TEST_COURSE.title,
                level: TEST_COURSE.difficulty_level,
            });
        });
    });

    describe('Header-based Auth (Fallback)', () => {
        it('should return courses when x-user-id header is present', async () => {
            mockGetRecords.mockImplementation((table: string, opts: any) => {
                if (table === 'courses') {
                    return [
                        {
                            id: TEST_COURSE.id,
                            title: TEST_COURSE.title,
                            difficulty_level: TEST_COURSE.difficulty_level,
                            created_by: TEST_STUDENT.id,
                            created_at: '2026-01-01T00:00:00Z',
                        },
                    ];
                }
                return [];
            });

            const request = new Request('http://localhost:3000/api/courses', {
                headers: { 'x-user-id': TEST_STUDENT.id },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.courses).toHaveLength(1);
        });
    });

    describe('Legacy Query Params (Backward Compatibility)', () => {
        it('should return courses for a valid userId query param', async () => {
            mockGetRecords.mockImplementation((table: string, opts: any) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email }];
                }
                if (table === 'courses') {
                    return [
                        {
                            id: TEST_COURSE.id,
                            title: TEST_COURSE.title,
                            difficulty_level: TEST_COURSE.difficulty_level,
                            created_by: TEST_STUDENT.id,
                            created_at: '2026-01-01T00:00:00Z',
                        },
                    ];
                }
                return [];
            });

            const request = new Request(
                `http://localhost:3000/api/courses?userId=${TEST_STUDENT.id}`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.courses).toHaveLength(1);
        });

        it('should return courses for a valid userEmail query param (legacy)', async () => {
            mockGetRecords.mockImplementation((table: string, opts: any) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email }];
                }
                if (table === 'courses') {
                    return [
                        {
                            id: TEST_COURSE.id,
                            title: TEST_COURSE.title,
                            difficulty_level: 'beginner',
                            created_by: TEST_STUDENT.id,
                            created_at: '2026-01-01T00:00:00Z',
                        },
                    ];
                }
                return [];
            });

            const request = new Request(
                `http://localhost:3000/api/courses?userEmail=${encodeURIComponent(TEST_STUDENT.email)}`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.courses).toHaveLength(1);
        });

        it('should return multiple courses ordered by created_at desc', async () => {
            mockGetRecords.mockImplementation((table: string) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email }];
                }
                if (table === 'courses') {
                    return [
                        {
                            id: TEST_COURSE_ADVANCED.id,
                            title: TEST_COURSE_ADVANCED.title,
                            difficulty_level: TEST_COURSE_ADVANCED.difficulty_level,
                            created_by: TEST_STUDENT.id,
                            created_at: '2026-02-01T00:00:00Z',
                        },
                        {
                            id: TEST_COURSE.id,
                            title: TEST_COURSE.title,
                            difficulty_level: TEST_COURSE.difficulty_level,
                            created_by: TEST_STUDENT.id,
                            created_at: '2026-01-01T00:00:00Z',
                        },
                    ];
                }
                return [];
            });

            const request = new Request(
                `http://localhost:3000/api/courses?userId=${TEST_STUDENT.id}`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.courses).toHaveLength(2);

            // Verify getRecords was called with orderBy
            const coursesCall = mockGetRecords.mock.calls.find(
                (call: any[]) => call[0] === 'courses'
            );
            expect(coursesCall[1]).toMatchObject({
                orderBy: { column: 'created_at', ascending: false },
            });
        });

        it('should return empty array when user has no courses', async () => {
            mockGetRecords.mockImplementation((table: string) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT_2.id, email: TEST_STUDENT_2.email }];
                }
                if (table === 'courses') {
                    return [];
                }
                return [];
            });

            const request = new Request(
                `http://localhost:3000/api/courses?userId=${TEST_STUDENT_2.id}`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.courses).toEqual([]);
        });

        it('should default level to Beginner when difficulty_level is missing', async () => {
            mockGetRecords.mockImplementation((table: string) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email }];
                }
                if (table === 'courses') {
                    return [
                        {
                            id: 'course-no-level',
                            title: 'No Level Course',
                            difficulty_level: null,
                            created_by: TEST_STUDENT.id,
                            created_at: '2026-01-01T00:00:00Z',
                        },
                    ];
                }
                return [];
            });

            const request = new Request(
                `http://localhost:3000/api/courses?userId=${TEST_STUDENT.id}`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.courses[0].level).toBe('Beginner');
        });
    });

    describe('Validation Errors', () => {
        it('should return 401 when no auth method is provided', async () => {
            const request = new Request('http://localhost:3000/api/courses');

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.success).toBe(false);
            expect(data.error).toContain('Authentication required');
        });

        it('should return 404 when user is not found by userId', async () => {
            mockGetRecords.mockResolvedValue([]);

            const request = new Request(
                'http://localhost:3000/api/courses?userId=nonexistent-id'
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.success).toBe(false);
            expect(data.error).toContain('User not found');
        });

        it('should return 404 when user is not found by userEmail', async () => {
            mockGetRecords.mockResolvedValue([]);

            const request = new Request(
                'http://localhost:3000/api/courses?userEmail=nobody@example.com'
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.success).toBe(false);
            expect(data.error).toContain('User not found');
        });
    });

    describe('Database Errors', () => {
        it('should return 500 when database query fails', async () => {
            mockGetRecords.mockRejectedValue(new Error('Database connection refused'));

            const request = new Request(
                `http://localhost:3000/api/courses?userId=${TEST_STUDENT.id}`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.success).toBe(false);
            expect(data.error).toBeDefined();
        });

        it('should include error message in 500 response', async () => {
            mockGetRecords.mockRejectedValue(new Error('Table not found'));

            const request = new Request(
                `http://localhost:3000/api/courses?userId=${TEST_STUDENT.id}`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toBe('Table not found');
        });
    });

    describe('Edge Cases', () => {
        it('should prefer cookie auth over query params when both are available', async () => {
            // Mock cookie auth
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'valid-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue({ userId: TEST_STUDENT.id, email: TEST_STUDENT.email, role: 'user' });

            mockGetRecords.mockImplementation((table: string, opts: any) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email }];
                }
                if (table === 'courses') {
                    return [];
                }
                return [];
            });

            // Even though userId is in query params, cookie auth should take priority
            const request = new Request(
                `http://localhost:3000/api/courses?userId=some-other-id`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);

            // Verify courses were fetched for the cookie user, not the query param user
            const coursesCall = mockGetRecords.mock.calls.find(
                (call: any[]) => call[0] === 'courses'
            );
            expect(coursesCall[1].filter.created_by).toBe(TEST_STUDENT.id);
        });
    });
});
