/**
 * Middleware Tests: JSON 401 for API Routes
 *
 * Tests that the middleware returns proper JSON 401 responses
 * for unauthenticated /api/* requests instead of HTML redirects.
 *
 * Also verifies that:
 * - Public/auth API routes are not blocked
 * - Page routes still redirect to login HTML pages
 * - Valid tokens pass through with user headers set
 * - Invalid tokens return JSON 401 for API routes
 */

import { NextRequest } from 'next/server';

// Mock verifyToken before importing middleware
const mockVerifyToken = jest.fn();
jest.mock('@/lib/jwt', () => ({
  verifyToken: (...args: any[]) => mockVerifyToken(...args),
}));

import { middleware } from '../../../middleware';

// Helper to create a NextRequest
function createRequest(path: string, options: { cookies?: Record<string, string> } = {}): NextRequest {
  const url = new URL(path, 'http://localhost:3000');
  const req = new NextRequest(url);

  if (options.cookies) {
    for (const [name, value] of Object.entries(options.cookies)) {
      req.cookies.set(name, value);
    }
  }

  return req;
}

describe('Middleware — API Route JSON 401 Responses', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ─── No Token: API routes should get JSON 401 ───

  test('returns JSON 401 for /api/courses when no token', async () => {
    const req = createRequest('/api/courses');
    const res = middleware(req);

    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('Authentication required');
    // Should NOT be a redirect
    expect(res.headers.get('location')).toBeNull();
  });

  test('returns JSON 401 for /api/generate-course when no token', async () => {
    const req = createRequest('/api/generate-course');
    const res = middleware(req);

    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('Authentication required');
  });

  test('returns JSON 401 for /api/admin/dashboard when no token', async () => {
    const req = createRequest('/api/admin/dashboard');
    const res = middleware(req);

    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('Authentication required');
  });

  test('returns JSON 401 for nested API routes when no token', async () => {
    const req = createRequest('/api/admin/users/123/detail');
    const res = middleware(req);

    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('Authentication required');
  });

  // ─── Invalid Token: API routes should get JSON 401 ───

  test('returns JSON 401 with "Invalid or expired token" when token is invalid', async () => {
    mockVerifyToken.mockReturnValue(null); // invalid token

    const req = createRequest('/api/courses', {
      cookies: { access_token: 'invalid-token-here' },
    });
    const res = middleware(req);

    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('Invalid or expired token');

    // Should clear the invalid cookie
    const setCookieHeaders = res.headers.getSetCookie();
    const clearedCookies = setCookieHeaders.filter(c => c.includes('access_token'));
    expect(clearedCookies.length).toBeGreaterThan(0);
  });

  test('returns JSON 401 for admin API when admin token is invalid', async () => {
    mockVerifyToken.mockReturnValue(null);

    const req = createRequest('/api/admin/insights', {
      cookies: { access_token: 'bad-admin-token' },
    });
    const res = middleware(req);

    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBe('Invalid or expired token');
  });

  // ─── Public API routes should pass through ───

  test('allows /api/auth/login without token', async () => {
    const req = createRequest('/api/auth/login');
    const res = middleware(req);

    // Should pass through (200 or no redirect)
    expect(res.status).toBe(200);
    expect(res.headers.get('location')).toBeNull();
  });

  test('allows /api/auth/register without token', async () => {
    const req = createRequest('/api/auth/register');
    const res = middleware(req);

    expect(res.status).toBe(200);
  });

  test('allows /api/auth/refresh without token', async () => {
    const req = createRequest('/api/auth/refresh');
    const res = middleware(req);

    expect(res.status).toBe(200);
  });

  test('allows /api/auth/logout without token', async () => {
    const req = createRequest('/api/auth/logout');
    const res = middleware(req);

    expect(res.status).toBe(200);
  });

  // ─── Page routes should redirect to login (not JSON) ───

  test('redirects /dashboard to /login when no token', async () => {
    const req = createRequest('/dashboard');
    const res = middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  test('redirects /admin/dashboard to /admin/login when no token', async () => {
    const req = createRequest('/admin/dashboard');
    const res = middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/admin/login');
  });

  test('redirects /request-course/step1 to /login when no token', async () => {
    const req = createRequest('/request-course/step1');
    const res = middleware(req);

    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  // ─── Valid token: should pass through with headers ───

  test('passes through API request with valid user token and sets headers', async () => {
    mockVerifyToken.mockReturnValue({
      userId: 'user-123',
      email: 'test@example.com',
      role: 'user',
    });

    const req = createRequest('/api/courses', {
      cookies: { access_token: 'valid-user-token' },
    });
    const res = middleware(req);

    expect(res.status).toBe(200);
    // Headers should be set for downstream handlers
    expect(res.headers.get('x-user-id') || res.headers.get('x-middleware-request-x-user-id')).toBeTruthy();
  });

  test('passes through API request with valid admin token', async () => {
    mockVerifyToken.mockReturnValue({
      userId: 'admin-1',
      email: 'admin@example.com',
      role: 'admin',
    });

    const req = createRequest('/api/admin/dashboard', {
      cookies: { access_token: 'valid-admin-token' },
    });
    const res = middleware(req);

    expect(res.status).toBe(200);
  });

  // ─── Public page routes should pass through ───

  test('allows / (home) without token', async () => {
    const req = createRequest('/');
    const res = middleware(req);

    expect(res.status).toBe(200);
  });

  test('allows /login without token', async () => {
    const req = createRequest('/login');
    const res = middleware(req);

    expect(res.status).toBe(200);
  });

  test('allows /signup without token', async () => {
    const req = createRequest('/signup');
    const res = middleware(req);

    expect(res.status).toBe(200);
  });
});
