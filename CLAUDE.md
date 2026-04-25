# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

PrincipleLearn V3 is an AI-powered Learning Management System built for a Magister thesis on Critical Thinking and Computational Thinking development. The application is in Indonesian (jurnal, riset, siswa, aktivitas, etc. are intentional, not typos). There is a single admin (the researcher); all other users are research participants.

## Development Commands

- `npm run dev` — Start dev server (Fast Refresh disabled via `cross-env FAST_REFRESH=false` for stability)
- `npm run dev:no-lint` — Dev server without ESLint
- `npm run build` — Production build
- `npm run start` — Start production server
- `npm run lint` — ESLint (flat config, `eslint-config-next` core-web-vitals + `typescript-eslint` recommended)
- `npm test` — Jest (all tests)
- `npm run test:unit` — Jest, `tests/api/` only
- `npm run test:coverage` — Jest with coverage
- `npm run test:e2e` — Playwright (all E2E)
- `npm run test:e2e:user` / `:admin` / `:admin:smoke` / `:ui` / `:headed` — scoped Playwright runs
- `npm run test:all` — Jest then Playwright
- `npm run test:ci` — Jest `--ci --coverage` then Playwright
- `npm run playwright:install` — Install Playwright browsers
- `npm run test:api-legacy` / `test:dataflow` — legacy `ts-node` smoke scripts in `scripts/`

Run a single Jest test: `npx jest tests/api/auth/login.test.ts`
Run a single Playwright test: `npx playwright test tests/e2e/user/signup-login.spec.ts`

## Environment Setup

Node.js engine: `22.x` (declared in `package.json#engines.node`).

Required environment variables (copy `.env.example` to `.env.local`):

- `NEXT_PUBLIC_SUPABASE_URL` — Supabase project URL
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase anonymous key
- `SUPABASE_SERVICE_ROLE_KEY` — Supabase service role key (elevated operations via `adminDb`)
- `JWT_SECRET` — JWT secret for access/refresh token signing
- `OPENAI_API_KEY` — OpenAI API key (required for AI features)
- `OPENAI_MODEL` — OpenAI model (optional, defaults to `gpt-5-mini`)
- `NEXT_PUBLIC_APP_URL` — Public app URL (used in some links/emails)
- `ENABLE_PRODUCTION_ACTIVITY_SEED` — Optional, defaults to `false`. Only enable when intentionally seeding a non-research/demo project.

`next.config.ts` force-loads `.env` and `.env.local` with override so a global `OPENAI_API_KEY` cannot accidentally take precedence.

## Project Architecture

### Core Technologies

- **Framework**: Next.js 15.5 (App Router), React 19, TypeScript strict mode
- **Styling**: Sass modules (`.module.scss`) co-located with components
- **Database**: Supabase PostgreSQL (project `wesgoqdldgjbwgmubfdm`) with RLS policies
- **Auth**: Custom JWT (access + refresh) with CSRF double-submit cookie pattern
- **AI**: OpenAI SDK 4.96 — course generation, Q&A, challenge thinking, classification, scoring
- **Deployment**: Vercel (region `sin1`, `maxDuration: 60s` for `src/app/api/**`)
- **Testing**: Jest 30 + Playwright 1.58 + MSW for HTTP mocking

### Authentication & Security Architecture

- **Unified auth cookie**: A single `access_token` cookie is used for both admin and regular users. Role is encoded in the JWT payload (`role: 'ADMIN' | 'STUDENT'`, case-insensitive). See [`middleware.ts`](middleware.ts).
- **Login flows**: `/api/auth/login` (regular user) and `/api/admin/login` (admin) — different validation, same cookie shape.
- **Token rotation**: Refresh tokens are rotated on each use; old token invalidated. Refresh hash persisted in `users.refresh_token_hash` for revocation.
- **CSRF**: Double-submit cookie. `csrf_token` cookie is read by [`apiFetch()`](src/lib/api-client.ts) and sent as `x-csrf-token` header on every mutation. Middleware validates equality on POST/PUT/PATCH/DELETE under `/api/`.
- **JWT utilities**: [`src/lib/jwt.ts`](src/lib/jwt.ts) — `signToken`, `verifyToken`, refresh helpers.
- **Header injection**: Middleware injects `x-user-id`, `x-user-email`, `x-user-role` into the rewritten request. Handlers may trust these when present, but should fall back to `verifyToken(req.cookies.get('access_token'))` because middleware does not run for every edge case (cached responses, server actions). See the long comment in `middleware.ts` for the contract.
- **Service role client**: `adminDb` from [`src/lib/database.ts`](src/lib/database.ts) bypasses RLS — use only inside trusted server code.
- **Public client**: `publicDb` for anon-level reads (respects RLS).
- **Request validation**: 19 Zod schemas in [`src/lib/schemas.ts`](src/lib/schemas.ts), parsed via the `parseBody()` helper in the same file.
- **Prompt injection prevention**: `sanitizePromptInput()` + XML boundary markers on all OpenAI calls (`src/services/ai.service.ts`).
- **Rate limiting**: In-memory token bucket in [`src/lib/rate-limit.ts`](src/lib/rate-limit.ts) backed by the `rate_limits` Postgres table.

### Onboarding Flow (Two-Stage Cookie Gate)

Regular users (not admin) must complete onboarding before any other route loads. See `middleware.ts:120-157`.

1. **`onboarding_done=true`** — profile wizard finished. Set after `/onboarding/...` flow completes. Without it, all non-API non-onboarding paths redirect to `/onboarding`.
2. **`intro_slides_done=true`** — educational intro slides finished. Without it, redirect to `/onboarding/intro`.

Both cookies are non-HttpOnly (the client sets them after the relevant page completes). They are a UX guard, not a security boundary — the server-side source of truth is `learning_profiles.intro_slides_completed`. Deleting the cookies just re-triggers the flow.

Routes exempt from onboarding redirects: `/onboarding`, `/onboarding/...`, `/logout`, `/api/auth/...`, `/api/learning-profile`, `/api/onboarding-state`, `/favicon.ico`, `/_next/...`, and any `/api/...` route (API responses are not redirected).

### Database Architecture

- **Primary interface**: `DatabaseService` class in `src/lib/database.ts` — generic CRUD over Supabase.
- **Query builder**: `adminDb` exposes Supabase-like chaining (`.from().select().eq().single()`).
- **Public client**: `publicDb` for RLS-respecting anon reads.
- **Error handling**: Custom `DatabaseError` with `.is()`, `.isUniqueViolation`, `.isForeignKeyViolation`.
- **JSONB autodetect**: `detectJsonbColumns()` reads schema metadata so writes JSON-encode the right columns.
- **No `/api/test-db`** — that endpoint has been removed. Use Supabase MCP / dashboard for connection sanity checks.

The database has 35 public tables. Group them as follows:

**Identity & onboarding**: `users`, `learning_profiles`, `onboarding_state` (history in `prompt_revisions`).

**Course content**: `courses`, `subtopics`, `leaf_subtopics`, `subtopic_cache`, `course_generation_activity`, `example_usage_events`.

**Learning activity (student-facing)**: `quiz` (the question bank, ~685 rows), `quiz_submissions` (actual student attempts, ~255 rows — DO NOT confuse with `quiz`), `jurnal` (reflections), `transcript` (notes), `transcript_integrity_quarantine`, `user_progress`, `learning_sessions`, `feedback`, `ask_question_history`, `challenge_responses`.

**Discussion module** (implemented but not actively used in current thesis run — keep documented): `discussion_sessions`, `discussion_messages`, `discussion_templates`, `discussion_assessments`, `discussion_admin_actions`.

**Research / RM2 & RM3 pipeline**: `prompt_classifications`, `cognitive_indicators`, `auto_cognitive_scores`, `research_evidence_items`, `research_auto_coding_runs`, `triangulation_records`, `inter_rater_reliability`.

**Infrastructure**: `api_logs`, `rate_limits`.

SQL migrations live in [`docs/sql/`](docs/sql/). Supabase config and migration metadata in [`supabase/`](supabase/).

### Service Layer

All in [`src/services/`](src/services/):

- `auth.service.ts` — user lookup, password hashing (bcrypt + bcryptjs), JWT generation, CSRF tokens.
- `course.service.ts` — course CRUD, subtopic management, ownership/access control.
- `ai.service.ts` — OpenAI calls (single, retry, streaming), prompt sanitization, response validation.
- `cognitive-scoring.service.ts` — auto-scoring of cognitive indicators (RM3).
- `prompt-classifier.ts` — classifies user prompts into Bloom / Computational Thinking categories (RM2).
- `research-auto-coder.service.ts` — orchestrates auto-coding runs across evidence items.
- `research-data-reconciliation.service.ts` — reconciles auto-coder vs. human coder for IRR.
- `research-field-readiness.service.ts` — checks evidence/indicator completeness before exporting research data.
- `research-session.service.ts` — research session lifecycle (start/end/aggregate).
- `discussion/` — `generateDiscussionTemplate.ts`, `templatePreparation.ts` (template generation for the discussion module).

`src/lib/` also holds heavier helpers that border on services: `admin-queries.ts`, `admin-quiz-attempts.ts`, `admin-reflection-activity.ts`, `admin-reflection-summary.ts`, `admin-prompt-stage.ts`, `analytics/reflection-model.ts`, `challenge-feedback.ts`, `discussion-prerequisites.ts`, `engagement.ts`, `leaf-subtopics.ts`, `learning-progress.ts`, `quiz-content.ts`, `quiz-sync.ts`, `reflection-status.ts`, `reflection-submission.ts`, `research-normalizers.ts`, `supabase-batch.ts`, `ownership.ts`, `auth-helper.ts`, `activitySeed.ts`.

### Indonesian Naming Convention

Routes, tables, and admin pages use Indonesian deliberately. Do not "fix" these:

- `jurnal` (journal / reflection)
- `siswa` (student)
- `riset` (research)
- `aktivitas` (activity)
- `ekspor` (export)
- `bukti` (evidence)
- `kognitif` (cognitive)
- `triangulasi` (triangulation)
- `readiness` is English; `prompt` is bilingual

### Key Directory Structure

```text
src/
├── app/                          # Next.js 15 App Router
│   ├── api/                      # 47+ route handlers
│   │   ├── auth/                 # login, logout, refresh, register, me
│   │   ├── admin/                # activity, dashboard, discussions, insights,
│   │   │                         # login, logout, monitoring, register, research,
│   │   │                         # siswa, users
│   │   ├── courses/              # course CRUD ([id], list)
│   │   ├── debug/                # course-test, generate-courses, users (dev only)
│   │   ├── discussion/           # history, module-status, prepare, respond, start, status
│   │   ├── ask-question/         # streaming Q&A
│   │   ├── challenge-thinking/   # streaming critical-thinking challenge
│   │   ├── challenge-feedback/   # AI feedback on challenge response
│   │   ├── challenge-response/   # persist response
│   │   ├── generate-course/      # one-shot course outline
│   │   ├── generate-subtopic/    # subtopic content
│   │   ├── generate-examples/    # examples on demand
│   │   ├── jurnal/               # save, status
│   │   ├── learning-profile/     # GET/PUT learning profile
│   │   ├── learning-progress/    # progress events
│   │   ├── onboarding-state/     # onboarding cookie + DB sync
│   │   ├── prompt-journey/       # prompt revision history
│   │   ├── quiz/                 # regenerate, status, submit
│   │   └── user-progress/        # user progress upsert
│   ├── admin/                    # Indonesian admin pages
│   │   ├── aktivitas/            # student activity drill-down
│   │   ├── dashboard/            # KPI overview
│   │   ├── ekspor/               # data export (NOT actively used in current thesis run)
│   │   ├── riset/                # bukti, kognitif, prompt, readiness, triangulasi
│   │   ├── siswa/                # student list + [id] detail
│   │   ├── login/  register/
│   ├── course/[courseId]/        # dynamic course viewing
│   ├── dashboard/                # student dashboard
│   ├── login/  signup/  logout/
│   ├── onboarding/               # profile wizard + intro/ slide deck
│   └── request-course/           # multi-step creation: step1, step2, step3, generating
├── components/                   # Feature-organized React components
│   ├── AILoadingIndicator/  AskQuestion/  ChallengeThinking/  Examples/
│   ├── HelpDrawer/  KeyTakeaways/  NextSubtopics/  ProductTour/
│   ├── PromptBuilder/  PromptTimeline/  Quiz/  ReasoningNote/
│   ├── StructuredReflection/  WhatNext/
│   └── admin/                    # admin-only modals & widgets
├── services/                     # See "Service Layer" above
├── hooks/                        # useAdmin, useAuth, useDebouncedValue,
│                                 # useLearningProgress, useLocalStorage,
│                                 # useOnboardingState, useSessionStorage
├── lib/                          # database.ts, schemas.ts, api-client.ts,
│                                 # api-middleware.ts, api-logger.ts, jwt.ts,
│                                 # rate-limit.ts, openai.ts, plus per-feature helpers
├── context/RequestCourseContext.tsx
├── styles/  global.d.ts  types/
middleware.ts                     # Auth, role gate, onboarding gate, CSRF
```

### API Route Patterns

- **Authentication**: `/api/auth/*` (regular) and `/api/admin/login` (admin) — both write the same `access_token` cookie.
- **Admin routes**: All `/api/admin/*` enforce `role === 'admin'` (case-insensitive) at the middleware level — handlers do not need to re-check.
- **Validation**: All mutating routes call `parseBody(request, Schema)` from `src/lib/schemas.ts`. 19 Zod schemas exist there: `LoginSchema`, `RegisterSchema`, `AdminLoginSchema`, `AdminRegisterSchema`, `GenerateCourseSchema`, `GenerateSubtopicSchema`, `QuizStatusSchema`, `QuizSubmitSchema`, `PromptComponentsSchema`, `AskQuestionSchema`, `ChallengeThinkingSchema`, `ChallengeFeedbackSchema`, `GenerateExamplesSchema`, `ChallengeResponseSchema`, `FeedbackSchema`, `JurnalSchema`, `UserProgressUpsertSchema`, `LearningProfileSchema`, `OnboardingStateSchema`.
- **Logging**: Wrap handlers with `withApiLogging()` from `src/lib/api-logger.ts` — appends to `api_logs`.
- **Streaming**: `/api/ask-question` and `/api/challenge-thinking` use `chatCompletionStream()` from `src/services/ai.service.ts` for Server-Sent text streaming.
- **Error shape**: `{ error: string }` JSON for failures; `DatabaseError` codes converted to user-facing messages where appropriate.

### Research Pipeline (RM2 / RM3)

Status: pipeline scaffolding exists; classification and auto-coding runs are not yet executed for the current thesis dataset (research tables are still empty for live participants). See `MEMORY.md` notes.

Key endpoints under `/api/admin/research/`:

- `analytics/`, `artifacts/`, `bulk/`, `classifications/`, `classify/`, `evidence/`, `export/`, `indicators/`, `readiness/`, `reconcile/`, `sessions/`, `triangulation/`, `auto-code/`, `auto-scores/`.
- `auto-scores/summary/` — aggregated cognitive scores per student.

Admin pages: `src/app/admin/riset/{bukti,kognitif,prompt,readiness,triangulasi}/`.

### Key Features & Implementation Details

- **Multi-step course creation**: `request-course/step1-3` + `generating/` use `RequestCourseContext` to maintain form state.
- **Atomic leaf-subtopic quizzes**: `leaf_subtopics` + per-leaf attempt tracking enable fine-grained progress.
- **Prompt journey & timeline**: `/api/prompt-journey` + `prompt_revisions` capture every version of a student's prompt; visualized in `PromptTimeline/`.
- **Learning profile**: Onboarding wizard writes to `learning_profiles`; `useLearningProgress` and `learning_sessions` track active study sessions.
- **AI streaming** for Q&A and challenge thinking; non-streaming for course/subtopic/example generation.
- **Discussion module** is fully implemented (`/api/discussion/*`, `discussion_*` tables, `services/discussion/`) but is not in active use for the current thesis — preserve it but do not invest perfectionist work there.

### Authentication Middleware Flow Summary

1. Public routes: `/`, `/login`, `/signup`, `/admin/login` allowed without token.
2. Public API routes: `/api/auth/login`, `/api/auth/register`, `/api/auth/refresh`, `/api/auth/logout`, `/api/admin/login`.
3. All other routes need a valid `access_token`. API routes return 401 JSON on failure (never 302). Page routes redirect to `/login` (or `/admin/login` for `/admin/...`).
4. Admin gate: `/admin/...` and `/api/admin/...` require `role === 'admin'`.
5. Onboarding gate: regular users without `onboarding_done` cookie redirect to `/onboarding`; without `intro_slides_done` cookie redirect to `/onboarding/intro`.
6. CSRF: POST/PUT/PATCH/DELETE under `/api/` require equal `csrf_token` cookie and `x-csrf-token` header.
7. On success, middleware injects `x-user-id`, `x-user-email`, `x-user-role` headers into the forwarded request.

### Development Workflow

- **Path alias**: `@/` → `src/`.
- **TypeScript**: strict mode (`tsconfig.json`); test config in `tsconfig.test.json`.
- **ESLint**: flat config in `eslint.config.mjs`. `no-explicit-any`, `no-unused-vars` (ignores `_`-prefixed), `prefer-const` are `warn`. No Prettier, no Husky.
- **Fast Refresh disabled** in dev (env flag) for stability.
- **Coverage thresholds** (Jest): 70% branches, 75% functions/lines/statements.

### Companion Documentation

- [`README.md`](README.md) — project overview & onboarding for new contributors
- [`AGENTS.md`](AGENTS.md) — contributor & AI-agent guidelines
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md), [`docs/API_REFERENCE.md`](docs/API_REFERENCE.md), [`docs/SECURITY.md`](docs/SECURITY.md), [`docs/DATABASE_SCHEMA.md`](docs/DATABASE_SCHEMA.md), [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md), [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md), [`docs/TESTING.md`](docs/TESTING.md), [`docs/USER_GUIDE.md`](docs/USER_GUIDE.md), [`docs/admin-and-research-ops.md`](docs/admin-and-research-ops.md), [`docs/feature-flows.md`](docs/feature-flows.md)
- [`docs/thesis/`](docs/thesis/) — academic / pedagogy docs (RM, learning theory, rubric, milestones)
