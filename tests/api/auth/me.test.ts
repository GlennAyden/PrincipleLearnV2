/**
 * API Tests for /api/auth/me endpoint
 *
 * Tests:
 * - Authenticated access with valid token
 * - Unauthorized access (no token, invalid token, expired token)
 * - Edge cases (database errors, malformed cookies)
 */

import { createMockNextRequest, generateJWT } from '../../setup/test-utils';
import { TEST_STUDENT, TEST_ADMIN } from '../../fixtures/users.fixture';

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

// Mock JWT module — verifyToken needs to return/reject based on test scenario
const mockVerifyToken = jest.fn();
jest.mock('@/lib/jwt', () => ({
    verifyToken: (...args: any[]) => mockVerifyToken(...args),
    generateAccessToken: jest.fn(() => 'mock-access-token'),
    generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
}));

import { GET } from '@/app/api/auth/me/route';

describe('GET /api/auth/me', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Authenticated Access', () => {
        it('should return current user data with valid token', async () => {
            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            // Mock verifyToken to return the payload
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            // Mock database to return user
            mockGetRecords.mockResolvedValue([{
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                name: TEST_STUDENT.name,
                role: 'user',
            }]);

            const request = createMockNextRequest('GET', '/api/auth/me', {
                cookies: { access_token: token },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.user).toBeDefined();
            expect(data.user.email).toBe(TEST_STUDENT.email);
            expect(data.user.name).toBe(TEST_STUDENT.name);
        });

        it('should return admin user data', async () => {
            const token = generateJWT({
                userId: TEST_ADMIN.id,
                email: TEST_ADMIN.email,
                role: 'ADMIN',
            });

            mockVerifyToken.mockReturnValue({
                userId: TEST_ADMIN.id,
                email: TEST_ADMIN.email,
                role: 'ADMIN',
            });

            mockGetRecords.mockResolvedValue([{
                id: TEST_ADMIN.id,
                email: TEST_ADMIN.email,
                name: TEST_ADMIN.name,
                role: 'ADMIN',
            }]);

            const request = createMockNextRequest('GET', '/api/auth/me', {
                cookies: { access_token: token },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.user.role).toBe('ADMIN');
        });

        it('should not return password hash', async () => {
            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockGetRecords.mockResolvedValue([{
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                name: TEST_STUDENT.name,
                role: 'user',
                password_hash: 'should_not_be_returned',
            }]);

            const request = createMockNextRequest('GET', '/api/auth/me', {
                cookies: { access_token: token },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.user.password_hash).toBeUndefined();
            expect(data.user.password).toBeUndefined();
        });
    });

    describe('Unauthorized Access', () => {
        it('should return 401 without access token', async () => {
            const request = createMockNextRequest('GET', '/api/auth/me');

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
        });

        it('should return 401 with invalid token', async () => {
            // verifyToken returns null for invalid tokens
            mockVerifyToken.mockReturnValue(null);

            const request = createMockNextRequest('GET', '/api/auth/me', {
                cookies: { access_token: 'invalid-token-value' },
            });

            const response = await GET(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
        });

        it('should return 401 with expired token', async () => {
            // verifyToken returns null for expired tokens
            mockVerifyToken.mockReturnValue(null);

            // Generate an expired token
            const expiredToken = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            }, '0s');

            // Small delay to ensure token is expired
            await new Promise(resolve => setTimeout(resolve, 100));

            const request = createMockNextRequest('GET', '/api/auth/me', {
                cookies: { access_token: expiredToken },
            });

            const response = await GET(request);

            expect(response.status).toBe(401);
        });

        it('should return 401 if user not found in database', async () => {
            mockVerifyToken.mockReturnValue({
                userId: 'non-existent-user-id',
                email: 'ghost@example.com',
                role: 'user',
            });

            // User not found
            mockGetRecords.mockResolvedValue([]);

            const request = createMockNextRequest('GET', '/api/auth/me', {
                cookies: { access_token: 'some-valid-token' },
            });

            const response = await GET(request);

            expect(response.status).toBe(401);
        });
    });

    describe('Edge Cases', () => {
        it('should handle database errors gracefully', async () => {
            const token = generateJWT({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockGetRecords.mockRejectedValue(
                new Error('Database error')
            );

            const request = createMockNextRequest('GET', '/api/auth/me', {
                cookies: { access_token: token },
            });

            const response = await GET(request);

            expect(response.status).toBe(500);
        });

        it('should handle malformed cookies', async () => {
            // verifyToken returns null for malformed token
            mockVerifyToken.mockReturnValue(null);

            const request = createMockNextRequest('GET', '/api/auth/me', {
                cookies: { access_token: 'malformed;;;cookie;;;value' },
            });

            const response = await GET(request);

            expect([400, 401]).toContain(response.status);
        });
    });
});
