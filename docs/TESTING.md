# Testing Documentation - PrincipleLearn V3

This document describes the testing strategy, tooling, configuration, and conventions used in the PrincipleLearn V3 project. It targets developers contributing new tests or maintaining the existing suite.

Cross-references:
- [ARCHITECTURE.md](ARCHITECTURE.md) — service boundaries the tests target
- [API_REFERENCE.md](API_REFERENCE.md) — endpoint contracts under test
- [SECURITY.md](SECURITY.md) — JWT, CSRF, and middleware patterns the tests assert against

---

## 1. Overview

PrincipleLearn V3 uses a three-layer testing strategy:

| Layer | Tool | Purpose |
|-------|------|---------|
| **Unit tests** | Jest | Pure functions, Zod schemas, serializers, client-side helpers |
| **API tests** | Jest + MSW | Next.js App Router route handlers invoked directly with a real `NextRequest` |
| **E2E tests** | Playwright | Full browser flows against the dev server (or a remote `BASE_URL`) |

**Repository snapshot (current):**

- **35 Jest test files**: 27 under `tests/api/`, 7 under `tests/unit/`, 1 under `tests/api/middleware/`
- **8 Playwright specs**: 5 user, 2 admin, 1 mobile
- **Coverage thresholds**: 70% branches / 75% functions / 75% lines / 75% statements (enforced)
- **Network mocking**: MSW 2.x intercepts Supabase REST and OpenAI HTTP calls for Jest

**Stack:**

- Jest 30 + ts-jest 29 (TypeScript transform)
- `jest-environment-jsdom` is installed but NOT the default — Jest runs in `node` so `fetch`/`NextRequest`/`NextResponse` work
- Playwright 1.58 (Chromium + a Pixel 5 mobile project)
- MSW 2.12 (`msw/node` server)
- `node-mocks-http` 1.17 (auxiliary; primary request builder uses real `NextRequest`)
- `@testing-library/react` + `@testing-library/jest-dom` (available for future jsdom suites)

---

## 2. Directory Layout

```
tests/
├── api/                                    # Jest API route tests (28 files)
│   ├── admin/
│   │   ├── activity-quiz.test.ts
│   │   ├── activity-summary.test.ts
│   │   ├── admin-contracts.test.ts
│   │   ├── dashboard.test.ts
│   │   ├── discussions.test.ts
│   │   ├── insights.test.ts
│   │   ├── logout.test.ts
│   │   └── research.test.ts
│   ├── ai/
│   │   └── challenge-thinking.test.ts
│   ├── auth/
│   │   ├── login.test.ts
│   │   ├── logout.test.ts
│   │   ├── me.test.ts
│   │   ├── refresh.test.ts
│   │   └── register.test.ts
│   ├── courses/
│   │   ├── courses.test.ts
│   │   └── delete.test.ts
│   ├── generate-course/
│   │   └── generate.test.ts
│   ├── learning/
│   │   ├── ask-question.test.ts
│   │   ├── challenge-feedback.test.ts
│   │   ├── challenge-response.test.ts
│   │   ├── feedback-route.test.ts
│   │   ├── jurnal-save.test.ts
│   │   ├── quiz-status-regenerate.test.ts
│   │   ├── quiz-submit.test.ts
│   │   └── user-progress.test.ts
│   ├── middleware/
│   │   └── middleware.test.ts
│   └── security/
│       └── rate-limit.test.ts
├── unit/                                   # Jest unit tests (7 files)
│   ├── admin-prompt-stage.test.ts
│   ├── admin-quiz-attempts.test.ts
│   ├── admin-reflection-activity.test.ts
│   ├── admin-reflection-summary.test.ts
│   ├── api-client.test.ts
│   ├── discussion-serializers.test.ts
│   ├── schemas.test.ts
│   └── supabase-batch.test.ts
├── e2e/                                    # Playwright specs (8 files)
│   ├── admin/
│   │   ├── admin-dashboard.spec.ts
│   │   └── admin-smoke.spec.ts
│   ├── mobile/
│   │   └── public-mobile.spec.ts
│   └── user/
│       ├── dashboard.spec.ts
│       ├── discussion-scroll.spec.ts
│       ├── full-learning-flow.spec.ts
│       ├── generate-course.spec.ts
│       └── signup-login.spec.ts
├── fixtures/
│   ├── courses.fixture.ts                  # TEST_COURSE, TEST_SUBTOPIC, quiz/journal/discussion payloads
│   └── users.fixture.ts                    # TEST_STUDENT, TEST_ADMIN, INVALID_USERS, LOGIN_CREDENTIALS
├── setup/
│   ├── jest.setup.ts                       # MSW lifecycle, polyfills, env vars
│   ├── test-utils.ts                       # createMockNextRequest, JWT helpers, assertResponse, mockDatabaseService
│   └── mocks/
│       ├── handlers.ts                     # Supabase REST handlers
│       ├── openai.mock.ts                  # OpenAI chat/models/embeddings handlers + helpers
│       └── server.ts                       # `setupServer(...handlers)` instance
├── types/
│   └── test.types.ts                       # Shared TestUser/TestCourse/TestSubtopic interfaces
├── e2e-report/                             # Playwright HTML report output (NOT in .gitignore)
└── e2e-results/                            # Playwright traces, videos, screenshots (NOT in .gitignore)
```

> The `e2e-report/` and `e2e-results/` directories are written by Playwright but are not gitignored. Only `/coverage` is ignored. If you commit, exclude artifacts manually or extend `.gitignore`.

---

## 3. Jest Configuration

Defined in [`jest.config.ts`](../jest.config.ts) and bootstrapped via `next/jest`.

```ts
// jest.config.ts (excerpt)
const customJestConfig: Config = {
    testEnvironment: 'node',
    setupFilesAfterEnv: ['<rootDir>/tests/setup/jest.setup.ts'],
    moduleNameMapper: { '^@/(.*)$': '<rootDir>/src/$1' },
    testMatch: [
        '<rootDir>/tests/**/*.test.ts',
        '<rootDir>/tests/**/*.test.tsx',
    ],
    testPathIgnorePatterns: [
        '<rootDir>/node_modules/',
        '<rootDir>/.next/',
        '<rootDir>/tests/e2e/',
    ],
    collectCoverageFrom: [
        'src/app/api/**/*.ts',
        'src/lib/**/*.ts',
        '!src/**/*.d.ts',
        '!src/**/types/**',
    ],
    coverageThreshold: {
        global: { branches: 70, functions: 75, lines: 75, statements: 75 },
    },
    transform: {
        '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
    },
    moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
    verbose: true,
    clearMocks: true,
    testTimeout: 30000,
};
```

**Notes:**

- `testEnvironment: 'node'` is required — App Router handlers depend on Web `fetch`, `Headers`, `Request`/`Response`, and `NextRequest`/`NextResponse`.
- TypeScript transformation uses [`tsconfig.test.json`](../tsconfig.test.json) which extends the base `tsconfig.json` and adds `node` + `jest` types and `isolatedModules: true`.
- The `@/*` path alias maps to `src/*`.
- Coverage is collected only from `src/app/api/**` and `src/lib/**`. Frontend components are not yet covered because no jsdom suites exist.
- Default per-test timeout is 30 s (overridden globally to 30 s in `jest.setup.ts` as well).

---

## 4. Playwright Configuration

Defined in [`playwright.config.ts`](../playwright.config.ts).

```ts
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
        { name: 'chromium', use: { ...devices['Desktop Chrome'] }, testIgnore: '**/mobile/*.spec.ts' },
        { name: 'mobile-chrome', use: { ...devices['Pixel 5'] }, testMatch: '**/mobile/*.spec.ts' },
        // firefox / webkit available but commented out
    ],

    // webServer is only configured when BASE_URL is unset (i.e. local dev runs).
    // Setting BASE_URL=https://example.com runs the suite against a remote deployment.
    ...(!process.env.BASE_URL ? {
        webServer: {
            command: 'npm run dev',
            url: 'http://localhost:3000',
            reuseExistingServer: !process.env.CI,
            timeout: 120000,
        },
    } : {}),

    outputDir: 'tests/e2e-results',
});
```

**Projects:**

| Project | Device | Files |
|---------|--------|-------|
| `chromium` | Desktop Chrome (1280x800) | All specs except `**/mobile/*.spec.ts` |
| `mobile-chrome` | Pixel 5 emulation | `tests/e2e/mobile/*.spec.ts` only |

**Timeouts:**

| Scope | Duration |
|-------|----------|
| Test (global) | 60 s |
| Action (click, fill) | 15 s |
| Navigation (`goto`, `waitForURL`) | 30 s |
| Assertion (`expect`) | 10 s |
| Web server startup | 120 s |

**Remote runs:** set `BASE_URL=https://your-deployment.vercel.app` before `npm run test:e2e` to skip the local webServer and target a remote URL. `tests/e2e/user/full-learning-flow.spec.ts` defaults to the production Vercel URL when `BASE_URL` is unset inside the spec.

---

## 5. Test Utilities and Mocks

### 5.1 [`tests/setup/test-utils.ts`](../tests/setup/test-utils.ts)

#### Request builders

```ts
import { createMockNextRequest } from '../../setup/test-utils';

const request = createMockNextRequest('POST', '/api/auth/login', {
    body: { email: 'user@test.com', password: 'Pass123!' },
    headers: { 'x-csrf-token': 'token-value' },
    cookies: { access_token: 'jwt-here', csrf_token: 'token-value' },
});
```

`createMockNextRequest(method, url, options)` constructs a real `NextRequest`, so `.cookies.get()`, `.nextUrl`, headers, and JSON body parsing all behave exactly like in production.

A secondary `createMockRequest()` / `createMockResponse()` pair wraps `node-mocks-http` for the few legacy tests that still expect Express-shaped req/res objects.

#### JWT and auth context

```ts
import { generateJWT, verifyJWT, createAuthContext, createTestContext } from '../../setup/test-utils';

const token = generateJWT({ userId: 'u1', email: 'u@test.com', role: 'user' }, '15m');
const payload = verifyJWT(token);            // { userId, email, role } | null

const auth = createAuthContext(TEST_STUDENT); // { token, csrfToken, userId, cookies }
const { user, auth } = createTestContext('ADMIN'); // generates a fresh user + auth
```

`generateJWT` signs with the same `JWT_SECRET` env var that the route handlers verify against (`'test-jwt-secret-key-for-testing-purposes-only'` is set in `jest.setup.ts`).

#### Response assertions

```ts
import { assertResponse, parseResponse, extractCookies } from '../../setup/test-utils';

const data = await assertResponse<{ success: boolean }>(response, 200);
const body = await parseResponse<LoginResponse>(response);
const cookies = extractCookies(response); // Map of Set-Cookie names → values
```

#### In-memory fake DB

```ts
import { mockDatabaseService, cleanupTestData } from '../../setup/test-utils';

mockDatabaseService.addUser(TEST_STUDENT);
mockDatabaseService.getUserByEmail('test-student@example.com');
mockDatabaseService.getCoursesByUser('user-id');
mockDatabaseService.reset();
```

This is a Map-backed shim, separate from MSW. Most route tests prefer `jest.mock('@/lib/database', ...)` instead, but `mockDatabaseService` is convenient for service-layer unit tests.

#### Data generators

```ts
import { createTestUserData, createTestCourseData, generateTestId } from '../../setup/test-utils';

const user = createTestUserData('user');     // unique id + email each call
const course = createTestCourseData(user.id);
const id = generateTestId('prefix');         // "prefix-1712345678-a3f8b2"
```

### 5.2 Fixtures

#### [`tests/fixtures/users.fixture.ts`](../tests/fixtures/users.fixture.ts)

| Constant | Email | Role |
|----------|-------|------|
| `TEST_STUDENT` | `test-student@example.com` | `user` |
| `TEST_STUDENT_2` | `test-student-2@example.com` | `user` |
| `TEST_ADMIN` | `test-admin@example.com` | `ADMIN` |

Plus factories `createStudentFixture(suffix?)` / `createAdminFixture(suffix?)` and validation buckets `INVALID_USERS`, `REGISTRATION_DATA`, `LOGIN_CREDENTIALS`.

#### [`tests/fixtures/courses.fixture.ts`](../tests/fixtures/courses.fixture.ts)

Provides `TEST_COURSE`, `TEST_COURSE_ADVANCED`, `ADMIN_COURSE`, `TEST_SUBTOPIC` / `TEST_SUBTOPIC_2`, `TEST_QUIZ`, plus payload buckets `QUIZ_SUBMISSION`, `ASK_QUESTION_REQUEST`, `JOURNAL_DATA`, `DISCUSSION_DATA`, `FEEDBACK_DATA`, `COURSE_GENERATION_REQUEST` (each with `.valid` / `.minimal` / `.invalid` variants), and `createCourseFixture(userId, overrides?)`.

To extend a fixture, prefer spreading rather than mutating:

```ts
import { TEST_COURSE } from '../../fixtures/courses.fixture';
const advancedCourse = { ...TEST_COURSE, difficulty_level: 'advanced', id: generateTestId('course') };
```

### 5.3 MSW handlers

#### Server: [`tests/setup/mocks/server.ts`](../tests/setup/mocks/server.ts)

```ts
import { setupServer } from 'msw/node';
import { handlers } from './handlers';
export const server = setupServer(...handlers);
```

Started/reset/closed automatically by `jest.setup.ts`:

```ts
beforeAll(() => server?.listen({ onUnhandledRequest: 'warn' }));
afterEach(() => server?.resetHandlers());
afterAll(() => server?.close());
```

#### Supabase: [`tests/setup/mocks/handlers.ts`](../tests/setup/mocks/handlers.ts)

Intercepts `https://test.supabase.co/rest/v1/*` (the URL is set by `NEXT_PUBLIC_SUPABASE_URL` in `jest.setup.ts`):

| Endpoint | Method | Behavior |
|----------|--------|----------|
| `/rest/v1/users` | GET | Returns scripted student/admin row when `email=eq.test@example.com` or `eq.admin@example.com`, otherwise `[]` |
| `/rest/v1/users` | POST | Echoes body with synthetic `id` and `created_at` |
| `/rest/v1/courses` | GET | Returns one canned course filtered by `created_by` |
| `/rest/v1/quiz_submissions` | GET / POST | `[]` / created submission |
| `/rest/v1/journals` | GET / POST | `[]` / created journal |
| `/rest/v1/feedback` | GET / POST | `[]` / created feedback |
| `/rest/v1/discussions` | GET / POST | `[]` / created discussion |
| `/rest/v1/ask_question_history` | GET | Returns one sample row |
| `/rest/v1/*` (fallback) | ALL | `[]` |

Override per test with `server.use(http.get(...))`. Handlers reset after each test.

#### OpenAI: [`tests/setup/mocks/openai.mock.ts`](../tests/setup/mocks/openai.mock.ts)

Intercepts `https://api.openai.com/v1/*`:

| Endpoint | Behavior |
|----------|----------|
| `POST /v1/chat/completions` | Inspects the joined `messages[].content` and returns one of three canned shapes: `courseGeneration` (when prompt mentions "generate"/"course"), `challengeThinking` ("challenge"/"think"), or generic `askQuestion`. Adds a 100 ms delay. |
| `GET /v1/models` | Returns `gpt-4`, `gpt-4-turbo`, `gpt-3.5-turbo` |
| `POST /v1/embeddings` | Returns random 1536-dim vectors |

Helper builders for one-off mocks:

```ts
import { createMockResponse, createErrorResponse } from '../../setup/mocks/openai.mock';

const success = createMockResponse('Custom answer text', 'gpt-4');
const error   = createErrorResponse('Rate limit exceeded', 'rate_limit_error');
```

> Note: most route tests bypass MSW for OpenAI by `jest.mock('@/services/ai.service', ...)` and stubbing `chatCompletionStream` directly — that yields more deterministic streaming control. MSW handlers are the fallback for tests that hit the real `openai` SDK.

### 5.4 [`tests/setup/jest.setup.ts`](../tests/setup/jest.setup.ts)

Runs in `setupFilesAfterEnv`. It:

1. Polyfills `TextEncoder` / `TextDecoder` on `globalThis`.
2. Optionally loads MSW (wrapped in `try/catch` so missing handlers warn instead of crash).
3. Wires `beforeAll` / `afterEach` / `afterAll` for MSW lifecycle.
4. Sets test env vars: `JWT_SECRET`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`.
5. Filters expected React/navigation noise from `console.error`.
6. Calls `jest.setTimeout(30000)`.
7. Stubs `globalThis.crypto` with `randomUUID()` and `getRandomValues()`.

### 5.5 [`tests/types/test.types.ts`](../tests/types/test.types.ts)

Shared TypeScript interfaces re-exported by fixtures and tests: `TestUser`, `TestCourse`, `TestSubtopic`, `MockOpenAIResponse`, `APITestContext`, `APIResponse<T>`, `LoginResponse`, `RegisterResponse`, `DashboardStats`, `QuizSubmission`, `FeedbackItem`, `JournalEntry`, `Discussion`.

---

## 6. Running Tests

### 6.1 Jest (unit + API)

```bash
npm test                        # all Jest tests (unit + api)
npm run test:watch              # watch mode
npm run test:coverage           # with --coverage
npm run test:unit               # tests/api only

# Single file
npx jest tests/api/auth/login.test.ts

# Filter by test name
npx jest --testNamePattern="should return 401"

# Single describe block
npx jest tests/api/auth/login.test.ts -t "Successful Login"
```

### 6.2 Playwright (E2E)

```bash
npm run playwright:install      # install browsers (first run only)

npm run test:e2e                # full E2E suite
npm run test:e2e:user           # tests/e2e/user
npm run test:e2e:admin          # tests/e2e/admin
npm run test:e2e:admin:smoke    # admin-smoke.spec.ts on chromium only
npm run test:e2e:ui             # Playwright UI mode
npm run test:e2e:headed         # headed browser

# Single spec
npx playwright test tests/e2e/user/signup-login.spec.ts

# Single test by title
npx playwright test -g "should login successfully"

# Single project
npx playwright test --project=mobile-chrome

# Against a remote deployment
BASE_URL=https://principle-learn-v3.vercel.app npx playwright test
```

The dev server (`npm run dev`) auto-starts when `BASE_URL` is unset; `reuseExistingServer` is true locally, false on CI.

### 6.3 Combined / CI

```bash
npm run test:all                # Jest then Playwright
npm run test:ci                 # jest --ci --coverage && playwright test
```

### 6.4 Legacy ad-hoc scripts

```bash
npm run test:api-legacy         # ts-node scripts/test-admin-user-api.ts
npm run test:dataflow           # ts-node scripts/test-api-endpoints.ts
```

These hit a running server end-to-end; treat them as smoke utilities, not part of the regular suite.

---

## 7. Coverage

Generated by `npm run test:coverage` (or `npm run test:ci`).

| Metric | Threshold |
|--------|-----------|
| Branches | 70% |
| Functions | 75% |
| Lines | 75% |
| Statements | 75% |

Falling below any metric fails the run. Reports land in `coverage/`:

- `coverage/lcov.info` — for external tools
- `coverage/lcov-report/index.html` — open in a browser for line-by-line view
- `coverage/coverage-final.json` — machine-readable

Coverage is collected only from `src/app/api/**/*.ts` and `src/lib/**/*.ts`. Frontend components, hooks, and context providers are excluded because no jsdom suites exist yet.

---

## 8. Writing New Tests

**Naming:** mirror the source path. `src/app/api/auth/login/route.ts` → `tests/api/auth/login.test.ts`. Pure-logic helpers in `src/lib/foo.ts` → `tests/unit/foo.test.ts`.

**File suffixes:** `.test.ts` / `.test.tsx` for Jest, `.spec.ts` for Playwright.

**Per-endpoint coverage budget:** at least three paths — success, validation error (400), server error (500). Auth routes additionally cover 401.

### 8.1 Auth route — `POST /api/auth/login`

```ts
import { createMockNextRequest } from '../../setup/test-utils';
import { LOGIN_CREDENTIALS, TEST_STUDENT } from '../../fixtures/users.fixture';

// 1. Declare mock refs BEFORE jest.mock factories so hoisting works
const mockGetRecords = jest.fn();
jest.mock('@/lib/database', () => ({
    DatabaseService: { getRecords: (...args: any[]) => mockGetRecords(...args) },
    adminDb: { from: jest.fn(() => ({ select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(), single: jest.fn().mockResolvedValue({ data: null, error: null }) })) },
    DatabaseError: class extends Error {},
}));
jest.mock('bcryptjs', () => ({ compare: jest.fn() }));
jest.mock('@/lib/jwt', () => ({
    ACCESS_TOKEN_MAX_AGE_SECONDS: 900,
    REFRESH_TOKEN_MAX_AGE_SECONDS: 259200,
    generateAccessToken: jest.fn(() => 'mock-access-token'),
    generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
    getTokenExpiration: jest.fn(() => new Date(Date.now() + 259200000)),
    verifyToken: jest.fn(),
}));
jest.mock('@/lib/rate-limit', () => ({
    loginRateLimiter: { isAllowed: jest.fn().mockReturnValue(true) },
}));

// 2. Import the handler AFTER mocks
import { POST } from '@/app/api/auth/login/route';
import bcrypt from 'bcryptjs';

describe('POST /api/auth/login', () => {
    beforeEach(() => jest.clearAllMocks());

    it('returns 200 + sets cookies on valid credentials', async () => {
        mockGetRecords.mockResolvedValue([{ ...TEST_STUDENT, password_hash: 'h' }]);
        (bcrypt.compare as jest.Mock).mockResolvedValue(true);

        const req = createMockNextRequest('POST', '/api/auth/login', { body: LOGIN_CREDENTIALS.validStudent });
        const res = await POST(req);

        expect(res.status).toBe(200);
        expect(res.headers.getSetCookie().some(c => c.startsWith('access_token='))).toBe(true);
    });
});
```

### 8.2 AI streaming route — `POST /api/ask-question`

The route uses `chatCompletionStream()` from `src/services/ai.service.ts` and pipes it through `openAIStreamToReadable`. Stub both:

```ts
const mockChatCompletionStream = jest.fn();
jest.mock('@/services/ai.service', () => ({
    chatCompletionStream: (...args: any[]) => mockChatCompletionStream(...args),
    openAIStreamToReadable: (stream: AsyncIterable<any>, opts?: { onComplete?: (t: string) => any }) => {
        const enc = new TextEncoder();
        let text = '';
        return new ReadableStream({
            async start(ctrl) {
                for await (const chunk of stream) {
                    const d = chunk?.choices?.[0]?.delta?.content;
                    if (d) { text += d; ctrl.enqueue(enc.encode(d)); }
                }
                if (opts?.onComplete) await opts.onComplete(text);
                ctrl.close();
            },
        });
    },
    STREAM_HEADERS: { 'Content-Type': 'text/plain; charset=utf-8' },
    sanitizePromptInput: (s: string) => s,
}));

beforeEach(() => {
    mockChatCompletionStream.mockResolvedValue({
        stream: (async function* () {
            yield { choices: [{ delta: { content: 'mocked answer' } }] };
        })(),
        cancelTimeout: jest.fn(),
    });
});
```

Read the full body via `await response.text()` rather than `.json()`.

### 8.3 Admin route with role check — `GET /api/admin/dashboard`

```ts
import { NextRequest } from 'next/server';
import { sign } from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET!;

let tableData: Record<string, any[]> = {};
const mockFrom = jest.fn(/* see tests/api/admin/dashboard.test.ts for the full chainable mock */);

jest.mock('@/lib/database', () => ({ adminDb: { from: (...a: any[]) => mockFrom(...a) } }));
jest.mock('@/lib/api-middleware', () => ({ withCacheHeaders: (r: any) => r }));

import { GET } from '@/app/api/admin/dashboard/route';

function adminRequest(path: string) {
    const token = sign({ userId: 'admin', email: 'a@x', role: 'ADMIN' }, JWT_SECRET);
    const req = new NextRequest(new URL(path, 'http://localhost:3000'));
    req.cookies.set('access_token', token);
    return req;
}

it('returns 200 for admin', async () => {
    tableData = { users: [], courses: [] };
    const res = await GET(adminRequest('/api/admin/dashboard'));
    expect(res.status).toBe(200);
});
```

### 8.4 Service / pure-function unit test

Service-layer tests live under `tests/unit/`. Mock only what touches I/O:

```ts
import { LoginSchema } from '@/lib/schemas';

describe('LoginSchema', () => {
    it('lowercases and trims email', () => {
        const r = LoginSchema.safeParse({ email: '  Test@Example.com  ', password: 'pass123' });
        expect(r.success).toBe(true);
        if (r.success) expect(r.data.email).toBe('test@example.com');
    });

    it('defaults rememberMe to false', () => {
        const r = LoginSchema.safeParse({ email: 'a@b.com', password: 'pass123' });
        if (r.success) expect(r.data.rememberMe).toBe(false);
    });
});
```

### 8.5 Playwright E2E happy path

```ts
import { test, expect, type Page } from '@playwright/test';

async function loginUser(page: Page, email: string, password: string) {
    await page.goto('/login');
    await page.locator('input#login-email').fill(email);
    await page.locator('input#login-password').fill(password);
    await page.click('button[type="submit"]');
    await page.waitForURL(/\/dashboard/, { timeout: 15000 });
}

test.describe('User dashboard', () => {
    test('renders course list after login', async ({ page }) => {
        await loginUser(page, 'test-student@example.com', 'TestPassword123!');
        await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
    });
});
```

Use unique-per-run identifiers (`test-${Date.now()}@example.com`) for any data the test creates so parallel workers don't collide.

---

## 9. Mocking Patterns

### 9.1 Mocking `adminDb` (Supabase chainable client)

`adminDb.from(...).select(...).eq(...).single()` returns a thenable. Mock as a chainable object:

```ts
const mockSingle = jest.fn().mockResolvedValue({ data: null, error: null });
jest.mock('@/lib/database', () => ({
    adminDb: {
        from: jest.fn(() => ({
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            limit: jest.fn().mockReturnThis(),
            order: jest.fn().mockReturnThis(),
            single: mockSingle,
            insert: jest.fn().mockResolvedValue({ data: null, error: null }),
            update: jest.fn().mockResolvedValue({ data: null, error: null }),
        })),
    },
    DatabaseService: { getRecords: jest.fn() },
    DatabaseError: class extends Error {},
}));
```

For tests that need to dispatch on the table name, see `tests/api/admin/dashboard.test.ts` for a fully thenable chain backed by an in-memory `tableData` map.

### 9.2 Mocking JWT verification

```ts
const mockVerifyToken = jest.fn();
jest.mock('@/lib/jwt', () => ({
    verifyToken: (...args: any[]) => mockVerifyToken(...args),
    generateAccessToken: jest.fn(() => 'mock-access-token'),
    generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
}));

mockVerifyToken.mockReturnValue({ userId: 'u1', email: 'u@x', role: 'user' });
```

Or use the real `jsonwebtoken` and sign with `process.env.JWT_SECRET` (set by `jest.setup.ts`).

### 9.3 Mocking CSRF

The `csrf_token` cookie must equal the `x-csrf-token` header value. Pass identical strings in `createMockNextRequest`:

```ts
createMockNextRequest('POST', '/api/x', {
    body: { ... },
    headers: { 'x-csrf-token': 'tok' },
    cookies:  { csrf_token:    'tok', access_token: jwt },
});
```

### 9.4 Bypassing `withApiLogging`

```ts
jest.mock('@/lib/api-logger', () => ({
    withApiLogging: (handler: any) => handler,
    logApiCall: jest.fn().mockResolvedValue(undefined),
}));
```

### 9.5 Bypassing rate limiting

```ts
jest.mock('@/lib/rate-limit', () => ({
    loginRateLimiter: { isAllowed: jest.fn().mockReturnValue(true) },
    registerRateLimiter: { isAllowed: jest.fn().mockReturnValue(true) },
}));
```

---

## 10. Playwright Auth State

The repo does not currently ship a `globalSetup` that pre-authenticates a `storageState.json`. Each spec performs its own login (see `loginAdmin()` in `tests/e2e/admin/admin-smoke.spec.ts` and `loginUser()` in `tests/e2e/user/*`).

`admin-smoke.spec.ts` explicitly opts out of any cached state with `test.use({ storageState: undefined })` and clears cookies/storage before each run. If you add a global auth setup later, follow the [Playwright auth recipe](https://playwright.dev/docs/auth) and write `tests/e2e/.auth/student.json` / `admin.json`, gitignored.

E2E env vars consumed:

| Variable | Default | Used by |
|----------|---------|---------|
| `BASE_URL` | `http://localhost:3000` | All specs (controls `webServer` skip too) |
| `E2E_ADMIN_EMAIL` | `admin@principlelearn.com` | `admin-smoke.spec.ts` |
| `E2E_ADMIN_PASSWORD` | `AdminPassword123!` | `admin-smoke.spec.ts` |
| `CI` | unset locally | Toggles retries (2) and workers (1) |

---

## 11. CI Integration

There is **no `.github/workflows/` directory** in the repo as of this writing. CI happens implicitly through the Vercel preview build (which runs `npm run build` but not `npm run test:ci`).

If you wire up GitHub Actions or a Vercel build step, the canonical entry point is:

```bash
npm run test:ci
# = jest --ci --coverage && playwright test
```

This enforces the coverage thresholds and runs the full Playwright suite with retries. Set `CI=1` in the runner so Playwright switches to 1 worker / 2 retries. Cache `~/.cache/ms-playwright` between runs.

---

## 12. Debugging

**Jest:**

```bash
npx jest tests/api/auth/login.test.ts --detectOpenHandles --runInBand
node --inspect-brk node_modules/jest/bin/jest.js --runInBand tests/api/auth/login.test.ts
```

VS Code: add a launch config of type `node` running `${workspaceFolder}/node_modules/jest/bin/jest.js` with `--runInBand --testPathPattern=${file}`.

**Playwright:**

```bash
npx playwright test --debug                 # opens Inspector
npx playwright test --headed --workers=1    # see the browser, no parallelism
npx playwright show-report tests/e2e-report
npx playwright show-trace tests/e2e-results/<failed-test>/trace.zip
```

When a test fails, traces, screenshots, and videos are written under `tests/e2e-results/`.

---

## 13. Known Limitations and Pitfalls

| Area | Issue |
|------|-------|
| **Frontend coverage** | No jsdom suites exist; React components only get exercised via Playwright. `jest-environment-jsdom` is installed but unused. |
| **Browsers** | Only Chromium and a Pixel 5 mobile project run. Firefox / WebKit are scaffolded but commented out. |
| **MSW for streaming** | The OpenAI MSW handler returns a non-streaming JSON response. For streaming routes (`ask-question`, `challenge-thinking`, `challenge-feedback`), prefer `jest.mock('@/services/ai.service', ...)` to control chunk timing. |
| **Hoisting** | `jest.mock(...)` is hoisted above imports. Always declare `const mockX = jest.fn()` **before** calling `jest.mock()` and import the route handler **after**. |
| **Real timers in E2E** | Avoid `page.waitForTimeout()`. Prefer `waitForURL`, `waitForResponse`, or `expect(...).toBeVisible()`. |
| **Artifact directories** | `tests/e2e-report/` and `tests/e2e-results/` are NOT in `.gitignore`. Avoid committing them. |
| **Email validation** | Some auth routes reject whitespace before trimming. `tests/api/auth/login.test.ts` accepts `[200, 400, 401]` for the trim-test to stay resilient — copy the pattern when asserting trimming. |
| **Crypto stub** | `globalThis.crypto.randomUUID()` is replaced with a non-RFC-compliant string in tests. If a code path validates UUID format strictly, override locally. |
| **Legacy ts-node scripts** | `npm run test:api-legacy` and `npm run test:dataflow` hit a live server and can leave test data behind. Run against a throwaway DB only. |

---

## 14. Best Practices

- **Mock at module boundaries.** `jest.mock('@/lib/database')` is preferable to monkey-patching individual functions.
- **Cover three paths per endpoint.** Success, validation error, server error. Auth routes also need 401.
- **Use fixtures.** Importing from `tests/fixtures/` keeps shared constants in sync across tests.
- **Reset between tests.** `clearMocks: true` is on globally, but explicit `beforeEach(() => jest.clearAllMocks())` in each describe block makes intent obvious.
- **Stable Playwright selectors.** Element IDs (`input#login-email`), `data-testid`, semantic roles (`getByRole('button', { name: /save/i })`). Avoid `:nth-child` and absolute XPath.
- **Unique test data.** Suffix emails / IDs with timestamps when E2E tests create data that hits the real DB.
- **Don't test framework internals.** Assert on HTTP status, response shape, and observable side effects (cookies, headers, DB writes), not internal call counts unless the contract genuinely matters.
