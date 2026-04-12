# Repository Guidelines

PrincipleLearn — a Next.js 15 learning management system with AI-powered course generation, quizzes, journals, and admin analytics.

## Project Structure & Module Organization

The app uses Next.js App Router with a clear separation between student-facing and admin features:

- **`src/services/`** — Business logic layer (`auth.service.ts`, `course.service.ts`, `ai.service.ts`). API routes delegate to these; never put business logic directly in route handlers.
- **`src/lib/`** — Infrastructure: `database.ts` (Supabase via `DatabaseService` + `adminDb`), `schemas.ts` (14 Zod schemas + `parseBody` helper), `api-client.ts` (frontend fetch wrapper with CSRF/401 retry), `jwt.ts`, `rate-limit.ts`, `api-middleware.ts` (CSRF + auth protection).
- **`src/components/`** — Organized by feature, not type. Each component has a co-located `.module.scss` file. Admin components are isolated in `components/admin/`.
- **`src/context/`** — `RequestCourseContext` manages multi-step course creation state (step1-3).
- **`middleware.ts`** — Enforces JWT auth on protected routes, injects `x-user-id`/`x-user-email`/`x-user-role` headers, role-gates `/admin/*` routes.

Auth is custom JWT (not Supabase Auth): access tokens in `access_token` cookie, refresh rotation in `/api/auth/refresh`, CSRF via double-submit cookie pattern. The `apiFetch` wrapper handles this automatically on the frontend.

"jurnal" in routes/DB is intentional Indonesian spelling, not a typo.

## Build, Test, and Development Commands

```bash
npm run dev              # Dev server (Fast Refresh disabled)
npm run dev:no-lint      # Dev server without ESLint
npm run build            # Production build
npm run start            # Production server
npm run lint             # ESLint check
npm test                 # Jest (all tests)
npm run test:unit        # Jest (tests/api/ only)
npm run test:coverage    # Jest with coverage report
npm run test:e2e         # Playwright (all E2E)
npm run test:e2e:user    # Playwright (user flows only)
npm run test:e2e:admin   # Playwright (admin flows only)
npm run test:e2e:ui      # Playwright interactive UI
npm run test:e2e:headed  # Playwright headed mode
npm run test:all         # Jest then Playwright
npm run test:ci          # CI: Jest --ci --coverage && Playwright
npm run playwright:install  # Install Playwright browsers
```

Run a single Jest test: `npx jest tests/api/auth/login.test.ts`
Run a single Playwright test: `npx playwright test tests/e2e/user/signup-login.spec.ts`

## Coding Style & Naming Conventions

- **TypeScript**: Strict mode enabled (`tsconfig.json`). Path alias `@/*` maps to `src/*`.
- **ESLint**: Extends `next/core-web-vitals`. Rules off: `no-explicit-any`, `no-unused-vars`, `exhaustive-deps`, `prefer-const`. `rules-of-hooks` is error.
- **Styling**: Sass modules (`.module.scss`) co-located with components. No Prettier configured.
- **No pre-commit hooks** (no Husky or lint-staged).

## Testing Guidelines

- **Jest** for API/unit tests (`tests/api/`, `tests/unit/`), **Playwright** for E2E (`tests/e2e/`).
- **MSW** mocks Supabase and OpenAI APIs (`tests/setup/mocks/`).
- **Fixtures** in `tests/fixtures/` provide `TEST_STUDENT`, `TEST_ADMIN`, `TEST_COURSE` constants.
- **Coverage thresholds**: 70% branches, 75% functions/lines/statements.
- Test utilities: `createMockNextRequest()`, `createAuthContext()`, `assertResponse<T>()` in `tests/setup/test-utils.ts`.

## Commit & Pull Request Guidelines

Commits follow `type: description` convention:

- `feat:` new features, `fix:` bug fixes, `chore:` maintenance, `docs:` documentation, `security:` security patches.
- Messages are lowercase, descriptive. Use `—` to separate sub-descriptions (e.g., `fix: P2 quality improvements — CSRF, error format, dead code`).
