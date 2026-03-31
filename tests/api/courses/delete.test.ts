/**
 * API Tests for DELETE /api/courses/[id]
 *
 * Tests:
 * - Successfully deletes a course when owner requests it
 * - Successfully deletes a course when admin requests it
 * - Returns 401 when no access_token cookie is present
 * - Returns 401 when access_token is invalid/expired
 * - Returns 404 when course does not exist
 * - Returns 403 when non-owner, non-admin tries to delete
 * - Handles database errors gracefully (500)
 */

import { TEST_STUDENT, TEST_STUDENT_2, TEST_ADMIN } from '../../fixtures/users.fixture';
import { TEST_COURSE, ADMIN_COURSE } from '../../fixtures/courses.fixture';

// Mock the database module
const mockGetRecords = jest.fn();
const mockDeleteRecord = jest.fn();
jest.mock('@/lib/database', () => ({
    DatabaseService: {
        getRecords: (...args: any[]) => mockGetRecords(...args),
        deleteRecord: (...args: any[]) => mockDeleteRecord(...args),
    },
}));

// Mock JWT module
const mockVerifyToken = jest.fn();
jest.mock('@/lib/jwt', () => ({
    verifyToken: (...args: any[]) => mockVerifyToken(...args),
}));

// Mock next/headers cookies
const mockCookiesGet = jest.fn();
jest.mock('next/headers', () => ({
    cookies: jest.fn(async () => ({
        get: (name: string) => mockCookiesGet(name),
    })),
}));

import { DELETE, GET } from '@/app/api/courses/[id]/route';

// Helper to create a mock request with params
function createDeleteRequest(courseId: string): Request {
    return new Request(`http://localhost:3000/api/courses/${courseId}`, {
        method: 'DELETE',
    });
}

function createGetRequest(courseId: string): Request {
    return new Request(`http://localhost:3000/api/courses/${courseId}`, {
        method: 'GET',
    });
}

function createParams(id: string): { params: Promise<{ id: string }> } {
    return { params: Promise.resolve({ id }) };
}

describe('DELETE /api/courses/[id]', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Successful Deletion', () => {
        it('should delete course when owner requests it', async () => {
            // Auth: valid token for student
            mockCookiesGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'valid-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            // DB calls
            mockGetRecords.mockImplementation((table: string, opts: any) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email, role: 'user' }];
                }
                if (table === 'courses') {
                    return [{
                        id: TEST_COURSE.id,
                        title: TEST_COURSE.title,
                        created_by: TEST_STUDENT.id,
                    }];
                }
                return [];
            });
            mockDeleteRecord.mockResolvedValue(undefined);

            const request = createDeleteRequest(TEST_COURSE.id);
            const response = await DELETE(request, createParams(TEST_COURSE.id));
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.message).toContain('deleted');
            expect(mockDeleteRecord).toHaveBeenCalledWith('courses', TEST_COURSE.id);
        });

        it('should allow admin to delete any course', async () => {
            // Auth: valid token for admin
            mockCookiesGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'admin-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue({
                userId: TEST_ADMIN.id,
                email: TEST_ADMIN.email,
                role: 'ADMIN',
            });

            // DB calls
            mockGetRecords.mockImplementation((table: string, opts: any) => {
                if (table === 'users') {
                    return [{ id: TEST_ADMIN.id, email: TEST_ADMIN.email, role: 'ADMIN' }];
                }
                if (table === 'courses') {
                    // Course created by student, but admin can delete
                    return [{
                        id: TEST_COURSE.id,
                        title: TEST_COURSE.title,
                        created_by: TEST_STUDENT.id,
                    }];
                }
                return [];
            });
            mockDeleteRecord.mockResolvedValue(undefined);

            const request = createDeleteRequest(TEST_COURSE.id);
            const response = await DELETE(request, createParams(TEST_COURSE.id));
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });
    });

    describe('Authentication Errors', () => {
        it('should return 401 when no access_token cookie is present', async () => {
            mockCookiesGet.mockReturnValue(undefined);

            const request = createDeleteRequest(TEST_COURSE.id);
            const response = await DELETE(request, createParams(TEST_COURSE.id));
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.success).toBe(false);
            expect(data.error).toContain('Authentication required');
        });

        it('should return 401 when access_token is invalid', async () => {
            mockCookiesGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'invalid-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue(null);

            const request = createDeleteRequest(TEST_COURSE.id);
            const response = await DELETE(request, createParams(TEST_COURSE.id));
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.success).toBe(false);
        });

        it('should return 401 when user no longer exists in database', async () => {
            mockCookiesGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'valid-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue({
                userId: 'deleted-user',
                email: 'deleted@example.com',
                role: 'user',
            });
            mockGetRecords.mockResolvedValue([]); // User not found

            const request = createDeleteRequest(TEST_COURSE.id);
            const response = await DELETE(request, createParams(TEST_COURSE.id));
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.success).toBe(false);
        });
    });

    describe('Authorization Errors', () => {
        it('should return 403 when non-owner non-admin tries to delete', async () => {
            // Auth: valid token for student 2
            mockCookiesGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'student2-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT_2.id,
                email: TEST_STUDENT_2.email,
                role: 'user',
            });

            // DB calls
            mockGetRecords.mockImplementation((table: string, opts: any) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT_2.id, email: TEST_STUDENT_2.email, role: 'user' }];
                }
                if (table === 'courses') {
                    // Course is owned by student 1, not student 2
                    return [{
                        id: TEST_COURSE.id,
                        title: TEST_COURSE.title,
                        created_by: TEST_STUDENT.id,
                    }];
                }
                return [];
            });

            const request = createDeleteRequest(TEST_COURSE.id);
            const response = await DELETE(request, createParams(TEST_COURSE.id));
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.success).toBe(false);
            expect(data.error).toContain('permission');
            expect(mockDeleteRecord).not.toHaveBeenCalled();
        });
    });

    describe('Not Found', () => {
        it('should return 404 when course does not exist', async () => {
            // Auth: valid
            mockCookiesGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'valid-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockGetRecords.mockImplementation((table: string) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email, role: 'user' }];
                }
                if (table === 'courses') {
                    return []; // Course not found
                }
                return [];
            });

            const request = createDeleteRequest('nonexistent-course');
            const response = await DELETE(request, createParams('nonexistent-course'));
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.success).toBe(false);
            expect(data.error).toContain('not found');
        });
    });

    describe('Database Errors', () => {
        it('should return 500 when deleteRecord fails', async () => {
            mockCookiesGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'valid-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockGetRecords.mockImplementation((table: string) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email, role: 'user' }];
                }
                if (table === 'courses') {
                    return [{
                        id: TEST_COURSE.id,
                        title: TEST_COURSE.title,
                        created_by: TEST_STUDENT.id,
                    }];
                }
                return [];
            });
            mockDeleteRecord.mockRejectedValue(new Error('Foreign key constraint'));

            const request = createDeleteRequest(TEST_COURSE.id);
            const response = await DELETE(request, createParams(TEST_COURSE.id));
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.success).toBe(false);
            expect(data.error).toBeDefined();
        });
    });
});

describe('GET /api/courses/[id]', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Successful Retrieval', () => {
        it('should return course with subtopics when owner requests it', async () => {
            mockCookiesGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'valid-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockGetRecords.mockImplementation((table: string) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email, role: 'user' }];
                }
                if (table === 'courses') {
                    return [{
                        id: TEST_COURSE.id,
                        title: TEST_COURSE.title,
                        description: TEST_COURSE.description,
                        subject: TEST_COURSE.subject,
                        difficulty_level: TEST_COURSE.difficulty_level,
                        created_by: TEST_STUDENT.id,
                        created_at: '2026-01-01T00:00:00Z',
                    }];
                }
                if (table === 'subtopics') {
                    return [
                        { id: 'sub-1', course_id: TEST_COURSE.id, title: 'Module 1', content: '{}', order_index: 0 },
                        { id: 'sub-2', course_id: TEST_COURSE.id, title: 'Module 2', content: '{}', order_index: 1 },
                    ];
                }
                return [];
            });

            const request = createGetRequest(TEST_COURSE.id);
            const response = await GET(request, createParams(TEST_COURSE.id));
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.course).toBeDefined();
            expect(data.course.id).toBe(TEST_COURSE.id);
            expect(data.course.subtopics).toHaveLength(2);
        });

        it('should allow admin to view any course', async () => {
            mockCookiesGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'admin-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue({
                userId: TEST_ADMIN.id,
                email: TEST_ADMIN.email,
                role: 'ADMIN',
            });

            mockGetRecords.mockImplementation((table: string) => {
                if (table === 'users') {
                    return [{ id: TEST_ADMIN.id, email: TEST_ADMIN.email, role: 'ADMIN' }];
                }
                if (table === 'courses') {
                    return [{
                        id: TEST_COURSE.id,
                        title: TEST_COURSE.title,
                        created_by: TEST_STUDENT.id, // owned by student
                    }];
                }
                if (table === 'subtopics') {
                    return [];
                }
                return [];
            });

            const request = createGetRequest(TEST_COURSE.id);
            const response = await GET(request, createParams(TEST_COURSE.id));
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });
    });

    describe('Authorization for GET', () => {
        it('should return 403 when non-owner non-admin tries to view', async () => {
            mockCookiesGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'student2-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT_2.id,
                email: TEST_STUDENT_2.email,
                role: 'user',
            });

            mockGetRecords.mockImplementation((table: string) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT_2.id, email: TEST_STUDENT_2.email, role: 'user' }];
                }
                if (table === 'courses') {
                    return [{
                        id: TEST_COURSE.id,
                        title: TEST_COURSE.title,
                        created_by: TEST_STUDENT.id,
                    }];
                }
                return [];
            });

            const request = createGetRequest(TEST_COURSE.id);
            const response = await GET(request, createParams(TEST_COURSE.id));
            const data = await response.json();

            expect(response.status).toBe(403);
            expect(data.success).toBe(false);
        });

        it('should return 401 when not authenticated', async () => {
            mockCookiesGet.mockReturnValue(undefined);

            const request = createGetRequest(TEST_COURSE.id);
            const response = await GET(request, createParams(TEST_COURSE.id));
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.success).toBe(false);
        });
    });

    describe('Not Found for GET', () => {
        it('should return 404 when course does not exist', async () => {
            mockCookiesGet.mockImplementation((name: string) => {
                if (name === 'access_token') return { value: 'valid-token' };
                return undefined;
            });
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockGetRecords.mockImplementation((table: string) => {
                if (table === 'users') {
                    return [{ id: TEST_STUDENT.id, email: TEST_STUDENT.email, role: 'user' }];
                }
                if (table === 'courses') {
                    return [];
                }
                return [];
            });

            const request = createGetRequest('nonexistent');
            const response = await GET(request, createParams('nonexistent'));
            const data = await response.json();

            expect(response.status).toBe(404);
            expect(data.success).toBe(false);
            expect(data.error).toContain('not found');
        });
    });
});
