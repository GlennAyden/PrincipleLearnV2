import { sign, verify, type Secret, type SignOptions } from 'jsonwebtoken';
import { createRequest, createResponse, type RequestMethod } from 'node-mocks-http';
import { NextRequest } from 'next/server';

// Types
export interface TestUser {
    id: string;
    email: string;
    password: string;
    role: 'user' | 'ADMIN';
    name: string;
}

export interface TestCourse {
    id: string;
    title: string;
    description: string;
    subject: string;
    difficulty_level: string;
    created_by: string;
}

export interface APITestContext {
    token: string;
    csrfToken: string;
    userId: string;
    cookies: string;
}

// Constants
const JWT_SECRET = process.env.JWT_SECRET || 'test-jwt-secret-key-for-testing-purposes-only';
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

/**
 * Generate a unique ID for test data
 */
export function generateTestId(prefix: string = 'test'): string {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Generate JWT token for testing
 */
export function generateJWT(payload: {
    userId: string;
    email: string;
    role: string;
}, expiresIn: string | number = '15m'): string {
    return sign(payload, JWT_SECRET as Secret, { expiresIn: expiresIn as SignOptions['expiresIn'] });
}

/**
 * Verify JWT token
 */
export function verifyJWT(token: string): { userId: string; email: string; role: string } | null {
    try {
        return verify(token, JWT_SECRET) as { userId: string; email: string; role: string };
    } catch {
        return null;
    }
}

/**
 * Generate CSRF token
 */
export function generateCSRFToken(): string {
    return `csrf-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Create auth context for authenticated API calls
 */
export function createAuthContext(user: TestUser): APITestContext {
    const token = generateJWT({
        userId: user.id,
        email: user.email,
        role: user.role,
    });
    const csrfToken = generateCSRFToken();

    return {
        token,
        csrfToken,
        userId: user.id,
        cookies: `access_token=${token}; csrf_token=${csrfToken}`,
    };
}

/**
 * Format cookie string for requests
 */
export function cookieFor(token: string, csrfToken?: string): string {
    let cookies = `access_token=${token}`;
    if (csrfToken) {
        cookies += `; csrf_token=${csrfToken}`;
    }
    return cookies;
}

/**
 * Create mock NextRequest for API route testing.
 * 
 * Uses the real NextRequest constructor so that `.cookies.get()`,
 * `.nextUrl`, and all other NextRequest APIs work correctly.
 */
export function createMockNextRequest(
    method: string,
    url: string,
    options: {
        body?: Record<string, unknown>;
        headers?: Record<string, string>;
        cookies?: Record<string, string>;
    } = {}
): NextRequest {
    const { body, headers = {}, cookies = {} } = options;

    const fullUrl = url.startsWith('http') ? url : `${BASE_URL}${url}`;

    const reqHeaders = new Headers({
        'Content-Type': 'application/json',
        ...headers,
    });

    // Build cookie header string from cookies object
    if (Object.keys(cookies).length > 0) {
        const cookieString = Object.entries(cookies)
            .map(([key, value]) => `${key}=${value}`)
            .join('; ');
        reqHeaders.set('Cookie', cookieString);
    }

    const init: { method: string; headers: Headers; body?: string } = {
        method,
        headers: reqHeaders,
    };

    if (body && method !== 'GET') {
        init.body = JSON.stringify(body);
    }

    // Use the real NextRequest constructor — it provides .cookies, .nextUrl, etc.
    return new NextRequest(fullUrl, init as any);

}

/**
 * Create mock request using node-mocks-http
 */
export function createMockRequest(
    method: RequestMethod,
    body?: Record<string, unknown>,
    headers?: Record<string, string>,
    cookies?: Record<string, string>
) {
    const req = createRequest({
        method,
        body,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
        cookies,
    });
    return req;
}

/**
 * Create mock response using node-mocks-http
 */
export function createMockResponse() {
    return createResponse();
}

/**
 * Helper for making API calls in tests
 */
export async function apiCall(
    path: string,
    options: {
        method?: string;
        body?: Record<string, unknown>;
        token?: string;
        csrfToken?: string;
        headers?: Record<string, string>;
    } = {}
): Promise<Response> {
    const { method = 'GET', body, token, csrfToken, headers = {} } = options;

    const fetchOptions: RequestInit = {
        method,
        headers: {
            'Content-Type': 'application/json',
            ...headers,
        },
    };

    if (body && method !== 'GET') {
        fetchOptions.body = JSON.stringify(body);
    }

    if (token) {
        (fetchOptions.headers as Record<string, string>)['Cookie'] = cookieFor(token, csrfToken);
    }

    return fetch(`${BASE_URL}${path}`, fetchOptions);
}

/**
 * Parse JSON response with error handling
 */
export async function parseResponse<T>(response: Response): Promise<T> {
    const text = await response.text();
    try {
        return JSON.parse(text) as T;
    } catch {
        throw new Error(`Failed to parse response: ${text}`);
    }
}

/**
 * Wait for a specified amount of time
 */
export function wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Create test user data with unique identifiers
 */
export function createTestUserData(role: 'user' | 'ADMIN' = 'user'): TestUser {
    const id = generateTestId('user');
    const timestamp = Date.now();

    return {
        id,
        email: `test-${timestamp}@example.com`,
        password: 'TestPassword123!',
        role,
        name: role === 'ADMIN' ? 'Test Admin' : 'Test User',
    };
}

/**
 * Create test course data
 */
export function createTestCourseData(userId: string): TestCourse {
    const id = generateTestId('course');

    return {
        id,
        title: `Test Course ${Date.now()}`,
        description: 'A test course for automated testing',
        subject: 'Testing',
        difficulty_level: 'beginner',
        created_by: userId,
    };
}

/**
 * Assert response status and return parsed body
 */
export async function assertResponse<T>(
    response: Response,
    expectedStatus: number
): Promise<T> {
    if (response.status !== expectedStatus) {
        const body = await response.text();
        throw new Error(
            `Expected status ${expectedStatus} but got ${response.status}. Body: ${body}`
        );
    }
    return parseResponse<T>(response);
}

/**
 * Extract cookies from response
 */
export function extractCookies(response: Response): Record<string, string> {
    const cookies: Record<string, string> = {};
    const setCookieHeaders = response.headers.getSetCookie?.() || [];

    for (const cookie of setCookieHeaders) {
        const [nameValue] = cookie.split(';');
        const [name, value] = nameValue.split('=');
        if (name && value) {
            cookies[name.trim()] = value.trim();
        }
    }

    return cookies;
}

/**
 * Mock database service for unit tests
 */
export const mockDatabaseService = {
    users: new Map<string, TestUser>(),
    courses: new Map<string, TestCourse>(),

    reset() {
        this.users.clear();
        this.courses.clear();
    },

    addUser(user: TestUser) {
        this.users.set(user.id, user);
    },

    getUser(id: string) {
        return this.users.get(id);
    },

    getUserByEmail(email: string) {
        return Array.from(this.users.values()).find(u => u.email === email);
    },

    addCourse(course: TestCourse) {
        this.courses.set(course.id, course);
    },

    getCourse(id: string) {
        return this.courses.get(id);
    },

    getCoursesByUser(userId: string) {
        return Array.from(this.courses.values()).filter(c => c.created_by === userId);
    },
};

/**
 * Test data cleanup helper
 */
export async function cleanupTestData(testIds: string[]): Promise<void> {
    // In a real implementation, this would delete test data from the database
    // For mocked tests, we just clear the mock data
    console.log(`Cleaning up test data: ${testIds.join(', ')}`);
    mockDatabaseService.reset();
}

/**
 * Create authenticated test context for a user role
 */
export function createTestContext(role: 'user' | 'ADMIN' = 'user'): {
    user: TestUser;
    auth: APITestContext;
} {
    const user = createTestUserData(role);
    const auth = createAuthContext(user);

    return { user, auth };
}
