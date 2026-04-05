/**
 * API Tests for /api/auth/me endpoint
 *
 * Tests:
 * - Authenticated access with valid token
 * - Unauthorized access (no token, invalid token, expired token)
 * - Edge cases (database errors, malformed cookies)
 */

import { TEST_STUDENT, TEST_ADMIN } from '../../fixtures/users.fixture';

// Mock the service — getCurrentUser abstracts cookie reading, JWT verify, and DB lookup
const mockGetCurrentUser = jest.fn();
jest.mock('@/services/auth.service', () => ({
    getCurrentUser: (...args: any[]) => mockGetCurrentUser(...args),
}));

import { GET } from '@/app/api/auth/me/route';

describe('GET /api/auth/me', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Authenticated Access', () => {
        it('should return current user data with valid token', async () => {
            // getCurrentUser returns the user record directly
            mockGetCurrentUser.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                name: TEST_STUDENT.name,
                role: 'user',
            });

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.user).toBeDefined();
            expect(data.user.email).toBe(TEST_STUDENT.email);
            expect(data.user.name).toBe(TEST_STUDENT.name);
        });

        it('should return admin user data', async () => {
            mockGetCurrentUser.mockResolvedValue({
                id: TEST_ADMIN.id,
                email: TEST_ADMIN.email,
                name: TEST_ADMIN.name,
                role: 'ADMIN',
            });

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.user.role).toBe('ADMIN');
        });

        it('should not return password hash', async () => {
            mockGetCurrentUser.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                name: TEST_STUDENT.name,
                role: 'user',
                password_hash: 'should_not_be_returned',
            });

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(200);
            // The route explicitly selects only id, email, role, name
            expect(data.user.password_hash).toBeUndefined();
            expect(data.user.password).toBeUndefined();
        });
    });

    describe('Unauthorized Access', () => {
        it('should return 401 without access token', async () => {
            // getCurrentUser returns null when no token present
            mockGetCurrentUser.mockResolvedValue(null);

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
        });

        it('should return 401 with invalid token', async () => {
            mockGetCurrentUser.mockResolvedValue(null);

            const response = await GET();
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
        });

        it('should return 401 with expired token', async () => {
            mockGetCurrentUser.mockResolvedValue(null);

            const response = await GET();

            expect(response.status).toBe(401);
        });

        it('should return 401 if user not found in database', async () => {
            // getCurrentUser returns null when user not found in DB
            mockGetCurrentUser.mockResolvedValue(null);

            const response = await GET();

            expect(response.status).toBe(401);
        });
    });

    describe('Edge Cases', () => {
        it('should handle database errors gracefully', async () => {
            // getCurrentUser throws on unexpected errors
            mockGetCurrentUser.mockRejectedValue(new Error('Database error'));

            const response = await GET();

            expect(response.status).toBe(500);
        });

        it('should handle malformed cookies', async () => {
            // getCurrentUser returns null for malformed tokens
            mockGetCurrentUser.mockResolvedValue(null);

            const response = await GET();

            expect([400, 401]).toContain(response.status);
        });
    });
});
