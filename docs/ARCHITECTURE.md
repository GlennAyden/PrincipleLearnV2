# PrincipleLearn V3 — Architecture Documentation

Comprehensive technical architecture reference for **PrincipleLearn V3**, an AI-powered adaptive learning platform built as the primary research instrument for a Master's thesis on Computational Thinking (CT) and Critical Thinking (CTh) development.

> **Last revised:** 2026-04 against branch `principle-learn-3.0`. All claims in this document are verified against the live source tree referenced in the link annotations below.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [High-Level Architecture](#2-high-level-architecture)
3. [Directory Layout](#3-directory-layout)
4. [Auth and Middleware Flow](#4-auth-and-middleware-flow)
5. [API Layer](#5-api-layer)
6. [Service Layer](#6-service-layer)
7. [Lib Infrastructure](#7-lib-infrastructure)
8. [Data Layer](#8-data-layer)
9. [AI Integration](#9-ai-integration)
10. [Frontend Architecture](#10-frontend-architecture)
11. [Research Pipeline (RM2 / RM3 / RM4)](#11-research-pipeline-rm2--rm3--rm4)
12. [Testing Architecture](#12-testing-architecture)
13. [Build and Deployment](#13-build-and-deployment)
14. [Cross-References](#14-cross-references)

---

## 1. System Overview

PrincipleLearn V3 is a Next.js 15 single-app monolith that combines an AI-driven learning experience for students with an admin/research console for the thesis researcher (the only admin in the production deployment).

### Tech Stack

| Layer | Technology | Notes |
|-------|------------|-------|
| Framework | Next.js 15.5 (App Router) | `package.json` declares `next ^15.5.12`, Node 22.x |
| UI | React 19, TypeScript (strict) | Sass modules co-located with components |
| Database | Supabase PostgreSQL 17 | 35 tables, RLS enabled but mostly bypassed (see Section 8) |
| Auth | Custom JWT (HS256) | **NOT** Supabase Auth — fully bespoke (see Section 4) |
| AI | OpenAI Chat Completions | Default model `gpt-5-mini` (`OPENAI_MODEL` env override) |
| Validation | Zod 4 | 21 schemas in `src/lib/schemas.ts` |
| Styling | Sass modules (`.module.scss`) | No CSS framework |
| Deployment | Vercel | Region `sin1`, `maxDuration: 60s` for all `/api/**` routes |
| Testing | Jest 30 + Playwright 1.58 | MSW 2 for HTTP mocks |

### Capabilities

- **AI-generated courses** with multi-module outlines, AI-generated subtopic content, and contextual examples.
- **Interactive learning units**: streaming Q&A, Socratic discussions, challenge-thinking prompts with AI feedback, structured reflection journals, and quizzes with reasoning notes.
- **Multi-step course request wizard** (steps 1-3 plus generating page) backed by `RequestCourseContext`.
- **Research instrumentation** for RM2 (prompt classification) and RM3 (cognitive indicators) with a partial RM4 (triangulation + inter-rater reliability) layer.
- **Admin console** under `/admin/**` covering siswa (students), aktivitas (activity), riset (research), dashboard, ekspor (export), and login/register flows.

---

## 2. High-Level Architecture

```
+-----------------------------------------------------------------+
|                          Browser (React 19)                     |
|  Pages + apiFetch() + AuthProvider + RequestCourseProvider      |
+-------------------------------+---------------------------------+
                                |
                                | cookies (access_token, refresh_token,
                                |          csrf_token, onboarding_done,
                                |          intro_slides_done)
                                | + x-csrf-token header on mutations
                                v
+-----------------------------------------------------------------+
|                  middleware.ts (Edge runtime)                   |
|  - Public-route bypass                                          |
|  - verifyToken(access_token)                                    |
|  - Admin role check (lowercase 'admin')                         |
|  - Onboarding gate (2-stage cookies for regular users)          |
|  - CSRF double-submit on POST/PUT/DELETE/PATCH                  |
|  - Inject x-user-id / x-user-email / x-user-role headers        |
+-------------------------------+---------------------------------+
                                |
                                v
+-----------------------------------------------------------------+
|         Next.js App Router — API Routes (88 route.ts)           |
|  Wrapped by withApiLogging() and (optionally) withProtection()  |
|  parseBody(ZodSchema) for input validation                      |
+-------+--------------+-------------+---------------------+------+
        |              |             |                     |
        v              v             v                     v
+--------------+ +-------------+ +---------------+ +------------------+
| auth.service | |course.serv. | | ai.service +  | | research-* svcs  |
|              | |             | | openai.ts     | | (RM2/RM3/RM4)    |
+------+-------+ +------+------+ +-------+-------+ +---------+--------+
       |                |                |                   |
       +----------------+----------------+-------------------+
                                |
                                v
+-----------------------------------------------------------------+
|                  src/lib/database.ts                            |
|  adminDb (service role, bypass RLS) | publicDb (anon, RLS on)   |
|  DatabaseService static CRUD + chainable SupabaseQueryBuilder   |
+-------------------------------+---------------------------------+
                                |
              +-----------------+-----------------+
              v                                   v
+----------------------------+      +----------------------------+
| Supabase PostgreSQL 17     |      | OpenAI Chat Completions    |
| 35 tables, JSONB autodet.  |      | gpt-5-mini (default)       |
+----------------------------+      +----------------------------+
```

### Request Lifecycle

```
Browser
  |
  |-- apiFetch() attaches x-csrf-token from csrf_token cookie + credentials: 'include'
  v
middleware.ts
  |-- 1. Public/auth route bypass
  |-- 2. Read access_token cookie (single cookie shared by user + admin)
  |-- 3. verifyToken() — rejects refresh tokens by `type` claim
  |-- 4. If invalid + refresh_token exists, page routes proceed (client refreshes
  |        on first 401); API routes always get a 401 JSON to preserve POST bodies
  |-- 5. /admin/** + /api/admin/**: enforce role.toLowerCase() === 'admin'
  |-- 6. Regular users: redirect to /onboarding then /onboarding/intro until both
  |        cookie gates (`onboarding_done`, `intro_slides_done`) are set
  |-- 7. CSRF compare csrf_token cookie vs x-csrf-token header for mutations
  |-- 8. Inject x-user-id / x-user-email / x-user-role and forward
  v
API Route Handler (88 route.ts files)
  |-- withApiLogging(handler, { label, metadata }) — async write to api_logs
  |-- withProtection(handler, { adminOnly? }) — defense in depth (see notes)
  |-- parseBody(ZodSchema, await req.json())
  |-- (optional) aiRateLimiter.isAllowed(userId)
  |-- service-layer call(s)
  v
Response (NextResponse.json or streaming Response with text/plain)
```

---

## 3. Directory Layout

```
src/
├── app/                             # Next.js 15 App Router (pages + API)
│   ├── admin/                       # Admin pages
│   │   ├── aktivitas/               # Activity console
│   │   ├── dashboard/               # KPI dashboard
│   │   ├── ekspor/                  # Export console (NOT used in current scope)
│   │   ├── login/, register/
│   │   ├── riset/                   # bukti/, kognitif/, prompt/, readiness/, triangulasi/
│   │   └── siswa/[id]/              # Student detail
│   ├── api/                         # 19 top-level groups, 88 route.ts files total
│   │   ├── admin/                   # activity/ (16 sub), dashboard, discussions/,
│   │   │                            # insights/, monitoring/, research/ (14 sub),
│   │   │                            # siswa/, users/, login/, logout/, me/, register/
│   │   ├── ask-question/            # streaming AI Q&A
│   │   ├── auth/                    # login, logout, me, refresh, register
│   │   ├── challenge-feedback/, challenge-response/, challenge-thinking/
│   │   ├── courses/, courses/[id]/
│   │   ├── debug/                   # development utilities
│   │   ├── discussion/              # history, module-status, prepare, respond, start, status
│   │   ├── generate-course/, generate-subtopic/, generate-examples/
│   │   ├── jurnal/                  # save
│   │   ├── learning-profile/, learning-progress/
│   │   ├── onboarding-state/
│   │   ├── prompt-journey/
│   │   ├── quiz/                    # status, submit
│   │   └── user-progress/
│   ├── course/[courseId]/           # subtopic/[subIdx]/[pageIdx], discussion/[moduleIdx]
│   ├── dashboard/                   # User dashboard
│   ├── login/, signup/
│   ├── onboarding/                  # Profile wizard + intro slides
│   ├── request-course/              # step1, step2, step3, generating, result
│   ├── error.tsx, global-error.tsx, layout.tsx, page.tsx
│   ├── globals.scss, font-styles.scss, page.module.scss
│   └── favicon.ico
├── components/                      # 15 feature folders
│   ├── admin/                       # JournalModal, ResearchChart, TranscriptModal
│   ├── AILoadingIndicator/
│   ├── AskQuestion/                 # QuestionBox, integrates with PromptBuilder
│   ├── ChallengeThinking/
│   ├── Examples/
│   ├── HelpDrawer/                  # Contextual help panel
│   ├── KeyTakeaways/
│   ├── NextSubtopics/
│   ├── ProductTour/                 # Onboarding tour overlay
│   ├── PromptBuilder/               # Guided prompt construction
│   ├── PromptTimeline/              # Visual prompt evolution
│   ├── Quiz/
│   ├── ReasoningNote/
│   ├── StructuredReflection/
│   └── WhatNext/
├── context/
│   └── RequestCourseContext.tsx     # Multi-step course wizard state
├── hooks/
│   ├── useAdmin.ts                  # /api/admin/me wrapper
│   ├── useAuth.tsx                  # AuthProvider + useAuth hook
│   ├── useDebouncedValue.ts
│   ├── useLearningProgress.ts
│   ├── useLocalStorage.ts
│   ├── useOnboardingState.ts
│   └── useSessionStorage.ts
├── lib/                             # 30 modules + 2 sub-folders
│   ├── activitySeed.ts
│   ├── admin-auth.ts
│   ├── admin-prompt-stage.ts
│   ├── admin-queries.ts
│   ├── admin-quiz-attempts.ts
│   ├── admin-reflection-activity.ts
│   ├── admin-reflection-summary.ts
│   ├── analytics/reflection-model.ts
│   ├── api-client.ts                # Frontend apiFetch + readStream
│   ├── api-logger.ts                # withApiLogging
│   ├── api-middleware.ts            # withProtection, withCacheHeaders
│   ├── auth-helper.ts
│   ├── challenge-feedback.ts
│   ├── database.ts                  # adminDb, publicDb, DatabaseService, DatabaseError
│   ├── discussion/
│   │   ├── resolveSubtopic.ts
│   │   ├── serializers.ts
│   │   └── thinkingSkills.ts
│   ├── discussion-prerequisites.ts
│   ├── engagement.ts
│   ├── jwt.ts                       # generate/verify access + refresh + admin tokens
│   ├── leaf-subtopics.ts
│   ├── learning-progress.ts
│   ├── openai.ts                    # Lazy OpenAI singleton + defaultOpenAIModel
│   ├── ownership.ts
│   ├── quiz-content.ts
│   ├── quiz-sync.ts
│   ├── rate-limit.ts                # DB-backed RateLimiter w/ memory fallback
│   ├── reflection-status.ts
│   ├── reflection-submission.ts
│   ├── research-normalizers.ts
│   ├── schemas.ts                   # 21 Zod schemas + parseBody helper
│   └── supabase-batch.ts
├── services/                        # 8 top-level + discussion/ sub-folder
│   ├── ai.service.ts
│   ├── auth.service.ts
│   ├── cognitive-scoring.service.ts
│   ├── course.service.ts
│   ├── discussion/
│   │   ├── generateDiscussionTemplate.ts
│   │   └── templatePreparation.ts
│   ├── prompt-classifier.ts
│   ├── research-auto-coder.service.ts
│   ├── research-data-reconciliation.service.ts
│   ├── research-field-readiness.service.ts
│   └── research-session.service.ts
├── styles/                          # global styles
└── types/                           # activity, cognitive, dashboard, discussion,
                                     # insights, research, student
```

Project root files used elsewhere in this doc: [middleware.ts](../middleware.ts), [next.config.ts](../next.config.ts), [vercel.json](../vercel.json), [package.json](../package.json).

---

## 4. Auth and Middleware Flow

### Identity Model

PrincipleLearn V3 uses a **custom JWT** scheme rather than Supabase Auth. This is the most consequential architectural decision in the codebase — it touches data access, RLS policy, cookies, and refresh flow.

- **Single shared cookie**: both regular users and admins authenticate via the same `access_token` cookie. The middleware no longer reads a separate `admin_token`. Admin sessions are distinguished only by the `role` claim inside the signed JWT (see [middleware.ts:33-34](../middleware.ts)).
- **Token expiry** ([src/lib/jwt.ts](../src/lib/jwt.ts)):
  - Regular users: access 15m, refresh 3d.
  - Admins: access 30m via `generateAdminAccessToken()`, refresh 3d.
- **Token type claim**: `verifyToken()` rejects payloads with `type === 'refresh'`; `verifyRefreshToken()` rejects payloads with `type === 'access'`. Legacy tokens without a `type` claim are accepted by both for migration compatibility.
- **Refresh token rotation**: each successful `/api/auth/refresh` call issues a new access + refresh pair. The SHA-256 digest of the currently-valid refresh token is persisted in `users.refresh_token_hash` via `updateUserRefreshTokenHash()` so previously-rotated tokens cannot be replayed.

### Middleware Flow (`middleware.ts`)

The Edge middleware executes for every request matching `/((?!_next/static|_next/image|favicon.ico|public/).*)`. Steps in order:

1. **Public route bypass.** Routes `/`, `/login`, `/signup`, `/admin/login`, plus the API auth endpoints (`/api/auth/login|register|refresh|logout`, `/api/admin/login`) skip token verification.
2. **Token presence.** Missing `access_token` returns JSON 401 for `/api/**` and a redirect (`/admin/login` for admin paths, `/login` otherwise) for page routes.
3. **Token verification.** `verifyToken()` is called. If invalid:
   - API routes always return JSON 401 (NEVER a redirect — the 302 would silently drop the POST body).
   - Page routes with a refresh cookie are allowed through; client-side `apiFetch` will hit `/api/auth/refresh` on the first 401.
4. **Admin role check.** `/admin/**` and `/api/admin/**` require `payload.role.toLowerCase() === 'admin'`. Lowercase normalization handles legacy `'ADMIN'` rows. Downstream admin routes do **not** need to re-verify role (per the developer note in middleware.ts:99-107).
5. **Onboarding gate (regular users only)**. Two cookie gates redirect non-admin users to onboarding until both are set:
   - `onboarding_done=true` → profile wizard finished (sends to `/onboarding`).
   - `intro_slides_done=true` → educational intro slides finished (sends to `/onboarding/intro`).
   - Server-side source of truth is `learning_profiles.intro_slides_completed`; the cookies are a UX guard, not a security boundary.
   - Exempt paths: `/onboarding/*`, `/logout`, `/api/auth/*`, `/api/learning-profile`, `/api/onboarding-state`, `/favicon.ico`, `/_next/*`.
6. **CSRF double-submit.** For POST/PUT/DELETE/PATCH on `/api/**`, the `csrf_token` cookie must be present AND match the `x-csrf-token` header — otherwise 403.
7. **Header injection.** `x-user-id`, `x-user-email`, `x-user-role` are cloned onto the forwarded request via `NextResponse.next({ request: { headers } })`. These headers are SAFE TO TRUST inside any `/api/**` handler that ran middleware. Routes that may bypass middleware (cached/rewritten paths) fall back to `verifyToken(req.cookies.get('access_token'))` directly.

### Frontend Auth Helpers

- [`apiFetch(url, options)`](../src/lib/api-client.ts) — every browser-side fetch should go through this wrapper. It auto-attaches the CSRF header, sets `credentials: 'include'`, defaults `Content-Type: application/json` for bodies, and on 401 fires a deduplicated `POST /api/auth/refresh` then retries the original request once. Refresh-exempt URLs: login/register/refresh/logout endpoints (admin + user).
- `useAuth()` ([src/hooks/useAuth.tsx](../src/hooks/useAuth.tsx)) — provider exposes `{ user, isAuthenticated, login, logout, retryAuth, networkError }` and bootstraps from `GET /api/auth/me`.

### Defense in Depth: `withProtection()`

[src/lib/api-middleware.ts](../src/lib/api-middleware.ts) exposes `withProtection(handler, { csrfProtection?, requireAuth?, adminOnly? })`. It re-runs CSRF + JWT verification + admin enforcement at the route level. The middleware is the primary guard; `withProtection` exists so individual routes still validate when middleware was bypassed (cached responses, server actions, edge cases).

---

## 5. API Layer

The App Router contains **88 `route.ts` files** under `src/app/api/`. They are organised into 19 top-level groups.

### Authentication (`/api/auth/**`)

| Route | Method | Notes |
|-------|--------|-------|
| `/api/auth/login` | POST | Validates `LoginSchema`, calls `findUserByEmail` + `verifyPassword` (with constant-time dummy compare on miss), sets cookies. |
| `/api/auth/register` | POST | `RegisterSchema` (strong password). |
| `/api/auth/refresh` | POST | Verifies refresh token, compares hash with `users.refresh_token_hash`, rotates pair. |
| `/api/auth/logout` | POST | Clears cookies + nulls refresh hash. |
| `/api/auth/me` | GET | Returns the user identity from the access token. |

### Admin (`/api/admin/**`)

| Sub-group | Purpose |
|-----------|---------|
| `login`, `logout`, `me`, `register` | Admin-specific auth flow with the 30m access expiry. |
| `dashboard` | Aggregated KPI feed. |
| `users/`, `users/[id]/`, `users/export/` | User CRUD + activity summaries + CSV export. |
| `siswa/` | Indonesian alias for student-detail endpoints used by `/admin/siswa`. |
| `activity/` | 16 sub-routes: `actions`, `analytics`, `ask-question`, `challenge`, `courses`, `discussion`, `examples`, `export`, `feedback`, `generate-course`, `jurnal`, `learning-profile`, `quiz`, `search`, `topics`, `transcript`. |
| `discussions/` | Session list, detail, analytics, module status. |
| `insights/` | Aggregated learning insight queries + export. |
| `research/` | 14 sub-routes (see Section 11): `analytics`, `artifacts`, `auto-code`, `auto-scores`, `bulk`, `classifications`, `classify`, `evidence`, `export`, `indicators`, `readiness`, `reconcile`, `sessions`, `triangulation`. |
| `monitoring/` | API log viewer reading `api_logs`. |

### User Features

| Route | Methods | Notes |
|-------|---------|-------|
| `/api/courses` | GET | Lists user's courses. |
| `/api/courses/[id]` | GET, DELETE | Detail + ownership-checked deletion. |
| `/api/generate-course` | POST | `chatCompletionWithRetry`, validates outline, persists course + subtopics + log row. |
| `/api/generate-subtopic` | POST | Single AI call, caches into `subtopic_cache`. |
| `/api/generate-examples` | POST | Returns `{ examples: string[] }` (Zod-validated). |
| `/api/ask-question` | POST (stream) | Streaming text/plain via `chatCompletionStream`. |
| `/api/challenge-thinking` | POST (stream) | Streaming challenge prompt. |
| `/api/challenge-feedback` | POST | Non-streaming feedback. |
| `/api/challenge-response` | POST | Persists user's challenge answer. |
| `/api/quiz/submit`, `/api/quiz/status` | POST/GET | Submission + per-subtopic completion lookup. |
| `/api/jurnal/save` | POST | Saves journal entries (structured reflection or free-form). |
| `/api/learning-profile`, `/api/learning-progress`, `/api/user-progress` | GET/POST | Profile + progress tracking. |
| `/api/prompt-journey` | GET | Per-user prompt evolution timeline (RM2 surface). |
| `/api/onboarding-state` | GET/POST | Drives the 2-stage onboarding gate. |
| `/api/discussion/start` | POST | Resolves/creates a `discussion_templates` row, opens a `discussion_sessions` row. |
| `/api/discussion/respond` | POST | Evaluates the student's reply with OpenAI JSON-mode and progresses phase/goals. |
| `/api/discussion/history`, `/api/discussion/module-status`, `/api/discussion/status`, `/api/discussion/prepare` | GET/POST | Session metadata, module-level completion, template warmup. |

### Standard Handler Pattern

```typescript
export const POST = withApiLogging(
  async (req: NextRequest) => {
    const body = await req.json();
    const parsed = parseBody(SomeSchema, body);
    if (!parsed.success) return parsed.response;            // 400 with first Zod issue

    const userId = req.headers.get('x-user-id');            // injected by middleware
    if (!(await aiRateLimiter.isAllowed(userId!))) {
      return NextResponse.json({ error: 'Rate limited' }, { status: 429 });
    }

    const result = await someService(parsed.data);
    return NextResponse.json(result);
  },
  { label: 'feature-name' },
);
```

---

## 6. Service Layer

`src/services/` contains the business-logic layer. Route handlers should remain thin and delegate to these modules.

### `auth.service.ts`

Source: [src/services/auth.service.ts](../src/services/auth.service.ts).

| Export | Purpose |
|--------|---------|
| `getCurrentUser()` | Reads `access_token` cookie, verifies, fetches user via `adminDb` with `.is('deleted_at', null)`. Used by routes that bypass middleware injection. |
| `findUserByEmail(email)`, `findUserById(id)` | Soft-delete-aware lookups. |
| `resolveUserByIdentifier(id-or-email)` | Tries ID, then email. Used by quiz/submit, generate-course. |
| `verifyPassword`, `runDummyPasswordCompare` | Bcrypt compare; the dummy compare burns equivalent CPU on the "user not found" branch to resist timing-based enumeration. |
| `hashPassword(password)` | bcryptjs with `genSalt(10)`. |
| `generateAuthTokens(user)` | Returns `{ accessToken, refreshToken }` for regular users (15m / 3d). |
| `generateAdminAuthTokens(user)` | Same shape but uses 30m admin access expiry. |
| `generateCsrfToken()` | 32 random bytes hex. |
| `hashRefreshToken(token)` | SHA-256 digest stored on `users.refresh_token_hash`. |
| `updateUserRefreshTokenHash(userId, hash)` | Persists the latest valid refresh hash (or null on logout). |

### `course.service.ts`

- `listUserCourses(userId)` — courses ordered by `created_at` desc.
- `getCourseById(courseId)` — single lookup.
- `getCourseWithSubtopics(courseId)` — joins subtopics ordered by `order_index`.
- `createCourseWithSubtopics(data, userId, modules)` — inserts the course, then iterates modules into `subtopics`. Continues on individual subtopic failures and logs warnings (best-effort).
- `deleteCourse(courseId, userId, userRole)` — owner-or-admin check before delete.
- `canAccessCourse(course, userId, userRole)` — authorisation predicate reused by GET handlers.

### `ai.service.ts`

Source: [src/services/ai.service.ts](../src/services/ai.service.ts). Re-exports OpenAI primitives from `src/lib/openai.ts` and adds the safety pipeline.

| Export | Purpose |
|--------|---------|
| `chatCompletion({ messages, maxTokens, timeoutMs })` | Single non-streaming call. AbortController-based timeout, default 30s, returns the OpenAI completion object. |
| `chatCompletionWithRetry({ ..., maxAttempts=3, timeoutMs=90000 })` | Retry wrapper with exponential backoff `2s * attempt`. Used by `/api/generate-course`. |
| `chatCompletionStream(opts)` | Streaming call returning `{ stream, cancelTimeout }`. |
| `openAIStreamToReadable(stream, { onComplete, cancelTimeout })` | Converts the async iterable to `ReadableStream<Uint8Array>` for HTTP. Fires `onComplete(fullText)` for side effects (DB persistence). |
| `STREAM_HEADERS` | `text/plain; charset=utf-8`, `Cache-Control: no-cache`, `X-Content-Type-Options: nosniff`. |
| `sanitizePromptInput(input, max=10000)` | Strips injection patterns (`ignore previous instructions`, `you are now a`, `system prompt:`, etc.) and neutralises XML boundary tags `<user_content>`, `<system>`, `<assistant>`. |
| `parseAIJsonResponse<T>(raw)` | Strips ` ```json ` fences and `JSON.parse`. |
| `parseAndValidateAIResponse(raw, schema, label)` | Combines parse + Zod validation. |
| `CourseOutlineResponseSchema` | Zod schema: 1-10 modules, each with title + 1+ subtopics. |
| `AIExamplesResponseSchema` | Zod schema: `{ examples: string[] }`. |

### `prompt-classifier.ts`

Heuristic classifier for the RM2 prompt-development pipeline. Stages are `SCP`, `SRP`, `MQP`, `REFLECTIVE`. The classifier inspects the question text plus the four prompt components (`tujuan`, `konteks`, `batasan`, `reasoning`) and emits `{ stage, confidence, microMarkers[] }`. Reflective and multi-question regex banks are encoded for both Bahasa Indonesia and English.

### `cognitive-scoring.service.ts`

The unified scorer for the RM3 pipeline. Accepts any `InteractionSource` (`ask_question`, `challenge_response`, `quiz_submission`, `journal`, `discussion`) and returns a `CognitiveScores` object with **6 CT** and **6 CTh** indicator scores (each 0-2) plus aggregate `ct_total`, `cth_total`, `cognitive_depth_level` (1-4), confidence, and an evidence summary. Indicator weighting is parameterised per source via `SOURCE_INDICATOR_WEIGHTS`.

### `research-auto-coder.service.ts`

Stage-4 batch auto-coder. For each unscored evidence row in `research_evidence_items` it runs the prompt classifier + cognitive scorer, writes results to `auto_cognitive_scores`, marks the evidence row as `auto_coded`, and may flip the row's `triangulation_status` to `needs_review` when the model has low confidence. Logs every batch into `research_auto_coding_runs`.

### `research-data-reconciliation.service.ts`

Backfill / housekeeping job that scans evidence rows and sources for missing `learning_session_id`, missing `data_collection_week`, etc., and links them to the correct `learning_sessions`. Reports `{ scanned, candidates, updated_evidence, updated_sources, linked_sessions, skipped, ... }`. Always supports a `dryRun` mode.

### `research-field-readiness.service.ts`

Computes the per-student "field readiness" view used by `/admin/riset/readiness` — classifies each student into `siap_tesis` / `sebagian` / `perlu_data` based on minimum quotas of evidence rows, indicator coverage, and discussion sessions. Also produces anonymised participant labels via `formatAnonParticipant()`.

### `research-session.service.ts`

Resolves or creates the `learning_sessions` row for a given `(userId, courseId, sessionNumber, occurredAt)` tuple, computes the ISO week bucket via `getWeekBucket()`, and refreshes per-session aggregate metrics. Also exposes `syncResearchEvidenceItem()` which is the canonical write path for the `research_evidence_items` ledger.

### `discussion/`

- `generateDiscussionTemplate.ts` — calls OpenAI to produce a structured Socratic template (`phases`, `learning_goals`, `closing_message`) given module context (title, summary, objectives, key takeaways, misconceptions). Throws `DiscussionTemplateGenerationError` with structured causes.
- `templatePreparation.ts` — orchestrates template lookup/creation: caches by subtopic key, persists into `discussion_templates`, and exposes `TemplateRecord` to API routes.

---

## 7. Lib Infrastructure

Concise inventory of `src/lib/`. The most important modules already have dedicated sections (auth flow, AI, data); short bullets here for the rest.

**Core infrastructure**

- [`database.ts`](../src/lib/database.ts) — `adminDb`, `publicDb`, `DatabaseService`, `DatabaseError`, JSONB auto-detect. See Section 8.
- [`openai.ts`](../src/lib/openai.ts) — Lazy OpenAI client via Proxy + `defaultOpenAIModel`.
- [`jwt.ts`](../src/lib/jwt.ts) — Token sign/verify, expiry constants.
- [`schemas.ts`](../src/lib/schemas.ts) — 21 Zod schemas + `parseBody()` helper.
- [`api-client.ts`](../src/lib/api-client.ts) — Browser `apiFetch` + `readStream`.
- [`api-middleware.ts`](../src/lib/api-middleware.ts) — `withProtection`, `withCacheHeaders`.
- [`api-logger.ts`](../src/lib/api-logger.ts) — `withApiLogging` writing to `api_logs` (emails are SHA-256 hashed before storage).
- [`rate-limit.ts`](../src/lib/rate-limit.ts) — `RateLimiter` class, DB-backed with in-memory fallback. Limiters: `loginRateLimiter`, `registerRateLimiter`, `resetPasswordRateLimiter`, `changePasswordRateLimiter`, `aiRateLimiter`.
- `auth-helper.ts` — Shared helpers for cookie attrs and Set-Cookie composition.
- `ownership.ts` — Predicates for "user owns this row" checks reused across routes.

**Admin queries (lightweight, used by `/api/admin/**` handlers)**

- `admin-auth.ts` — Admin-route auth utilities.
- `admin-prompt-stage.ts` — Aggregate prompt-stage queries.
- `admin-queries.ts` — Generic admin SELECTs.
- `admin-quiz-attempts.ts` — Quiz attempt aggregations.
- `admin-reflection-activity.ts`, `admin-reflection-summary.ts` — Reflection / journal aggregations.

**Discussion**

- `discussion/resolveSubtopic.ts` — Maps a `(courseId, moduleIdx)` to the canonical subtopic row.
- `discussion/serializers.ts` — Stable JSON serialisation for `discussion_messages`.
- `discussion/thinkingSkills.ts` — `ThinkingSkillMeta` taxonomy + guidance lines used to seed AI prompts.
- `discussion-prerequisites.ts` — Computes whether a learner has unlocked the module's discussion (quiz pass + content read).

**Quiz**

- `quiz-content.ts` — Pure helpers for shaping `quiz` rows.
- `quiz-sync.ts` — Cache-key helpers (`buildSubtopicCacheKey`) shared by quiz + discussion preparation.

**Reflection**

- `reflection-status.ts` — Per-subtopic reflection completion checks.
- `reflection-submission.ts` — Normalisers for the structured reflection payload (used by both `schemas.ts` and persistence).

**Engagement / progress**

- `engagement.ts` — Engagement rollups powering admin charts.
- `learning-progress.ts` — Pure helpers for completion percentages.
- `leaf-subtopics.ts` — Walks the subtopic tree and returns terminal nodes for progress math.
- `activitySeed.ts` — Deterministic seed for replaying recent activity in admin views.

**Research support**

- `research-normalizers.ts` — Type guards (`isUuid`), week-bucket math (`getWeekBucket`), evidence-source enums (`EvidenceSourceType`), prompt-stage normalisation, score normalisation, anonymised-participant labels.
- `analytics/reflection-model.ts` — Modelling layer for the reflection analytics chart.

**Misc**

- `challenge-feedback.ts` — Helpers for shaping the challenge-feedback prompt.
- `supabase-batch.ts` — Batched fetch helpers around `adminDb` to avoid N+1 patterns.

---

## 8. Data Layer

### Clients

| Client | Key | RLS | Use Case |
|--------|-----|-----|----------|
| `adminDb` | `SUPABASE_SERVICE_ROLE_KEY` | Bypassed | All writes, user-scoped reads, admin operations. |
| `publicDb` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Respected | Read-only access to genuinely shared content (`subtopic_cache`, `discussion_templates`). |

Both clients are lazy singletons created on first use ([src/lib/database.ts:65-128](../src/lib/database.ts)) with a 10-second `fetch` timeout enforced via `AbortController`. If env vars are missing on the first request, `database.ts` falls back to loading `.env` and `.env.local` via dotenv to handle stale build workers.

### `DatabaseService` (static)

- `getRecords<T>(table, { select, filter, orderBy, limit })` — generic SELECT (filters are `eq` only).
- `insertRecord<T>(table, data)` — INSERT with JSONB auto-detection.
- `updateRecord<T>(table, id, data, idColumn)` — UPDATE with auto `updated_at`.
- `deleteRecord(table, id, idColumn)` — DELETE by id.

### `SupabaseQueryBuilder` (chainable, reachable as `adminDb.from(...)`)

Mirrors the official Supabase client surface with `select`, `eq`, `neq`, `is`, `gte`, `lte`, `contains`, `in`, `ilike`, `order`, `limit`, `range`, `single`, `maybeSingle`, plus mutation methods `insert`, `update`, `delete`, `upsert`. The builder is thenable so `await adminDb.from('users').select().eq('id', userId).single()` works directly.

### JSONB auto-detection

On the first insert, `DatabaseService` calls a Supabase RPC `get_jsonb_columns()` and caches the table-column mapping for the process lifetime. Non-JSONB columns receiving objects/arrays are auto-stringified. If the RPC fails, a hardcoded fallback mapping is used.

### `DatabaseError`

Custom error class with typed access to PostgREST/Postgres error codes (`23505` unique, `23503` FK, `23502` not-null, `23514` check, `PGRST205` table-not-found, `42501` perm-denied). Helpers: `.is(code)`, `.isUniqueViolation`, `.isForeignKeyViolation`.

### Schema (35 public tables)

The detailed table-by-table catalog lives in [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md). Tables are grouped logically as:

- **Identity**: `users`, `learning_profiles`, `rate_limits`.
- **Content**: `courses`, `subtopics`, `quiz`, `subtopic_cache`, `discussion_templates`, `course_generation_activity`.
- **Learning activity**: `user_progress`, `quiz_submissions`, `ask_question_history`, `jurnal`, `transcript`, `feedback`, `challenge_responses`, `discussion_sessions`, `discussion_messages`, `discussion_admin_actions`.
- **Research**: `learning_sessions`, `prompt_classifications`, `prompt_revisions`, `micro_markers`, `cognitive_indicators`, `auto_cognitive_scores`, `research_evidence_items`, `research_auto_coding_runs`, `research_artifacts`, `triangulation_records`, `inter_rater_reliability`, `discussion_assessments`.
- **Infrastructure**: `api_logs`, `admin_subtopic_delete_logs`.

> **RLS posture.** RLS is enabled across the schema, but because custom JWT claims are NOT Supabase Auth tokens, `auth.uid()` is unavailable. Application-level access control (middleware + service layer + ownership predicates) is the enforced authority; RLS serves as defense-in-depth and as documentation of intended access. `publicDb` is only used where `USING (true)` policies make this safe.

---

## 9. AI Integration

### Client setup

`src/lib/openai.ts` exposes a `Proxy`-wrapped lazy singleton so importing `openai` at module load does not throw during build phases (`Collecting page data`) when `OPENAI_API_KEY` is absent. `defaultOpenAIModel` reads `OPENAI_MODEL` env var (default `'gpt-5-mini'`).

### Endpoint matrix

| Feature | Endpoint | Function | Timeout | Streaming | Rate Limit |
|---------|----------|----------|---------|-----------|------------|
| Course outline | `/api/generate-course` | `chatCompletionWithRetry` | 90s, 3 attempts | No | 30/hr (`aiRateLimiter`) |
| Subtopic content | `/api/generate-subtopic` | `chatCompletion` | 30s | No | 30/hr |
| Examples | `/api/generate-examples` | `chatCompletion` | 30s | No | 30/hr |
| Q&A | `/api/ask-question` | `chatCompletionStream` | 30s | Yes (text/plain) | 30/hr |
| Challenge prompt | `/api/challenge-thinking` | `chatCompletionStream` | 30s | Yes (text/plain) | 30/hr |
| Challenge feedback | `/api/challenge-feedback` | `chatCompletion` | 30s | No | 30/hr |
| Discussion eval | `/api/discussion/respond` | OpenAI JSON-mode | 30s | No | n/a |
| Discussion start | `/api/discussion/start` | `generateDiscussionTemplate` | 30s | No | n/a |

### Retry strategy

`chatCompletionWithRetry` retries up to 3 times with exponential backoff (`2s * attempt`). Each attempt has the configured timeout (90s for course generation). Used only on long-running, high-value calls; everywhere else a single 30s call is preferred so failures are visible to the user immediately.

### Streaming pipeline

```
chatCompletionStream() ──► OpenAI (stream: true) ──► AsyncIterable<StreamChunk>
                                                          │
                                                          ▼
                                            openAIStreamToReadable()
                                                          │
                                                          ▼
                                            ReadableStream<Uint8Array>
                                                          │
                                                          ▼
                                            new Response(stream, { headers: STREAM_HEADERS })
                                                          │
                                                          ▼
                                            Browser readStream(response, onChunk)
                                                          │
                                                          ▼
                                            onComplete(fullText) ──► DB save
```

`onComplete` is the standard hook for persisting Q&A history (`ask_question_history`), challenge text, etc., without blocking the user-facing stream.

### Prompt-injection defense

1. **Sanitisation** — `sanitizePromptInput()` truncates to 10K chars and regex-strips known override patterns plus the boundary tags themselves.
2. **Boundary markers** — user content is wrapped in `<user_content>...</user_content>` so the system prompt can refer to it unambiguously.
3. **System prompt hardening** — explicit instructions to ignore directives that arrive inside `<user_content>`.
4. **Output validation** — `parseAndValidateAIResponse(raw, schema, label)` rejects malformed AI replies before they reach the database.

---

## 10. Frontend Architecture

### App Router pages (selected)

| Route | Purpose |
|-------|---------|
| `/` | Landing page. |
| `/login`, `/signup` | User auth. |
| `/onboarding`, `/onboarding/intro` | 2-stage onboarding gated by middleware cookies. |
| `/dashboard` | User's course library. |
| `/course/[courseId]` | Module navigation. |
| `/course/[courseId]/subtopic/[subIdx]/[pageIdx]` | Learning interface (content, takeaways, quiz, examples, ask-question, challenge, structured reflection, what-next). |
| `/course/[courseId]/discussion/[moduleIdx]` | Socratic discussion (4-phase). |
| `/request-course/step1`, `step2`, `step3`, `generating`, `result` | Multi-step course wizard backed by `RequestCourseContext`. |
| `/admin/login`, `/admin/register` | Admin auth. |
| `/admin/dashboard` | KPI overview. |
| `/admin/aktivitas` | Activity timelines. |
| `/admin/siswa/[id]` | Student detail. |
| `/admin/riset/{bukti, kognitif, prompt, readiness, triangulasi}` | Research console subpages. |
| `/admin/ekspor` | Export console (currently NOT in active scope per user research notes). |

### State management

| Provider/Hook | Scope | Storage | Purpose |
|--------------|-------|---------|---------|
| `AuthProvider` (`useAuth`) | Global | Memory + cookies | User identity, login/logout/refresh, networkError + retryAuth. |
| `RequestCourseProvider` | Course wizard | sessionStorage | Multi-step form state. |
| `useAdmin()` | Admin pages | Memory | Admin profile via `/api/admin/me`. |
| `useLearningProgress` | Subtopic page | Memory + DB | Progress + completion. |
| `useOnboardingState` | Onboarding | sessionStorage + DB | Drives the 2-stage gate. |
| `useLocalStorage(key)`, `useSessionStorage(key)`, `useDebouncedValue(value, ms)` | Per-component | localStorage / sessionStorage / memory | Generic hooks. |

### Styling

Every component folder co-locates a `.module.scss` file; class names are scoped per component. There is no global UI framework — base styles live in `src/app/globals.scss` and `src/styles/`.

---

## 11. Research Pipeline (RM2 / RM3 / RM4)

The platform doubles as the data-collection instrument for the thesis. The pipeline is intentionally split between **synchronous capture** (writes that happen during normal learner activity) and **asynchronous coding** (admin-triggered batch jobs that run the auto-coder + reconciliation services).

### Pipeline diagram

```
Student activity                            Sync capture                       Async coding                  Admin surfaces
─────────────────                           ─────────────                       ─────────────                 ───────────────
ask-question  ─────────┐
challenge-response ────┤
quiz/submit  ──────────┼─► research_evidence_items  ──► research-auto-coder ──► auto_cognitive_scores ──► /admin/riset/kognitif
jurnal/save   ─────────┤   (261 rows)                  (41 runs logged)         (12 rows)
discussion/respond ────┘                                                        prompt_classifications  ──► /admin/riset/prompt
                                                                                (143 rows)
                                                                                triangulation_records   ──► /admin/riset/triangulasi
                                                                                (64 rows)
                                                                                discussion_assessments  ──► /admin/aktivitas
                                                                                (45 rows)
                                                                       ┌──────► research-data-reconciliation
                                                                       │        (links sessions, week buckets)
                                                                       │
prompt submissions ───► prompt-classifier ─► prompt_classifications    │
                        (heuristic, RM2)                               │
                                                                       │
all sources       ────► cognitive-scoring ─► auto_cognitive_scores ────┤
                        (LLM, 6 CT + 6 CTh,                            │
                         depth 1-4)                                    │
                                                                       │
session lifecycle ────► research-session ──► learning_sessions  ───────┘
                        (week buckets)      (22 rows)
```

### Table population status (verified live counts as of 2026-04)

| Table | Rows | Role |
|-------|------|------|
| `prompt_classifications` | 143 | RM2 — output of `prompt-classifier`. |
| `cognitive_indicators` | 12 | RM3 — definition of the 12 indicators (6 CT + 6 CTh). |
| `auto_cognitive_scores` | 12 | RM3 — output of `cognitive-scoring.service`. |
| `research_evidence_items` | 261 | RM2/RM3 — canonical evidence ledger. |
| `research_auto_coding_runs` | 41 | RM3 — log of every auto-coder batch. |
| `triangulation_records` | 64 | RM4 — multi-source triangulation. |
| `discussion_assessments` | 45 | RM3 — per-discussion-turn assessment. |
| `learning_sessions` | 22 | Longitudinal session container. |
| `inter_rater_reliability` | 0 | RM4 — reserved (Cohen's Kappa not yet computed). |
| `research_artifacts` | 0 | Reserved (will hold exported deliverables). |
| `prompt_revisions` | 0 | Reserved (per-prompt edit history not yet captured). |

> **Pipeline status, plainly stated.** The classifier + scorer + reconciler + readiness services are wired and producing data. The triangulation, auto-coder, and assessment surfaces have meaningful row counts. **Inter-rater reliability, prompt-revision history, and the research-artifacts ledger are still empty** — these are partial features awaiting either downstream tooling (Cohen's Kappa computation) or upstream capture (revision diff persistence). Do not treat zero-row tables as a bug.

### Admin research endpoints (`/api/admin/research/**`)

`analytics`, `artifacts`, `auto-code`, `auto-scores`, `bulk`, `classifications`, `classify`, `evidence`, `export`, `indicators`, `readiness`, `reconcile`, `sessions`, `triangulation`. The corresponding pages under `/admin/riset/` are `bukti`, `kognitif`, `prompt`, `readiness`, `triangulasi`.

---

## 12. Testing Architecture

The project uses two test runners side by side.

### Jest (unit + API integration)

Configuration is the default `jest` setup with `ts-jest` and `jsdom` environment. Key directories:

- `tests/api/` — API integration tests grouped by feature: `admin/`, `ai/`, `auth/`, `courses/`, `generate-course/`, `learning/`, `middleware/`, `security/`.
- `tests/unit/` — Pure unit tests (`schemas.test.ts`, `api-client.test.ts`, `discussion-serializers.test.ts`, `supabase-batch.test.ts`, plus admin-* tests).
- `tests/setup/jest.setup.ts` — global setup.
- `tests/setup/test-utils.ts` — shared helpers.
- `tests/setup/mocks/` — MSW handlers.
- `tests/fixtures/{users.fixture.ts, courses.fixture.ts}` — typed fixtures.
- `tests/types/` — shared test types.

Scripts: `npm test`, `npm run test:watch`, `npm run test:coverage`, `npm run test:unit`.

### Playwright (E2E)

Three test groups under `tests/e2e/`: `admin/`, `mobile/`, `user/`. Configuration sits alongside via the standard Playwright config. Reports land in `tests/e2e-report/` and `tests/e2e-results/`.

Scripts: `npm run test:e2e`, `npm run test:e2e:user`, `npm run test:e2e:admin`, `npm run test:e2e:admin:smoke`, `npm run test:e2e:ui`, `npm run test:e2e:headed`. CI alias: `npm run test:ci` (Jest with coverage + Playwright).

### HTTP mocking

`msw` 2.x runs inside Jest tests via the handlers under `tests/setup/mocks/`. `node-mocks-http` covers route-handler unit tests where intercepting `fetch` is overkill.

---

## 13. Build and Deployment

- [`next.config.ts`](../next.config.ts) — minimal Next config; force-loads `.env` and `.env.local` via dotenv at startup so a globally-set `OPENAI_API_KEY` cannot mask the project-local override.
- [`vercel.json`](../vercel.json) — pins region `sin1` and sets `maxDuration: 60` for every `src/app/api/**/*.ts` function, which matters for AI routes that may take 30-60 seconds.
- [`package.json`](../package.json) — Node `22.x` engine. Dev script uses `cross-env FAST_REFRESH=false next dev` (Fast Refresh is intentionally disabled because it corrupts the streaming Q&A state mid-response). `npm run dev:no-lint` skips linting.
- TypeScript `strict` mode; path alias `@/` → `src/`.
- Required env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`, `OPENAI_API_KEY`. Optional: `OPENAI_MODEL` (default `gpt-5-mini`).
- Hosting: Vercel serverless. Database: Supabase managed Postgres 17.

---

## 14. Cross-References

- [API_REFERENCE.md](API_REFERENCE.md) — endpoint-by-endpoint contract reference.
- [DATABASE_SCHEMA.md](DATABASE_SCHEMA.md) — table-by-table catalog with column types and FK relationships.
- [SECURITY.md](SECURITY.md) — auth, CSRF, rate-limit, and prompt-injection details.
- [feature-flows.md](feature-flows.md) — end-to-end user-facing feature flows.
- [admin-and-research-ops.md](admin-and-research-ops.md) — admin + research operational playbook.
- [database-and-data-model.md](database-and-data-model.md) — narrative discussion of the schema.

---

*This document is verified against the source tree on branch `principle-learn-3.0`. When code drifts, prefer regenerating this file from the live tree rather than patching individual sections.*
