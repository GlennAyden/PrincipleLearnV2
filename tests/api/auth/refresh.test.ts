/**
 * API Tests for /api/auth/refresh endpoint
 *
 * Tests:
 * - Successful token refresh with valid refresh token and existing user
 * - Returns 401 when no refresh token cookie is provided
 * - Returns 401 when refresh token is expired/invalid
 * - Returns 401 when user no longer exists in database (admin deleted user)
 * - Clears cookies on invalid refresh token
 * - Generates new access token with correct user data
 * - Generates new CSRF token in response
 * - Handles database errors gracefully
 */

import { createMockNextRequest, generateJWT } from '../../setup/test-utils';
import { TEST_STUDENT, TEST_ADMIN } from '../../fixtures/users.fixture';

// Mock the database module
const mockGetRecords = jest.fn();
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
}));

// Mock JWT module
const mockVerifyToken = jest.fn();
const mockGenerateAccessToken = jest.fn(() => 'mock-new-access-token');
const mockGetTokenExpiration = jest.fn(() => new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

jest.mock('@/lib/jwt', () => ({
    verifyToken: (...args: any[]) => mockVerifyToken(...args),
    generateAccessToken: (...args: any[]) => mockGenerateAccessToken(...args),
    generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
    getTokenExpiration: (...args: any[]) => mockGetTokenExpiration(...args),
}));

// Mock crypto for CSRF token generation
jest.mock('crypto', () => ({
    ...jest.requireActual('crypto'),
    randomBytes: jest.fn(() => ({
        toString: jest.fn(() => 'mock-csrf-token-hex-string'),
    })),
}));

import { POST } from '@/app/api/auth/refresh/route';

describe('POST /api/auth/refresh', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Successful Token Refresh', () => {
        it('should refresh token successfully with valid refresh token and existing user', async () => {
            // Setup: valid refresh token payload
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            // Setup: user exists in database
            mockGetRecords.mockResolvedValue([{
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
                name: TEST_STUDENT.name,
            }]);

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'valid-refresh-token' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.csrfToken).toBeDefined();
        });

        it('should refresh token successfully for admin user', async () => {
            mockVerifyToken.mockReturnValue({
                userId: TEST_ADMIN.id,
                email: TEST_ADMIN.email,
                role: 'ADMIN',
            });

            mockGetRecords.mockResolvedValue([{
                id: TEST_ADMIN.id,
                email: TEST_ADMIN.email,
                role: 'ADMIN',
                name: TEST_ADMIN.name,
            }]);

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'valid-admin-refresh-token' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });

        it('should generate new access token with correct user data', async () => {
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockGetRecords.mockResolvedValue([{
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
                name: TEST_STUDENT.name,
            }]);

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'valid-refresh-token' },
            });

            await POST(request);

            // Verify generateAccessToken was called with correct user data from DB
            expect(mockGenerateAccessToken).toHaveBeenCalledWith({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });
        });

        it('should set access_token and csrf_token cookies on success', async () => {
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockGetRecords.mockResolvedValue([{
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
                name: TEST_STUDENT.name,
            }]);

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'valid-refresh-token' },
            });

            const response = await POST(request);

            expect(response.status).toBe(200);

            // Check that cookies are set via Set-Cookie headers
            const setCookieHeaders = response.headers.getSetCookie();
            expect(setCookieHeaders.length).toBeGreaterThan(0);

            const hasAccessToken = setCookieHeaders.some((c: string) => c.startsWith('access_token='));
            const hasCsrfToken = setCookieHeaders.some((c: string) => c.startsWith('csrf_token='));

            expect(hasAccessToken).toBe(true);
            expect(hasCsrfToken).toBe(true);
        });

        it('should include CSRF token in response body', async () => {
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockGetRecords.mockResolvedValue([{
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            }]);

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'valid-refresh-token' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(data.csrfToken).toBe('mock-csrf-token-hex-string');
        });

        it('should query database with correct userId from token payload', async () => {
            mockVerifyToken.mockReturnValue({
                userId: 'specific-user-id-123',
                email: 'specific@example.com',
                role: 'user',
            });

            mockGetRecords.mockResolvedValue([{
                id: 'specific-user-id-123',
                email: 'specific@example.com',
                role: 'user',
            }]);

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'valid-refresh-token' },
            });

            await POST(request);

            expect(mockGetRecords).toHaveBeenCalledWith('users', {
                filter: { id: 'specific-user-id-123' },
                limit: 1,
            });
        });
    });

    describe('Missing Refresh Token', () => {
        it('should return 401 when no refresh token cookie is provided', async () => {
            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: {},
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
            expect(data.error).toContain('No refresh token');
        });

        it('should return 401 when cookies object is empty', async () => {
            const request = createMockNextRequest('POST', '/api/auth/refresh');

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
        });
    });

    describe('Invalid or Expired Refresh Token', () => {
        it('should return 401 when refresh token is invalid', async () => {
            mockVerifyToken.mockReturnValue(null);

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'invalid-token' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
        });

        it('should clear all auth cookies when refresh token is invalid', async () => {
            mockVerifyToken.mockReturnValue(null);

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'expired-token' },
            });

            const response = await POST(request);

            expect(response.status).toBe(401);

            // Check that cookies are cleared via Set-Cookie headers
            const setCookieHeaders = response.headers.getSetCookie();

            // Should have deletion headers for access_token, refresh_token, csrf_token
            const deletesAccessToken = setCookieHeaders.some((c: string) =>
                c.includes('access_token') && (c.includes('Max-Age=0') || c.includes('max-age=0') || c.includes('Expires='))
            );
            const deletesRefreshToken = setCookieHeaders.some((c: string) =>
                c.includes('refresh_token') && (c.includes('Max-Age=0') || c.includes('max-age=0') || c.includes('Expires='))
            );
            const deletesCsrfToken = setCookieHeaders.some((c: string) =>
                c.includes('csrf_token') && (c.includes('Max-Age=0') || c.includes('max-age=0') || c.includes('Expires='))
            );

            expect(deletesAccessToken).toBe(true);
            expect(deletesRefreshToken).toBe(true);
            expect(deletesCsrfToken).toBe(true);
        });

        it('should not query database when token is invalid', async () => {
            mockVerifyToken.mockReturnValue(null);

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'invalid-token' },
            });

            await POST(request);

            expect(mockGetRecords).not.toHaveBeenCalled();
        });
    });

    describe('User No Longer Exists (Admin Deleted)', () => {
        it('should return 401 when user no longer exists in database', async () => {
            mockVerifyToken.mockReturnValue({
                userId: 'deleted-user-id',
                email: 'deleted@example.com',
                role: 'user',
            });

            // User not found in database
            mockGetRecords.mockResolvedValue([]);

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'valid-token-for-deleted-user' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toContain('no longer exists');
        });

        it('should clear all cookies when user no longer exists', async () => {
            mockVerifyToken.mockReturnValue({
                userId: 'deleted-user-id',
                email: 'deleted@example.com',
                role: 'user',
            });

            mockGetRecords.mockResolvedValue([]);

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'valid-token-for-deleted-user' },
            });

            const response = await POST(request);

            expect(response.status).toBe(401);

            const setCookieHeaders = response.headers.getSetCookie();
            const deletesAccessToken = setCookieHeaders.some((c: string) =>
                c.includes('access_token') && (c.includes('Max-Age=0') || c.includes('max-age=0') || c.includes('Expires='))
            );

            expect(deletesAccessToken).toBe(true);
        });
    });

    describe('Database Errors', () => {
        it('should return 500 when database query fails', async () => {
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockGetRecords.mockRejectedValue(new Error('Database connection failed'));

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'valid-refresh-token' },
            });

            const response = await POST(request);
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toBeDefined();
        });

        it('should not generate new tokens when database fails', async () => {
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockGetRecords.mockRejectedValue(new Error('Database timeout'));

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'valid-refresh-token' },
            });

            await POST(request);

            expect(mockGenerateAccessToken).not.toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle verifyToken throwing an exception', async () => {
            mockVerifyToken.mockImplementation(() => {
                throw new Error('JWT malformed');
            });

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'malformed-token' },
            });

            const response = await POST(request);

            // Should return 500 since the error is thrown (not returned as null)
            expect(response.status).toBe(500);
        });

        it('should use real user data from database, not token payload', async () => {
            // Token has old email, but database has updated email
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: 'old-email@example.com',
                role: 'user',
            });

            mockGetRecords.mockResolvedValue([{
                id: TEST_STUDENT.id,
                email: 'new-email@example.com',  // Updated in DB
                role: 'ADMIN',                     // Role changed in DB
                name: TEST_STUDENT.name,
            }]);

            const request = createMockNextRequest('POST', '/api/auth/refresh', {
                cookies: { refresh_token: 'valid-refresh-token' },
            });

            await POST(request);

            // Should use DB data, not token payload
            expect(mockGenerateAccessToken).toHaveBeenCalledWith({
                userId: TEST_STUDENT.id,
                email: 'new-email@example.com',
                role: 'ADMIN',
            });
        });
    });
});
