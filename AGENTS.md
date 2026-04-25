# Repository Guidelines

PrincipleLearn V3 is a Next.js 15 LMS with AI-powered course generation, atomic-leaf quizzes, structured reflection, prompt-journey capture, and an admin + research console. It is the reference implementation for a Magister thesis on Critical Thinking and Computational Thinking, with one admin (the researcher) and the rest of the users as research participants.

The application is intentionally Indonesian: `jurnal`, `siswa`, `riset`, `aktivitas`, `ekspor`, `bukti`, `kognitif`, `triangulasi` are not typos — do not rename them.

## Project Structure & Module Organization

The app uses Next.js App Router with a clear separation between student-facing and admin features:

- **`src/services/`** — Business logic. Route handlers delegate here; never put business logic directly in handlers.
  - Core: `auth.service.ts`, `course.service.ts`, `ai.service.ts`.
  - Research / RM2 / RM3: `cognitive-scoring.service.ts`, `prompt-classifier.ts`, `research-auto-coder.service.ts`, `research-data-reconciliation.service.ts`, `research-field-readiness.service.ts`, `research-session.service.ts`.
  - Discussion module: `services/discussion/{generateDiscussionTemplate,templatePreparation}.ts`.
- **`src/lib/`** — Infrastructure & feature helpers.
  - Core: `database.ts` (`DatabaseService` + `adminDb` + `publicDb`), `schemas.ts` (**19 Zod schemas** + `parseBody()` helper), `api-client.ts` (frontend fetch wrapper with CSRF + 401 retry), `api-middleware.ts` (`withProtection()`, `withCacheHeaders()`), `api-logger.ts` (`withApiLogging()` → `api_logs`), `jwt.ts`, `rate-limit.ts`, `openai.ts`.
  - Feature helpers: `admin-prompt-stage.ts`, `admin-queries.ts`, `admin-quiz-attempts.ts`, `admin-reflection-activity.ts`, `admin-reflection-summary.ts`, `auth-helper.ts`, `challenge-feedback.ts`, `discussion-prerequisites.ts`, `discussion/{resolveSubtopic,serializers,thinkingSkills}.ts`, `engagement.ts`, `leaf-subtopics.ts`, `learning-progress.ts`, `ownership.ts`, `quiz-content.ts`, `quiz-sync.ts`, `reflection-status.ts`, `reflection-submission.ts`, `research-normalizers.ts`, `supabase-batch.ts`, `activitySeed.ts`, `analytics/reflection-model.ts`.
- **`src/components/`** — Organized by feature, not type. Each component has a co-located `.module.scss`. Admin-only components live in `components/admin/`. Active feature folders: `AILoadingIndicator/`, `AskQuestion/`, `ChallengeThinking/`, `Examples/`, `HelpDrawer/`, `KeyTakeaways/`, `NextSubtopics/`, `ProductTour/`, `PromptBuilder/`, `PromptTimeline/`, `Quiz/`, `ReasoningNote/`, `StructuredReflection/`, `WhatNext/`.
- **`src/context/RequestCourseContext.tsx`** — Multi-step course-creation state (step1 → step2 → step3 → generating).
- **`src/hooks/`** — `useAdmin`, `useAuth`, `useDebouncedValue`, `useLearningProgress`, `useLocalStorage`, `useOnboardingState`, `useSessionStorage`.
- **`middleware.ts`** — JWT auth, role gate for admin routes, two-stage onboarding cookie gate (`onboarding_done` + `intro_slides_done`), CSRF validation, header injection (`x-user-id`, `x-user-email`, `x-user-role`).

Auth is custom JWT (not Supabase Auth). A single `access_token` cookie is used for both admin and regular users — role is encoded in the JWT payload. Refresh rotation lives in `/api/auth/refresh` (rotated on each use, hash persisted in `users.refresh_token_hash`). CSRF uses the double-submit cookie pattern: `csrf_token` cookie equality with `x-csrf-token` header on every mutation. The frontend `apiFetch()` wrapper handles this automatically.

There is **no `/api/test-db`** endpoint — it has been removed. Use Supabase MCP / dashboard for connection sanity checks.

## Build, Test, and Development Commands

```bash
npm run dev              # Dev server (Fast Refresh disabled)
npm run dev:no-lint      # Dev server without ESLint
npm run build            # Production build
npm run start            # Production server
npm run lint             # ESLint (flat config)
npm test                 # Jest (all tests)
npm run test:watch       # Jest watch
npm run test:unit        # Jest, tests/api/ only
npm run test:coverage    # Jest with coverage
npm run test:e2e         # Playwright (all E2E)
npm run test:e2e:user    # Playwright (user flows)
npm run test:e2e:admin   # Playwright (admin flows)
npm run test:e2e:admin:smoke  # Playwright admin smoke (chromium only)
npm run test:e2e:ui      # Playwright interactive UI
npm run test:e2e:headed  # Playwright headed mode
npm run test:all         # Jest then Playwright
npm run test:ci          # CI: Jest --ci --coverage && Playwright
npm run playwright:install  # Install Playwright browsers
npm run test:api-legacy  # Legacy ts-node admin/user API smoke
npm run test:dataflow    # Legacy ts-node API endpoint smoke
```

Run a single Jest test: `npx jest tests/api/auth/login.test.ts`
Run a single Playwright test: `npx playwright test tests/e2e/user/signup-login.spec.ts`

Node engine is **22.x** (`package.json#engines.node`).

## Coding Style & Naming Conventions

- **TypeScript**: Strict mode (`tsconfig.json`). Path alias `@/*` → `src/*`.
- **ESLint**: Flat config in [`eslint.config.mjs`](eslint.config.mjs) — `eslint-config-next` core-web-vitals + `typescript-eslint` recommended. `no-explicit-any`, `no-unused-vars` (ignores `_`-prefixed), and `prefer-const` are `warn`. Many noisy TS rules are off intentionally.
- **Styling**: Sass modules (`.module.scss`) co-located with components. No Prettier configured.
- **No pre-commit hooks** (no Husky, no lint-staged).
- **Indonesian naming is intentional** — never translate `jurnal`, `siswa`, `riset`, `aktivitas`, `ekspor`, `bukti`, `kognitif`, `triangulasi`.
- **Validation first** — every mutating API route should call `parseBody(request, Schema)` from `src/lib/schemas.ts` before touching the DB. Add a new schema there rather than ad-hoc validation.

## Database Notes

The Supabase project (`wesgoqdldgjbwgmubfdm`) has 35 public tables grouped roughly as:

- **Identity & onboarding**: `users`, `learning_profiles`, `onboarding_state`, `prompt_revisions`.
- **Course content**: `courses`, `subtopics`, `leaf_subtopics`, `subtopic_cache`, `course_generation_activity`, `example_usage_events`.
- **Learning activity**: `quiz` (the question bank, ~685 rows), `quiz_submissions` (actual student attempts, ~255 rows — DO NOT confuse with `quiz`), `jurnal`, `transcript`, `transcript_integrity_quarantine`, `user_progress`, `learning_sessions`, `feedback`, `ask_question_history`, `challenge_responses`.
- **Discussion (implemented, not in active thesis use)**: `discussion_sessions`, `discussion_messages`, `discussion_templates`, `discussion_assessments`, `discussion_admin_actions`.
- **Research / RM2 & RM3**: `prompt_classifications`, `cognitive_indicators`, `auto_cognitive_scores`, `research_evidence_items`, `research_auto_coding_runs`, `triangulation_records`, `inter_rater_reliability`.
- **Infrastructure**: `api_logs`, `rate_limits`.

SQL migrations live in [`docs/sql/`](docs/sql/). Supabase config + migration metadata in [`supabase/`](supabase/).

## Testing Guidelines

- **Jest** for API/unit tests under `tests/api/` and `tests/unit/`. **Playwright** for E2E under `tests/e2e/`.
- **MSW** mocks Supabase and OpenAI APIs (`tests/setup/mocks/`).
- **Fixtures** in `tests/fixtures/courses.fixture.ts` and `tests/fixtures/users.fixture.ts` provide `TEST_STUDENT`, `TEST_ADMIN`, and `TEST_COURSE` constants.
- **Coverage thresholds** (per `jest.config.ts`): 70% branches, 75% functions, 75% lines, 75% statements. Coverage is collected from `src/app/api/**/*.ts` and `src/lib/**/*.ts`.
- **Test environment**: `node` (jsdom is unsuitable here — API tests need `fetch`).
- **Test utilities**: `createMockNextRequest()`, `createAuthContext()`, `assertResponse<T>()` in `tests/setup/test-utils.ts`. Setup file is `tests/setup/jest.setup.ts`.
- **Existing unit suites**: `admin-prompt-stage`, `admin-quiz-attempts`, `admin-reflection-activity`, `admin-reflection-summary`, `api-client`, `discussion-serializers`, `schemas`, `supabase-batch`. **API suites** group: `admin/`, `ai/`, `auth/`, `courses/`, `generate-course/`, `learning/`, `middleware/`, `security/`.
- **Playwright E2E** groups: `tests/e2e/admin/`, `tests/e2e/user/`, `tests/e2e/mobile/`.

## Onboarding & Auth Flow Cheatsheet

Regular users (not admin) hit a two-stage cookie gate before reaching any other route:

1. `onboarding_done=true` cookie — profile wizard finished.
2. `intro_slides_done=true` cookie — educational intro slides finished.

Both cookies are non-HttpOnly UX guards; the server source of truth is `learning_profiles.intro_slides_completed`. Routes exempt from the gate: `/onboarding`, `/onboarding/...`, `/logout`, `/api/auth/...`, `/api/learning-profile`, `/api/onboarding-state`, `/favicon.ico`, `/_next/...`, and any `/api/...` (API responses are not redirected).

Admin gate: `/admin/...` and `/api/admin/...` require `role === 'admin'` (case-insensitive). Middleware handles this; admin handlers should not re-check.

## Modules Marked "Not in Active Thesis Use"

These are implemented but the researcher is not investing perfectionist work in them for the current thesis run. Document any change you make, but do not gold-plate:

- The Discussion module (`/api/discussion/*`, `discussion_*` tables, `services/discussion/`, admin discussion management UI).
- `/admin/ekspor` (data export module).
- `/api/admin/monitoring` (system health/monitoring views).

## Commit & Pull Request Guidelines

Commits follow `type: description` convention:

- `feat:` new features, `fix:` bug fixes, `chore:` maintenance, `docs:` documentation, `security:` security patches, `refactor:` non-behavioral cleanup.
- Messages are lowercase, descriptive. Use an em dash (`—`) to separate sub-descriptions, e.g. `fix: audit-driven hardening — auth, RLS, quiz parse, and mobile polish`.

Before opening a PR:

1. `npm run lint` — must pass.
2. `npm test` — must pass; respect coverage thresholds.
3. If touching E2E-covered flows: `npm run test:e2e:user` and/or `npm run test:e2e:admin`.
4. If touching schemas in `src/lib/schemas.ts`: update `tests/unit/schemas.test.ts`.
5. If adding a new admin route: confirm middleware gate covers it (it does for everything under `/admin/...` and `/api/admin/...`).

## Companion Documentation

- [`README.md`](README.md) — Project overview & onboarding for new contributors.
- [`CLAUDE.md`](CLAUDE.md) — Instructions for Claude Code working in this repo.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md), [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md), [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/TESTING.md`](docs/TESTING.md), [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md), [`docs/admin-and-research-ops.md`](docs/admin-and-research-ops.md), [`docs/feature-flows.md`](docs/feature-flows.md).
- [`docs/thesis/`](docs/thesis/) — Academic / pedagogy docs (RM, learning theory, rubric, milestones).
