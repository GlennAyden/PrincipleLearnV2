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

// Mock auth service — getCurrentUser and resolveUserByIdentifier
const mockGetCurrentUser = jest.fn();
const mockResolveUserByIdentifier = jest.fn();
jest.mock('@/services/auth.service', () => ({
    getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
    resolveUserByIdentifier: (...args: any[]) => mockResolveUserByIdentifier(...args),
}));

// Mock course service — listUserCourses
const mockListUserCourses = jest.fn();
jest.mock('@/services/course.service', () => ({
    listUserCourses: (...args: any[]) => mockListUserCourses(...args),
}));

import { GET } from '@/app/api/courses/route';

describe('GET /api/courses', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        mockGetCurrentUser.mockResolvedValue(null);
        mockResolveUserByIdentifier.mockResolvedValue(null);
        mockListUserCourses.mockResolvedValue([]);
    });

    describe('Cookie-based Auth (Primary)', () => {
        it('should return courses when authenticated via cookie', async () => {
            // getCurrentUser returns authenticated user
            mockGetCurrentUser.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
            });

            // listUserCourses returns formatted courses
            mockListUserCourses.mockResolvedValue([
                {
                    id: TEST_COURSE.id,
                    title: TEST_COURSE.title,
                    level: TEST_COURSE.difficulty_level,
                },
            ]);

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
            mockListUserCourses.mockResolvedValue([
                {
                    id: TEST_COURSE.id,
                    title: TEST_COURSE.title,
                    level: TEST_COURSE.difficulty_level,
                },
            ]);

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
            mockResolveUserByIdentifier.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
            });

            mockListUserCourses.mockResolvedValue([
                {
                    id: TEST_COURSE.id,
                    title: TEST_COURSE.title,
                    level: TEST_COURSE.difficulty_level,
                },
            ]);

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
            mockResolveUserByIdentifier.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
            });

            mockListUserCourses.mockResolvedValue([
                {
                    id: TEST_COURSE.id,
                    title: TEST_COURSE.title,
                    level: 'beginner',
                },
            ]);

            const request = new Request(
                `http://localhost:3000/api/courses?userEmail=${encodeURIComponent(TEST_STUDENT.email)}`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.courses).toHaveLength(1);
        });

        it('should return multiple courses', async () => {
            mockResolveUserByIdentifier.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
            });

            mockListUserCourses.mockResolvedValue([
                {
                    id: TEST_COURSE_ADVANCED.id,
                    title: TEST_COURSE_ADVANCED.title,
                    level: TEST_COURSE_ADVANCED.difficulty_level,
                },
                {
                    id: TEST_COURSE.id,
                    title: TEST_COURSE.title,
                    level: TEST_COURSE.difficulty_level,
                },
            ]);

            const request = new Request(
                `http://localhost:3000/api/courses?userId=${TEST_STUDENT.id}`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.courses).toHaveLength(2);
        });

        it('should return empty array when user has no courses', async () => {
            mockResolveUserByIdentifier.mockResolvedValue({
                id: TEST_STUDENT_2.id,
                email: TEST_STUDENT_2.email,
            });

            mockListUserCourses.mockResolvedValue([]);

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
            mockResolveUserByIdentifier.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
            });

            // listUserCourses already handles the default via course.service
            mockListUserCourses.mockResolvedValue([
                {
                    id: 'course-no-level',
                    title: 'No Level Course',
                    level: 'Beginner', // course.service defaults null to 'Beginner'
                },
            ]);

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
            mockResolveUserByIdentifier.mockResolvedValue(null);

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
            mockResolveUserByIdentifier.mockResolvedValue(null);

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
            mockResolveUserByIdentifier.mockRejectedValue(new Error('Database connection refused'));

            const request = new Request(
                `http://localhost:3000/api/courses?userId=${TEST_STUDENT.id}`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.success).toBe(false);
            expect(data.error).toBeDefined();
        });

        it('should return 500 when listUserCourses fails', async () => {
            mockGetCurrentUser.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
            });

            mockListUserCourses.mockRejectedValue(new Error('Table not found'));

            const request = new Request(
                `http://localhost:3000/api/courses`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.success).toBe(false);
        });
    });

    describe('Edge Cases', () => {
        it('should prefer cookie auth over query params when both are available', async () => {
            // getCurrentUser returns authenticated user (cookie auth succeeds)
            mockGetCurrentUser.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
            });

            mockListUserCourses.mockResolvedValue([]);

            // Even though userId is in query params, cookie auth should take priority
            const request = new Request(
                `http://localhost:3000/api/courses?userId=some-other-id`
            );

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);

            // Verify listUserCourses was called for the cookie user, not the query param user
            expect(mockListUserCourses).toHaveBeenCalledWith(TEST_STUDENT.id);
        });
    });
});
