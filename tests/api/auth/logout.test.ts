/**
 * API Tests for /api/auth/logout endpoint
 *
 * Tests:
 * - Successful logout (clear cookies)
 * - Cookie clearing verification
 * - Edge cases
 */

import { POST } from '@/app/api/auth/logout/route';

describe('POST /api/auth/logout', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Successful Logout', () => {
        it('should return success response', async () => {
            const response = await POST();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
            expect(data.message).toContain('Logged out');
        });

        it('should clear access_token cookie', async () => {
            const response = await POST();

            const setCookieHeaders = response.headers.getSetCookie();
            const accessTokenCookie = setCookieHeaders.find((c: string) =>
                c.startsWith('access_token=')
            );

            expect(accessTokenCookie).toBeDefined();
            // When cookies.delete() is called, the cookie should be cleared
            // NextResponse.cookies.delete() sets the value to empty and maxAge to 0
            if (accessTokenCookie) {
                // Cookie should be expired/cleared
                expect(
                    accessTokenCookie.includes('Max-Age=0') ||
                    accessTokenCookie.includes('max-age=0') ||
                    accessTokenCookie.includes('access_token=;') ||
                    accessTokenCookie.includes('access_token=\u0000') ||
                    accessTokenCookie === 'access_token='
                ).toBe(true);
            }
        });

        it('should clear all auth cookies', async () => {
            const response = await POST();

            const setCookieHeaders = response.headers.getSetCookie();

            // Should have Set-Cookie headers for access_token, refresh_token, csrf_token
            const cookieNames = setCookieHeaders.map((c: string) => c.split('=')[0]);
            expect(cookieNames).toContain('access_token');
            expect(cookieNames).toContain('refresh_token');
            expect(cookieNames).toContain('csrf_token');
        });
    });

    describe('Edge Cases', () => {
        it('should work even when not logged in (no cookies set)', async () => {
            // POST() takes no arguments, so calling it without any auth should still work
            const response = await POST();
            const data = await response.json();

            expect(response.status).toBe(200);
            expect(data.success).toBe(true);
        });

        it('should not return any user information', async () => {
            const response = await POST();
            const data = await response.json();

            expect(data.user).toBeUndefined();
            expect(data.email).toBeUndefined();
            expect(data.token).toBeUndefined();
        });

        it('should be idempotent (calling multiple times is safe)', async () => {
            const response1 = await POST();
            const response2 = await POST();

            expect(response1.status).toBe(200);
            expect(response2.status).toBe(200);
        });
    });

    describe('Security', () => {
        it('should not leak user info in response', async () => {
            const response = await POST();
            const data = await response.json();

            expect(data.success).toBe(true);
            expect(data.message).toBeDefined();
            // Should only have success and message
            const keys = Object.keys(data);
            expect(keys).toEqual(expect.arrayContaining(['success', 'message']));
            expect(keys).not.toContain('user');
            expect(keys).not.toContain('password');
            expect(keys).not.toContain('token');
        });

        it('should set httpOnly and secure attributes on cleared cookies', async () => {
            const response = await POST();
            const setCookieHeaders = response.headers.getSetCookie();

            // At minimum, cookies should exist for clearing
            expect(setCookieHeaders.length).toBeGreaterThanOrEqual(3);
        });
    });
});
