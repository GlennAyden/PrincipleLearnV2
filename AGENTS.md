# Repository Guidelines

PrincipleLearn — a Next.js 15 learning management system with AI-powered course generation, quizzes, journals, and admin analytics.

## Project Structure & Module Organization

The app uses Next.js App Router with a clear separation between student-facing and admin features:

- **`src/services/`** — Business logic layer (`auth.service.ts`, `course.service.ts`, `ai.service.ts`). API routes delegate to these; never put business logic directly in route handlers.
- **`src/lib/`** — Infrastructure: `database.ts` (Supabase via `DatabaseService` + `adminDb`), `schemas.ts` (14 Zod schemas + `parseBody` helper), `api-client.ts` (frontend fetch wrapper with CSRF/401 retry), `jwt.ts`, `csrf.ts`, `rate-limit.ts`.
- **`src/components/`** — Organized by feature, not type. Each component has a co-located `.module.scss` file. Admin components are isolated in `components/admin/`.
- **`src/context/`** — `RequestCourseContext` manages multi-step course creation state (step1–3).
- **`middleware.ts`** — Enforces JWT auth on protected routes, injects `x-user-id`/`x-user-email`/`x-user-role` headers, role-gates `/admin/*` routes.

Auth is custom JWT (not Supabase Auth): access tokens in `access_token` cookie, refresh rotation in `/api/auth/refresh`, CSRF via double-submit cookie pattern. The `apiFetch` wrapper handles this automatically on the frontend.

"jurnal" in routes/DB is intentional Indonesian spelling, not a typo.

## Build, Test, and Development Commands

```bash
npm run dev              # Start dev server (Fast Refresh disabled)
npm run build            # Production build
npm run lint             # ESLint
npm test                 # Jest (all tests)
npm run test:watch       # Jest watch mode
npm run test:coverage    # Jest with coverage report
npm run test:unit        # API tests only (tests/api/)
npm run test:e2e         # Playwright E2E tests
npm run test:all         # Jest + Playwright
```

Run a single test file: `npx jest tests/api/auth/login.test.ts`

## Coding Style & Naming Conventions

- **TypeScript**: Strict mode enabled. Path alias `@/` maps to `src/`.
- **ESLint** (flat config, `eslint.config.mjs`): `@typescript-eslint/no-explicit-any` and `@typescript-eslint/no-unused-vars` set to `warn` (prefix unused params with `_`). `prefer-const` enforced.
- **Styling**: Sass modules (`.module.scss`), no Prettier configured.
- **API routes**: Validate input with Zod schemas via `parseBody()`. Use `withProtection()` for auth+CSRF, `withApiLogging()` for request logging.
- **AI endpoints**: Use `sanitizePromptInput()` + XML boundary markers for prompt injection prevention. Streaming responses via `chatCompletionStream()` + `openAIStreamToReadable()`.

## Testing Guidelines

- **Jest** for API/unit tests (`tests/api/`, `tests/unit/`). **Playwright** for E2E (`tests/e2e/`).
- Coverage thresholds: branches 70%, functions 75%, lines 75%, statements 75%.
- Test utilities in `tests/setup/test-utils.ts`: `createMockNextRequest()`, `generateJWT()`, `assertResponse()`.
- Fixtures in `tests/fixtures/`: `TEST_STUDENT`, `TEST_ADMIN`, `ASK_QUESTION_REQUEST`, etc.
- MSW mocks Supabase and OpenAI APIs in `tests/setup/mocks/`.
- Timeout: 30s per test (Jest), 60s per test (Playwright).

## Commit & Pull Request Guidelines

Commits use conventional prefixes: `feat:`, `fix:`, `chore:`. Write a concise summary on the first line, details in the body if needed. No PR template is configured.
