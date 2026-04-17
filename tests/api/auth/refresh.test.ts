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

import { TEST_STUDENT, TEST_ADMIN } from '../../fixtures/users.fixture';

// Mock next/headers cookies() — the route uses `await cookies()` to read refresh_token
const mockCookieGet = jest.fn();
jest.mock('next/headers', () => ({
    cookies: jest.fn(async () => ({
        get: (name: string) => mockCookieGet(name),
    })),
}));

// Mock JWT module — refresh route verifies refresh tokens explicitly
const mockVerifyToken = jest.fn();
jest.mock('@/lib/jwt', () => ({
    ACCESS_TOKEN_MAX_AGE_SECONDS: 15 * 60,
    REFRESH_TOKEN_MAX_AGE_SECONDS: 3 * 24 * 60 * 60,
    verifyRefreshToken: (...args: any[]) => mockVerifyToken(...args),
}));

// Mock auth service — findUserById, generateAuthTokens, generateCsrfToken
const mockFindUserById = jest.fn();
const mockGenerateAuthTokens = jest.fn(() => ({
    accessToken: 'mock-new-access-token',
    refreshToken: 'mock-new-refresh-token',
}));
const mockGenerateCsrfToken = jest.fn(() => 'mock-csrf-token-hex-string');
const mockHashRefreshToken = jest.fn((token: string) => `hash:${token}`);
const mockUpdateUserRefreshTokenHash = jest.fn().mockResolvedValue(undefined);

jest.mock('@/services/auth.service', () => ({
    findUserById: (...args: any[]) => mockFindUserById(...args),
    generateAuthTokens: (...args: any[]) => mockGenerateAuthTokens(...args),
    generateCsrfToken: (...args: any[]) => mockGenerateCsrfToken(...args),
    hashRefreshToken: (...args: any[]) => mockHashRefreshToken(...args),
    updateUserRefreshTokenHash: (...args: any[]) => mockUpdateUserRefreshTokenHash(...args),
}));

import { POST } from '@/app/api/auth/refresh/route';

describe('POST /api/auth/refresh', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        // Default: no cookies
        mockCookieGet.mockReturnValue(undefined);
    });

    // Helper to create a minimal Request for POST (route reads cookies from next/headers, not request)
    function createRefreshRequest(): Request {
        return new Request('http://localhost:3000/api/auth/refresh', { method: 'POST' });
    }

    describe('Successful Token Refresh', () => {
        it('should refresh token successfully with valid refresh token and existing user', async () => {
            // Cookie returns refresh_token
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'valid-refresh-token' };
                return undefined;
            });

            // verifyToken returns valid payload
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            // findUserById returns user
            mockFindUserById.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
                name: TEST_STUDENT.name,
            });

            const response = await POST(createRefreshRequest());
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.csrfToken).toBeDefined();
        });

        it('should refresh token successfully for admin user', async () => {
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'valid-admin-refresh-token' };
                return undefined;
            });

            mockVerifyToken.mockReturnValue({
                userId: TEST_ADMIN.id,
                email: TEST_ADMIN.email,
                role: 'ADMIN',
            });

            mockFindUserById.mockResolvedValue({
                id: TEST_ADMIN.id,
                email: TEST_ADMIN.email,
                role: 'ADMIN',
                name: TEST_ADMIN.name,
            });

            const response = await POST(createRefreshRequest());
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });

        it('should generate new auth tokens with correct user data', async () => {
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'valid-refresh-token' };
                return undefined;
            });

            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockFindUserById.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
                name: TEST_STUDENT.name,
            });

            await POST(createRefreshRequest());

            // Verify generateAuthTokens was called with the user record from DB
            expect(mockGenerateAuthTokens).toHaveBeenCalledWith({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
                name: TEST_STUDENT.name,
            });
        });

        it('should set access_token and csrf_token cookies on success', async () => {
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'valid-refresh-token' };
                return undefined;
            });

            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockFindUserById.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
                name: TEST_STUDENT.name,
            });

            const response = await POST(createRefreshRequest());

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
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'valid-refresh-token' };
                return undefined;
            });

            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockFindUserById.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            const response = await POST(createRefreshRequest());
            const data = await response.json();

            expect(data.csrfToken).toBe('mock-csrf-token-hex-string');
        });

        it('should query findUserById with correct userId from token payload', async () => {
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'valid-refresh-token' };
                return undefined;
            });

            mockVerifyToken.mockReturnValue({
                userId: 'specific-user-id-123',
                email: 'specific@example.com',
                role: 'user',
            });

            mockFindUserById.mockResolvedValue({
                id: 'specific-user-id-123',
                email: 'specific@example.com',
                role: 'user',
            });

            await POST(createRefreshRequest());

            expect(mockFindUserById).toHaveBeenCalledWith('specific-user-id-123');
        });
    });

    describe('Missing Refresh Token', () => {
        it('should return 401 when no refresh token cookie is provided', async () => {
            // mockCookieGet returns undefined by default

            const response = await POST(createRefreshRequest());
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
            expect(data.error).toContain('Token refresh tidak tersedia');
        });

        it('should return 401 when cookies object has no refresh_token', async () => {
            const response = await POST(createRefreshRequest());
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
        });
    });

    describe('Invalid or Expired Refresh Token', () => {
        it('should return 401 when refresh token is invalid', async () => {
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'invalid-token' };
                return undefined;
            });

            mockVerifyToken.mockReturnValue(null);

            const response = await POST(createRefreshRequest());
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toBeDefined();
        });

        it('should clear all auth cookies when refresh token is invalid', async () => {
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'expired-token' };
                return undefined;
            });

            mockVerifyToken.mockReturnValue(null);

            const response = await POST(createRefreshRequest());

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
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'invalid-token' };
                return undefined;
            });

            mockVerifyToken.mockReturnValue(null);

            await POST(createRefreshRequest());

            expect(mockFindUserById).not.toHaveBeenCalled();
        });
    });

    describe('User No Longer Exists (Admin Deleted)', () => {
        it('should return 401 when user no longer exists in database', async () => {
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'valid-token-for-deleted-user' };
                return undefined;
            });

            mockVerifyToken.mockReturnValue({
                userId: 'deleted-user-id',
                email: 'deleted@example.com',
                role: 'user',
            });

            // User not found in database
            mockFindUserById.mockResolvedValue(null);

            const response = await POST(createRefreshRequest());
            const data = await response.json();

            expect(response.status).toBe(401);
            expect(data.error).toContain('Pengguna tidak lagi terdaftar');
        });

        it('should clear all cookies when user no longer exists', async () => {
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'valid-token-for-deleted-user' };
                return undefined;
            });

            mockVerifyToken.mockReturnValue({
                userId: 'deleted-user-id',
                email: 'deleted@example.com',
                role: 'user',
            });

            mockFindUserById.mockResolvedValue(null);

            const response = await POST(createRefreshRequest());

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
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'valid-refresh-token' };
                return undefined;
            });

            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockFindUserById.mockRejectedValue(new Error('Database connection failed'));

            const response = await POST(createRefreshRequest());
            const data = await response.json();

            expect(response.status).toBe(500);
            expect(data.error).toBeDefined();
        });

        it('should not generate new tokens when database fails', async () => {
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'valid-refresh-token' };
                return undefined;
            });

            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: TEST_STUDENT.email,
                role: 'user',
            });

            mockFindUserById.mockRejectedValue(new Error('Database timeout'));

            await POST(createRefreshRequest());

            expect(mockGenerateAuthTokens).not.toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle verifyToken throwing an exception', async () => {
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'malformed-token' };
                return undefined;
            });

            mockVerifyToken.mockImplementation(() => {
                throw new Error('JWT malformed');
            });

            const response = await POST(createRefreshRequest());

            // Should return 500 since the error is thrown (not returned as null)
            expect(response.status).toBe(500);
        });

        it('should use real user data from database, not token payload', async () => {
            mockCookieGet.mockImplementation((name: string) => {
                if (name === 'refresh_token') return { value: 'valid-refresh-token' };
                return undefined;
            });

            // Token has old email, but database has updated email
            mockVerifyToken.mockReturnValue({
                userId: TEST_STUDENT.id,
                email: 'old-email@example.com',
                role: 'user',
            });

            mockFindUserById.mockResolvedValue({
                id: TEST_STUDENT.id,
                email: 'new-email@example.com',  // Updated in DB
                role: 'ADMIN',                     // Role changed in DB
                name: TEST_STUDENT.name,
            });

            await POST(createRefreshRequest());

            // Should use DB data, not token payload — generateAuthTokens receives the full user record
            expect(mockGenerateAuthTokens).toHaveBeenCalledWith({
                id: TEST_STUDENT.id,
                email: 'new-email@example.com',
                role: 'ADMIN',
                name: TEST_STUDENT.name,
            });
        });
    });
});
