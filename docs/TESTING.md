# Testing Documentation - PrincipleLearn V3

This document describes the testing strategy, tooling, configuration, and conventions used in the PrincipleLearn V3 project.

---

## 1. Overview

PrincipleLearn V3 uses a three-layer testing strategy:

| Layer | Tool | Purpose |
|-------|------|---------|
| **Unit tests** | Jest | Validate Zod schemas, utility functions, middleware logic |
| **API tests** | Jest + MSW | Test Next.js API route handlers in isolation |
| **E2E tests** | Playwright | Test full user flows in a real browser |

**Key numbers:**

- **22 test files total**: 18 Jest (API + unit) and 4 Playwright E2E specs
- **Coverage thresholds**: 70% branches, 75% functions, 75% lines, 75% statements
- **Mock layer**: MSW (Mock Service Worker) intercepts Supabase and OpenAI HTTP calls at the network level

---

## 2. Test Architecture

### 2.1 Directory Structure

```
tests/
├── api/                        # API route handler tests (16 files)
│   ├── auth/
│   │   ├── login.test.ts       # Login endpoint: credentials, cookies, JWT
│   │   ├── register.test.ts    # Signup endpoint: validation, duplicate email
│   │   ├── logout.test.ts      # Logout: cookie clearing
│   │   ├── me.test.ts          # Current user endpoint
│   │   └── refresh.test.ts     # Token refresh flow
│   ├── courses/
│   │   ├── courses.test.ts     # Course CRUD operations
│   │   ├── delete.test.ts      # Course deletion + access control
│   │   └── generate.test.ts    # AI course generation via OpenAI
│   ├── learning/
│   │   ├── ask-question.test.ts    # Q&A endpoint (streaming)
│   │   ├── quiz-submit.test.ts     # Quiz submission + scoring
│   │   └── jurnal-save.test.ts     # Journal save endpoint
│   ├── ai/
│   │   └── challenge-thinking.test.ts  # Challenge thinking AI endpoint
│   ├── admin/
│   │   ├── dashboard.test.ts       # Admin dashboard stats
│   │   ├── discussions.test.ts     # Discussion management
│   │   └── research.test.ts        # Research/analytics endpoints
│   ├── security/
│   │   └── rate-limit.test.ts      # Rate limiter behavior
│   └── middleware/
│       └── middleware.test.ts      # Auth middleware: JSON 401s, role checks
├── unit/
│   └── schemas.test.ts            # Zod schema validation (all 12 schemas)
├── e2e/                           # Playwright E2E tests (4 files)
│   ├── user/
│   │   ├── signup-login.spec.ts   # Full auth journey: signup, login, logout
│   │   ├── dashboard.spec.ts      # Dashboard rendering, course list
│   │   └── generate-course.spec.ts # Multi-step course creation flow
│   └── admin/
│       └── admin-dashboard.spec.ts # Admin panel: stats, user management
├── fixtures/
│   ├── users.fixture.ts           # User test data + factories
│   └── courses.fixture.ts         # Course, subtopic, quiz, journal fixtures
├── types/
│   └── test.types.ts              # TypeScript interfaces for test data
└── setup/
    ├── jest.setup.ts              # MSW lifecycle, polyfills, env vars
    ├── test-utils.ts              # Request builders, JWT helpers, assertions
    └── mocks/
        ├── server.ts              # MSW node server instance
        ├── handlers.ts            # Supabase REST API mock handlers
        └── openai.mock.ts         # OpenAI chat completion mocks
```

### 2.2 Test Categories Summary

| Category | Tool | Files | What It Tests |
|----------|------|-------|---------------|
| API Tests | Jest + MSW | 16 files | Route handlers called directly via `POST()` / `GET()` exports |
| Unit Tests | Jest | 2 files | Zod schemas (`parseBody`), middleware logic |
| E2E Tests | Playwright | 4 files | Real browser flows against a running dev server |

---

## 3. Jest Configuration

The Jest configuration lives in `jest.config.ts` at the project root.

```ts
// jest.config.ts (simplified)
import nextJest from 'next/jest.js';

const createJestConfig = nextJest({ dir: './' });

const customJestConfig = {
    testEnvironment: 'node',                          // Node, not jsdom — API testing needs fetch
    setupFilesAfterSetup: ['<rootDir>/tests/setup/jest.setup.ts'],
    moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },  // Path alias
    testMatch: [
        '<rootDir>/tests/**/*.test.ts',
        '<rootDir>/tests/**/*.test.tsx',
    ],
    testPathIgnorePatterns: [
        '<rootDir>/tests/e2e/',                       // E2E handled by Playwright
    ],
    collectCoverageFrom: [
        'src/app/api/**/*.ts',
        'src/lib/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/types/**',
    ],
    coverageThreshold: {
        global: {
            branches: 70,
            functions: 75,
            lines: 75,
            statements: 75,
        },
    },
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
    },
    verbose: true,
    clearMocks: true,
    testTimeout: 30000,
};

export default createJestConfig(customJestConfig);
```

**Key decisions:**

- `testEnvironment: 'node'` is used because API route handlers use the `fetch` API and `NextRequest`/`NextResponse`, which are not available in jsdom.
- `ts-jest` handles TypeScript transformation, configured via a separate `tsconfig.test.json`.
- The `@/*` path alias maps to `src/`, matching the application's path resolution.
- Coverage is collected only from `src/app/api/**` and `src/lib/**` -- frontend components are not included (no jsdom tests exist).

---

## 4. Playwright Configuration

The Playwright configuration lives in `playwright.config.ts` at the project root.

```ts
// playwright.config.ts (simplified)
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
    testDir: './tests/e2e',
    testMatch: '**/*.spec.ts',
    fullyParallel: true,
    forbidOnly: !!process.env.CI,
    retries: process.env.CI ? 2 : 0,
    workers: process.env.CI ? 1 : undefined,

    reporter: [
        ['html', { outputFolder: 'tests/e2e-report' }],
        ['json', { outputFile: 'tests/e2e-results.json' }],
        ['list'],
    ],

    use: {
        baseURL: process.env.BASE_URL || 'http://localhost:3000',
        trace: 'on-first-retry',
        screenshot: 'only-on-failure',
        video: 'on-first-retry',
        viewport: { width: 1280, height: 800 },
        actionTimeout: 15000,
        navigationTimeout: 30000,
    },

    timeout: 60000,
    expect: { timeout: 10000 },

    projects: [
        { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
        // Firefox and WebKit are commented out but available
    ],

    webServer: {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: !process.env.CI,
        timeout: 120000,
    },

    outputDir: 'tests/e2e-results',
});
```

**Key decisions:**

- Only **Chromium** is enabled. Firefox and Safari projects are present but commented out.
- The dev server is auto-started via `webServer.command` when tests run.
- On CI, tests run with **1 worker** and **2 retries**. Locally, full parallelism with no retries.
- Artifacts (screenshots, videos, traces) are captured on failure/retry, stored in `tests/e2e-results/`.
- HTML and JSON reports are written to `tests/e2e-report/` and `tests/e2e-results.json`.

**Timeouts:**

| Scope | Duration |
|-------|----------|
| Test (global) | 60 seconds |
| Action (click, fill) | 15 seconds |
| Navigation (goto, waitForURL) | 30 seconds |
| Assertion (expect) | 10 seconds |
| Web server startup | 120 seconds |

---

## 5. Test Utilities and Mocks

### 5.1 Test Utilities (`tests/setup/test-utils.ts`)

This module provides helper functions used across all Jest tests.

#### Request Builders

```ts
import { createMockNextRequest, createAuthContext } from '../../setup/test-utils';

// Create a POST request with JSON body
const request = createMockNextRequest('POST', '/api/auth/login', {
    body: { email: 'user@test.com', password: 'Pass123!' },
    headers: { 'x-csrf-token': 'token-value' },
    cookies: { access_token: 'jwt-here', csrf_token: 'token-value' },
});
```

`createMockNextRequest(method, url, options)` builds a real `NextRequest` object so that `.cookies.get()`, `.nextUrl`, and all Next.js APIs work correctly in tests.

#### JWT Helpers

```ts
import { generateJWT, verifyJWT } from '../../setup/test-utils';

const token = generateJWT({ userId: 'u1', email: 'u@test.com', role: 'user' }, '15m');
const payload = verifyJWT(token); // { userId, email, role } or null
```

#### Auth Context

```ts
import { createAuthContext, createTestContext } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';

// From a fixture user
const auth = createAuthContext(TEST_STUDENT);
// auth.token, auth.csrfToken, auth.userId, auth.cookies

// Or generate a fresh user + auth in one call
const { user, auth } = createTestContext('ADMIN');
```

#### Response Assertions

```ts
import { assertResponse, parseResponse } from '../../setup/test-utils';

// Asserts status and returns parsed JSON (throws on mismatch)
const data = await assertResponse<{ success: boolean }>(response, 200);

// Parse without assertion
const body = await parseResponse<LoginResponse>(response);
```

#### Mock Database Service

```ts
import { mockDatabaseService, cleanupTestData } from '../../setup/test-utils';

mockDatabaseService.addUser(TEST_STUDENT);
const user = mockDatabaseService.getUserByEmail('student@test.com');
const courses = mockDatabaseService.getCoursesByUser('user-id');

// Cleanup
await cleanupTestData(['test-id-1', 'test-id-2']);
```

#### Data Generators

```ts
import { createTestUserData, createTestCourseData, generateTestId } from '../../setup/test-utils';

const user = createTestUserData('user');   // { id, email, password, role, name }
const course = createTestCourseData(user.id);  // { id, title, description, ... }
const id = generateTestId('prefix');       // "prefix-1712345678-a3f8b2"
```

### 5.2 Fixtures

#### `tests/fixtures/users.fixture.ts`

Pre-built user objects for consistent test data:

| Constant | Email | Role | Purpose |
|----------|-------|------|---------|
| `TEST_STUDENT` | `test-student@example.com` | `user` | Default student for user journey tests |
| `TEST_ADMIN` | `test-admin@example.com` | `ADMIN` | Default admin for admin journey tests |
| `TEST_STUDENT_2` | `test-student-2@example.com` | `user` | Multi-user scenarios |

Factory functions:

```ts
import { createStudentFixture, createAdminFixture } from '../../fixtures/users.fixture';

const student = createStudentFixture('unique-suffix'); // Unique ID and email
const admin = createAdminFixture();                     // Auto-generated unique ID
```

Validation test data:

```ts
import { INVALID_USERS, LOGIN_CREDENTIALS, REGISTRATION_DATA } from '../../fixtures/users.fixture';

INVALID_USERS.missingEmail;    // { password, name } -- no email field
INVALID_USERS.weakPassword;    // { email, password: '123', name }
LOGIN_CREDENTIALS.validStudent; // { email, password } for TEST_STUDENT
REGISTRATION_DATA.duplicate;   // Uses TEST_STUDENT.email to test uniqueness
```

#### `tests/fixtures/courses.fixture.ts`

Pre-built course, subtopic, quiz, journal, and discussion data:

| Constant | Description |
|----------|-------------|
| `TEST_COURSE` | Beginner course owned by `TEST_STUDENT` |
| `TEST_COURSE_ADVANCED` | Advanced course owned by `TEST_STUDENT` |
| `ADMIN_COURSE` | Course owned by `TEST_ADMIN` |
| `TEST_SUBTOPIC` / `TEST_SUBTOPIC_2` | Subtopics with content, key_concepts, examples |
| `TEST_QUIZ` | Two-question quiz with correct answers |
| `QUIZ_SUBMISSION.valid` / `.partial` / `.invalid` | Quiz submission payloads |
| `ASK_QUESTION_REQUEST.valid` / `.minimal` / `.invalid` | Q&A request bodies |
| `JOURNAL_DATA.valid` / `.minimal` / `.invalid` | Journal entry payloads |
| `DISCUSSION_DATA.valid` / `.reply` / `.invalid` | Discussion payloads |
| `FEEDBACK_DATA.valid` / `.negative` / `.invalid` | Feedback payloads |
| `COURSE_GENERATION_REQUEST.valid` / `.minimal` / `.invalid` | Course generation payloads |

Factory function:

```ts
import { createCourseFixture } from '../../fixtures/courses.fixture';

const course = createCourseFixture('user-id-123', { difficulty_level: 'advanced' });
```

### 5.3 MSW Mocks

#### Server (`tests/setup/mocks/server.ts`)

```ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';

export const server = setupServer(...handlers);
```

The server is started/stopped automatically by `jest.setup.ts` (see section 5.4).

#### Supabase Handlers (`tests/setup/mocks/handlers.ts`)

MSW intercepts HTTP requests to the Supabase REST API (`https://test.supabase.co/rest/v1/*`):

| Endpoint | Method | Behavior |
|----------|--------|----------|
| `/rest/v1/users` | GET | Returns user by email query param, or empty array |
| `/rest/v1/users` | POST | Returns created user with generated ID |
| `/rest/v1/courses` | GET | Returns course list filtered by `created_by` |
| `/rest/v1/quiz_submissions` | GET/POST | Returns empty or created submission |
| `/rest/v1/journals` | GET/POST | Returns empty or created journal |
| `/rest/v1/feedback` | GET/POST | Returns empty or created feedback |
| `/rest/v1/discussions` | GET/POST | Returns empty or created discussion |
| `/rest/v1/ask_question_history` | GET | Returns sample question history |
| `/rest/v1/*` (fallback) | ALL | Returns empty array for unmatched tables |

#### OpenAI Handlers (`tests/setup/mocks/openai.mock.ts`)

MSW intercepts requests to `https://api.openai.com/v1/*`:

| Endpoint | Behavior |
|----------|----------|
| `POST /v1/chat/completions` | Returns context-aware mock: course generation (if prompt mentions "generate"/"course"), challenge thinking (if "challenge"/"think"), or generic Q&A answer |
| `GET /v1/models` | Returns model list (gpt-4, gpt-4-turbo, gpt-3.5-turbo) |
| `POST /v1/embeddings` | Returns random 1536-dim embedding vectors |

Helper functions for custom mocks:

```ts
import { createMockResponse, createErrorResponse } from '../../setup/mocks/openai.mock';

const successResponse = createMockResponse('Custom answer text', 'gpt-4');
const errorResponse = createErrorResponse('Rate limit exceeded', 'rate_limit_error');
```

### 5.4 Jest Setup (`tests/setup/jest.setup.ts`)

This file runs before every test suite. It handles:

1. **MSW lifecycle**: `beforeAll` starts the server, `afterEach` resets handlers, `afterAll` closes the server.
2. **Polyfills**: `TextEncoder`, `TextDecoder` are injected into `globalThis` for Node.js compatibility.
3. **`crypto` mock**: Provides `randomUUID()` and `getRandomValues()` for tests that generate UUIDs.
4. **Environment variables**: Sets `JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `OPENAI_API_KEY` to test values.
5. **Console filtering**: Suppresses expected React/navigation warnings during tests.
6. **Global timeout**: 30 seconds via `jest.setTimeout(30000)`.

### 5.5 Type Definitions (`tests/types/test.types.ts`)

Shared TypeScript interfaces for test data, including `TestUser`, `TestCourse`, `TestSubtopic`, `MockOpenAIResponse`, `APITestContext`, `APIResponse<T>`, `LoginResponse`, `RegisterResponse`, `DashboardStats`, `QuizSubmission`, `FeedbackItem`, `JournalEntry`, and `Discussion`.

---

## 6. Running Tests

### 6.1 Unit and API Tests (Jest)

```bash
# Run all Jest tests (unit + API)
npm test

# Watch mode -- re-runs on file changes
npm run test:watch

# Generate coverage report
npm run test:coverage

# Run API tests only (tests/api/ directory)
npm run test:unit
```

### 6.2 E2E Tests (Playwright)

```bash
# Install browsers (required on first run)
npm run playwright:install

# Run all E2E tests
npm run test:e2e

# Run user flow tests only
npm run test:e2e:user

# Run admin flow tests only
npm run test:e2e:admin

# Interactive UI mode (visual test runner)
npm run test:e2e:ui

# Headed mode (see the browser)
npm run test:e2e:headed
```

**Note:** Playwright automatically starts the dev server (`npm run dev`) if it is not already running. On CI, a fresh server is always started.

### 6.3 Combined / CI

```bash
# Run Jest then Playwright sequentially
npm run test:all

# CI mode: Jest with --ci --coverage, then Playwright
npm run test:ci
```

### 6.4 Legacy / Utility Scripts

```bash
# Legacy admin user API test (ts-node script)
npm run test:api-legacy

# Data flow test across API endpoints (ts-node script)
npm run test:dataflow
```

---

## 7. Writing New Tests

### 7.1 API Test Template

API tests import the route handler function directly and call it with a mock `NextRequest`. Dependencies are mocked at the module boundary using `jest.mock()`.

```ts
/**
 * API test for POST /api/example
 */
import { createMockNextRequest } from '../../setup/test-utils';
import { TEST_STUDENT } from '../../fixtures/users.fixture';

// 1. Mock dependencies BEFORE importing the route handler
const mockGetRecords = jest.fn();
jest.mock('@/lib/database', () => ({
    DatabaseService: {
        getRecords: (...args: any[]) => mockGetRecords(...args),
    },
    adminDb: {
        from: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
    },
}));

jest.mock('@/lib/rate-limit', () => ({
    loginRateLimiter: { isAllowed: jest.fn().mockReturnValue(true) },
}));

// 2. Import the route handler AFTER mocks are declared
import { POST } from '@/app/api/example/route';

describe('POST /api/example', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should return 200 for valid request', async () => {
        // 3. Arrange: set up mock return values
        mockGetRecords.mockResolvedValue([{ id: '1', name: 'Test' }]);

        // 4. Act: create request and call handler
        const request = createMockNextRequest('POST', '/api/example', {
            body: { name: 'Test' },
            cookies: { access_token: 'valid-token' },
        });

        const response = await POST(request);
        const data = await response.json();

        // 5. Assert
        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
    });

    it('should return 400 for missing required fields', async () => {
        const request = createMockNextRequest('POST', '/api/example', {
            body: {},
        });

        const response = await POST(request);
        expect(response.status).toBe(400);
    });

    it('should return 500 when database fails', async () => {
        mockGetRecords.mockRejectedValue(new Error('Connection refused'));

        const request = createMockNextRequest('POST', '/api/example', {
            body: { name: 'Test' },
        });

        const response = await POST(request);
        expect(response.status).toBe(500);
    });
});
```

**Important patterns:**

- Declare `jest.mock()` calls **before** importing the route handler. Jest hoists these declarations, but the mock function references (`mockGetRecords`) must be declared before use.
- Each test should cover at least three paths: **success**, **validation error**, and **server error**.
- Use `createMockNextRequest` instead of manually constructing `NextRequest` -- it handles URL resolution, headers, cookies, and body serialization.

### 7.2 Middleware Test Template

Middleware tests import the `middleware` function from the root `middleware.ts` and pass in `NextRequest` objects directly:

```ts
import { NextRequest } from 'next/server';

// Mock token verification
const mockVerifyToken = jest.fn();
jest.mock('@/lib/jwt', () => ({
    verifyToken: (...args: any[]) => mockVerifyToken(...args),
}));

import { middleware } from '../../../middleware';

function createRequest(path: string, cookies?: Record<string, string>): NextRequest {
    const url = new URL(path, 'http://localhost:3000');
    const req = new NextRequest(url);
    if (cookies) {
        for (const [name, value] of Object.entries(cookies)) {
            req.cookies.set(name, value);
        }
    }
    return req;
}

describe('Middleware', () => {
    it('returns JSON 401 for unauthenticated API routes', async () => {
        const req = createRequest('/api/courses');
        const res = middleware(req);

        expect(res.status).toBe(401);
        const body = await res.json();
        expect(body.error).toBe('Authentication required');
    });

    it('allows public routes without auth', async () => {
        const req = createRequest('/login');
        const res = middleware(req);

        expect(res.status).toBe(200);
    });
});
```

### 7.3 Unit Test Template (Zod Schemas)

Schema tests validate parsing, transformation, and rejection behavior:

```ts
import { LoginSchema, parseBody } from '@/lib/schemas';

describe('LoginSchema', () => {
    it('should accept valid login data', () => {
        const result = LoginSchema.safeParse({
            email: 'Test@Example.com',
            password: 'pass123',
        });
        expect(result.success).toBe(true);
        if (result.success) {
            // Verify email is trimmed and lowercased
            expect(result.data.email).toBe('test@example.com');
        }
    });

    it('should reject missing email', () => {
        const result = LoginSchema.safeParse({ password: 'pass123' });
        expect(result.success).toBe(false);
    });

    it('should default rememberMe to false', () => {
        const result = LoginSchema.safeParse({
            email: 'user@test.com',
            password: 'pass123',
        });
        if (result.success) {
            expect(result.data.rememberMe).toBe(false);
        }
    });
});
```

### 7.4 E2E Test Template (Playwright)

E2E tests interact with the running application through a real browser:

```ts
import { test, expect, type Page } from '@playwright/test';

// Helper for repeated actions
async function loginUser(page: Page, email: string, password: string) {
    await page.goto('/login');
    await page.locator('input#login-email').fill(email);
    await page.locator('input#login-password').fill(password);
    await page.click('button[type="submit"]');
}

test.describe('Feature Name', () => {
    test('should display the page correctly', async ({ page }) => {
        await page.goto('/some-route');

        // Assert page elements are visible
        await expect(page.locator('h1')).toContainText('Expected Title');
        await expect(page.locator('button[type="submit"]')).toBeVisible();
    });

    test('should handle form submission', async ({ page }) => {
        await page.goto('/some-route');

        // Fill form
        await page.locator('input#field-name').fill('value');
        await page.click('button[type="submit"]');

        // Wait for navigation or response
        await page.waitForURL(/expected-route/, { timeout: 15000 });

        // Verify result
        await expect(page.locator('.success-message')).toBeVisible();
    });

    test('should show validation errors', async ({ page }) => {
        await page.goto('/some-route');

        // Submit empty form
        await page.click('button[type="submit"]');

        // Should stay on page or show error
        await expect(page).toHaveURL(/some-route/);
    });
});
```

**Important patterns:**

- Use `page.locator()` with specific selectors (IDs, `data-testid`, or descriptive CSS). Avoid fragile selectors like `:nth-child`.
- Use `page.waitForURL()` or `page.waitForSelector()` instead of `page.waitForTimeout()` when possible.
- Use `isVisible().catch(() => false)` for elements that may not exist -- avoids hard failures for optional UI elements.
- Generate unique test data (e.g., `test-${Date.now()}@example.com`) to avoid collisions between parallel runs.

---

## 8. Coverage Report

### Generating Coverage

```bash
npm run test:coverage
```

This runs Jest with the `--coverage` flag and writes output to the `coverage/` directory.

### Thresholds

Defined in `jest.config.ts` under `coverageThreshold.global`:

| Metric | Threshold |
|--------|-----------|
| Branches | 70% |
| Functions | 75% |
| Lines | 75% |
| Statements | 75% |

If any metric falls below its threshold, the test run fails. CI (`npm run test:ci`) enforces this automatically.

### Coverage Scope

Coverage is collected from:

- `src/app/api/**/*.ts` -- All API route handlers
- `src/lib/**/*.ts` -- All library/utility modules

Excluded from coverage:

- `src/**/*.d.ts` -- Type declaration files
- `src/**/types/**` -- Type definition directories
- Frontend components, hooks, and context providers (no jsdom tests)

### Viewing the Report

After running `npm run test:coverage`, open `coverage/lcov-report/index.html` in a browser to see a line-by-line HTML coverage report.

---

## 9. Best Practices

### General

- **Use fixtures for consistent data.** Import from `tests/fixtures/` instead of creating ad-hoc objects. This prevents drift between tests and ensures shared constants stay in sync.
- **Test behavior, not implementation.** Assert on HTTP status codes, response bodies, and side effects (cookies, headers). Do not assert on internal function call counts unless testing integration points.
- **Cover three paths per endpoint.** Every API test file should cover success, validation error (400), and server error (500) at minimum.
- **Clean up state.** Use `beforeEach(() => jest.clearAllMocks())` in every describe block. For the mock database, call `mockDatabaseService.reset()`.

### Jest-Specific

- **Mock at module boundaries.** Use `jest.mock('@/lib/database')` to replace entire modules. Declare mock references (`const mockFn = jest.fn()`) before `jest.mock()` calls so they are available in the mock factory.
- **Import after mocking.** The route handler import (`import { POST } from '@/app/api/.../route'`) must come after all `jest.mock()` declarations.
- **Avoid real network calls.** MSW handlers intercept Supabase and OpenAI calls. If a test needs custom responses, use `server.use()` to add one-off handlers within that test.

### Playwright-Specific

- **Use explicit waits.** Prefer `page.waitForURL()`, `page.waitForSelector()`, and `expect(...).toBeVisible()` over `page.waitForTimeout()`.
- **Generate unique test data.** Use timestamps in emails and IDs (`test-${Date.now()}@example.com`) to prevent conflicts in parallel execution.
- **Handle optional elements gracefully.** Use `isVisible().catch(() => false)` when checking for UI elements that may not exist in all states.
- **Keep selectors stable.** Use element IDs (`input#login-email`), `data-testid` attributes, or semantic selectors (`button[type="submit"]`). Avoid positional selectors.

---

## 10. Known Gaps and Improvements

### Current Gaps

| Gap | Impact | Notes |
|-----|--------|-------|
| **17 API routes without tests** | Medium | Debug routes, some admin activity endpoints (`/api/admin/activity/*`), and several feature endpoints lack coverage |
| **No frontend component tests** | Medium | No jsdom/React Testing Library tests exist. Components are only tested indirectly via E2E |
| **Chromium only for E2E** | Low | Firefox and Safari configs are commented out in `playwright.config.ts` |
| **No contract testing** | Low | No automated verification that frontend `apiFetch()` calls match API response shapes |
| **No load/performance testing** | Low | No benchmarks for concurrent users, API response times, or AI endpoint latency |
| **No visual regression testing** | Low | No screenshot comparison for UI consistency |

### Recommended Improvements

1. **Add Firefox/Safari E2E projects** -- Uncomment the browser configs in `playwright.config.ts` and fix any cross-browser issues.
2. **Add React Testing Library tests** -- Cover critical components (quiz, course viewer, auth forms) with jsdom-based unit tests. Requires adding a `testEnvironment: 'jsdom'` project in Jest config.
3. **Add API contract tests** -- Use a shared schema (e.g., Zod types exported from `src/lib/schemas.ts`) to validate both request and response shapes in tests.
4. **Cover remaining API routes** -- Prioritize `generate-examples`, `generate-subtopic`, `challenge-feedback`, `transcript/save`, and admin activity endpoints.
5. **Add CI pipeline integration** -- Run `npm run test:ci` in GitHub Actions with coverage upload to a reporting service.
