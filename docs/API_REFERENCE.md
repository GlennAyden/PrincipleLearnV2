# PrincipleLearn V3 — API Reference

Canonical reference for every HTTP endpoint exposed under `src/app/api/**/route.ts`.
This file is the single source of truth. The companion file
[`docs/api-reference.md`](api-reference.md) is a redirect stub kept in place to
avoid breaking external links.

> Source files: [`src/app/api/`](../src/app/api). Schemas: [`src/lib/schemas.ts`](../src/lib/schemas.ts).
> Edge middleware: [`middleware.ts`](../middleware.ts). Per-route helpers:
> [`src/lib/api-middleware.ts`](../src/lib/api-middleware.ts),
> [`src/lib/api-logger.ts`](../src/lib/api-logger.ts),
> [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts).

---

## Table of Contents

1. [Global Conventions](#1-global-conventions)
   - [1.1 Authentication and identity](#11-authentication-and-identity)
   - [1.2 CSRF double-submit](#12-csrf-double-submit)
   - [1.3 Rate limiting](#13-rate-limiting)
   - [1.4 Request logging (`api_logs`)](#14-request-logging-api_logs)
   - [1.5 Validation](#15-validation)
   - [1.6 Response shape and error codes](#16-response-shape-and-error-codes)
   - [1.7 Streaming responses](#17-streaming-responses)
2. [Authentication — `/api/auth/*`](#2-authentication--apiauth)
3. [Admin Authentication — `/api/admin/{login,logout,register,me}`](#3-admin-authentication--apiadminloginlogoutregisterme)
4. [User Domain — Courses, Progress, Profile](#4-user-domain--courses-progress-profile)
5. [AI Generation Endpoints](#5-ai-generation-endpoints)
6. [Quiz Endpoints](#6-quiz-endpoints)
7. [Journal & Reflection](#7-journal--reflection)
8. [Discussion Endpoints (Student)](#8-discussion-endpoints-student)
9. [Onboarding & Prompt Journey](#9-onboarding--prompt-journey)
10. [Admin Dashboard, Users, Insights, Monitoring](#10-admin-dashboard-users-insights-monitoring)
11. [Admin Activity Tracking](#11-admin-activity-tracking)
12. [Admin Discussion Monitoring](#12-admin-discussion-monitoring)
13. [Admin Research Pipeline](#13-admin-research-pipeline)
14. [Admin — Per-Student Evolution](#14-admin--per-student-evolution)
15. [Debug Endpoints](#15-debug-endpoints)
16. [Schema Index](#16-schema-index)

---

## 1. Global Conventions

### 1.1 Authentication and identity

Authentication is cookie-based. There is no Bearer-token flow.

| Cookie          | HttpOnly | SameSite | Lifetime                                                         | Set by                               |
|-----------------|----------|----------|------------------------------------------------------------------|--------------------------------------|
| `access_token`  | yes      | lax      | 15 min (user) / 30 min (admin)                                  | `/api/auth/login`, `/api/admin/login`, `/api/auth/refresh` |
| `refresh_token` | yes      | lax      | 3 days (issued only when `rememberMe=true` for users; always for admins) | `/api/auth/login`, `/api/admin/login`, `/api/auth/refresh` |
| `csrf_token`    | no       | lax      | tracks the active session lifetime                              | every login + refresh route           |

The middleware ([`middleware.ts`](../middleware.ts)) verifies the access token,
enforces admin-role on `/admin/*` and `/api/admin/*`, and injects three trusted
headers into the request seen by route handlers:

- `x-user-id`
- `x-user-email`
- `x-user-role`

Route handlers MAY trust those headers because they are set after JWT
verification. When a handler does not see them (the request did not traverse
middleware — for example certain edge-cache hits) the canonical recovery is
`verifyToken(req.cookies.get('access_token')?.value)`. Several routes implement
that fallback explicitly; new routes should follow the same pattern instead of
returning 401.

The exempt routes that handle their own auth (no JWT required at the
middleware layer) are: `/api/auth/login`, `/api/auth/register`,
`/api/auth/refresh`, `/api/auth/logout`, `/api/admin/login`. Page-level public
routes are `/`, `/login`, `/signup`, `/admin/login`.

### 1.2 CSRF double-submit

Every mutation method (`POST`, `PUT`, `DELETE`, `PATCH`) under `/api/*` must
include both a `csrf_token` cookie and an `x-csrf-token` request header that
match exactly. Enforcement happens in two places:

- Middleware ([`middleware.ts:160-179`](../middleware.ts)) — global gate for all
  `/api/*` mutations.
- [`withProtection()`](../src/lib/api-middleware.ts) — handler-level wrapper
  that re-runs the same check (defence in depth).

The frontend helper `apiFetch()` in [`src/lib/api-client.ts`](../src/lib/api-client.ts)
reads the `csrf_token` cookie and attaches the header automatically for all
mutating fetches.

### 1.3 Rate limiting

Defined in [`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts). Backed by the
`rate_limits` table, with an in-memory fallback if the table is unavailable.

| Limiter                | Limit                       | Window      | Key      | Used by                                            |
|------------------------|-----------------------------|-------------|----------|----------------------------------------------------|
| `loginRateLimiter`     | 5 attempts                  | 15 minutes  | IP       | `/api/auth/login`                                  |
| `registerRateLimiter`  | 3 attempts                  | 60 minutes  | IP       | `/api/auth/register`                               |
| `aiRateLimiter`        | 30 requests                 | 60 minutes  | userId   | All AI endpoints (`ask-question`, `challenge-*`, `generate-*`, `quiz/regenerate`) |
| `apiRateLimiter`       | 300 requests                | 60 seconds  | userId   | Polling probes (`/api/quiz/status`)                |

Exceeding a limit returns HTTP 429 with `{ "error": "..." }`.

### 1.4 Request logging (`api_logs`)

Routes wrapped with [`withApiLogging()`](../src/lib/api-logger.ts) write one row
per request to the `api_logs` table. Captured columns include `method`, `path`,
`query`, `status_code`, `duration_ms`, `ip_address`, `user_agent`, `user_id`,
`user_email_hash` (SHA-256 truncated, prefixed `h_`), `user_role`, `label`,
`metadata`, and `error_message`. The admin Monitoring view reads this table.

### 1.5 Validation

Mutation routes parse their JSON body via `parseBody(Schema, body)` from
[`src/lib/schemas.ts`](../src/lib/schemas.ts). On failure the helper returns a
ready-to-return 400 `NextResponse` with `{ error: <first issue message> }`.
GET routes that need structured query validation use the same helper after
mapping `URLSearchParams` to a plain object (see `/api/quiz/status`).

Identity fields (`userId`, `userEmail`) are deliberately omitted from most
schemas — the route derives them from the JWT to prevent IDOR. This applies in
particular to `GenerateCourseSchema`, `LearningProfileSchema`,
`OnboardingStateSchema`, and `JurnalSchema`.

### 1.6 Response shape and error codes

Successful JSON responses generally use `{ success: true, ... }` plus the
domain payload. Error responses use `{ error: "...", details?: ... }`.

| Status | Meaning                                                                   |
|--------|---------------------------------------------------------------------------|
| 200    | OK                                                                        |
| 201    | Created                                                                   |
| 400    | Validation failure or missing required field                              |
| 401    | Missing or invalid `access_token` (also: missing `x-user-id`)             |
| 403    | CSRF mismatch, missing role, ownership violation, or admin-only route     |
| 404    | Resource not found (also returned by debug routes when guard fails)       |
| 405    | Method not allowed — admin discussion mutations are intentionally 405     |
| 409    | Conflict — duplicate registration, missing learning_profiles row          |
| 429    | Rate limited                                                              |
| 500    | Unhandled server error                                                    |
| 502    | Upstream AI parse/validation failure                                      |
| 503    | Discussion template still preparing in background                         |

### 1.7 Streaming responses

`/api/ask-question` and `/api/challenge-thinking` return a `ReadableStream`
forwarded from OpenAI via `chatCompletionStream()` in
[`src/services/ai.service.ts`](../src/services/ai.service.ts). Use the headers
exposed by `STREAM_HEADERS` (text/plain, `Cache-Control: no-cache`).

---

## 2. Authentication — `/api/auth/*`

### `POST /api/auth/login`
Source: [`src/app/api/auth/login/route.ts`](../src/app/api/auth/login/route.ts)

| Property      | Value |
|---------------|-------|
| Auth          | Public (no token required) |
| CSRF          | Not required — login is the bootstrap event |
| Schema        | [`LoginSchema`](../src/lib/schemas.ts#L31) |
| Rate limit    | `loginRateLimiter` — 5 / 15 min per IP |
| Logged        | No |
| Service       | `findUserByEmail`, `verifyPassword`, `generateAuthTokens`, `generateCsrfToken` ([`auth.service.ts`](../src/services/auth.service.ts)) |

Sets `access_token`, `csrf_token`, and (when `rememberMe=true`) `refresh_token`
cookies. Response body: `{ success, csrfToken, user: { id, email, role } }`.
Returns 401 with a generic message and burns dummy bcrypt cycles on missing
user to defeat enumeration via response timing.

---

### `POST /api/auth/register`
Source: [`src/app/api/auth/register/route.ts`](../src/app/api/auth/register/route.ts)

| Property      | Value |
|---------------|-------|
| Auth          | Public |
| CSRF          | Not required |
| Schema        | [`RegisterSchema`](../src/lib/schemas.ts#L37) — enforces password strength |
| Rate limit    | `registerRateLimiter` — 3 / 60 min per IP |
| Logged        | No |
| Service       | `findUserByEmail`, `hashPassword`, `DatabaseService.insertRecord` |

Returns 200 `{ success, user, message }` on creation, 409 with the same generic
message on either pre-check duplicate or `unique_violation` race.

---

### `POST /api/auth/refresh`
Source: [`src/app/api/auth/refresh/route.ts`](../src/app/api/auth/refresh/route.ts)

| Property      | Value |
|---------------|-------|
| Auth          | Requires valid `refresh_token` cookie |
| CSRF          | Exempt — middleware whitelists this path; the refresh cookie itself is the auth factor |
| Schema        | None |
| Logged        | No |

Rotates `access_token`, `refresh_token`, and `csrf_token`. Validates the
presented refresh token against the SHA-256 hash stored on the `users` row
(rotation-race defence). Cleared cookies + 401 on revoked or mismatched
tokens. Response body: `{ success, csrfToken }`.

---

### `POST /api/auth/logout`
Source: [`src/app/api/auth/logout/route.ts`](../src/app/api/auth/logout/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Best-effort — wipes `refresh_token_hash` only when caller is identifiable |
| CSRF     | Required — explicit double-submit check inside the handler (not relying on middleware whitelist) |
| Schema   | None |
| Logged   | No |

Clears all three auth cookies, returns `{ success, message }`.

---

### `GET /api/auth/me`
Source: [`src/app/api/auth/me/route.ts`](../src/app/api/auth/me/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Requires valid `access_token` cookie |
| CSRF     | N/A (GET) |
| Service  | `getCurrentUser()` |

Returns `{ user: { id, email, role, name } }`. 401 when not authenticated.

---

## 3. Admin Authentication — `/api/admin/{login,logout,register,me}`

### `POST /api/admin/login`
Source: [`src/app/api/admin/login/route.ts`](../src/app/api/admin/login/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Public; rejects with 403 if found user is not `role === 'admin'` |
| CSRF     | Not required (bootstrap) |
| Schema   | [`AdminLoginSchema`](../src/lib/schemas.ts#L43) |
| Logged   | No |

Sets `access_token` (30 min admin lifetime), `refresh_token` (3 days),
`csrf_token`. Persists refresh token hash. Response body: `{ csrfToken, user }`.

---

### `POST /api/admin/logout`
Source: [`src/app/api/admin/logout/route.ts`](../src/app/api/admin/logout/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Admin role required |
| CSRF     | Required (`verifyCsrfToken` from `lib/admin-auth`) |

Clears all three auth cookies and nulls `refresh_token_hash`. Returns
`{ ok: true }`.

---

### `POST /api/admin/register`
Source: [`src/app/api/admin/register/route.ts`](../src/app/api/admin/register/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Existing admin token required (only admins can mint admins) |
| CSRF     | Required |
| Schema   | [`AdminRegisterSchema`](../src/lib/schemas.ts#L49) — same password policy as user register |

Response: 201 `{ message, data: { id, email, role, created_at } }`.

---

### `GET /api/admin/me`
Source: [`src/app/api/admin/me/route.ts`](../src/app/api/admin/me/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Admin role required |

Returns `{ user: { id, email, name, role } }`. 404 when the admin row has been
soft-deleted.

---

## 4. User Domain — Courses, Progress, Profile

### `GET /api/courses`
Source: [`src/app/api/courses/route.ts`](../src/app/api/courses/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Cookie-based primary; falls back to `x-user-id` header or legacy `userId`/`userEmail` query params |
| Service  | `listUserCourses()` ([`course.service.ts`](../src/services/course.service.ts)) |

Returns `{ success, courses: Course[] }`.

---

### `GET /api/courses/[id]`
Source: [`src/app/api/courses/[id]/route.ts`](../src/app/api/courses/[id]/route.ts)

| Property   | Value |
|------------|-------|
| Auth       | `access_token` required |
| Permission | `canAccessCourse()` — owner or admin |
| Caching    | `Cache-Control: private, max-age=300, stale-while-revalidate=600` + `Vary: Cookie, Authorization` |

Returns `{ success, course }` with `created_by` stripped to avoid leaking
ownership. 404 / 403 on missing or unauthorized.

---

### `DELETE /api/courses/[id]`

| Property   | Value |
|------------|-------|
| Auth       | Token + CSRF |
| Permission | Owner or admin |
| Service    | `deleteCourse()` |

Returns `{ success, message }`.

---

### `GET /api/user-progress`
Source: [`src/app/api/user-progress/route.ts`](../src/app/api/user-progress/route.ts)

| Property | Value |
|----------|-------|
| Auth     | `access_token`; `assertCourseOwnership()` when `courseId` query param present |
| Query    | `courseId?: string` |

Returns `{ success, progress, statistics: { total_subtopics, completed_subtopics, in_progress_subtopics, completion_percentage } }`.

### `POST /api/user-progress`

| Property | Value |
|----------|-------|
| Auth     | Token + CSRF |
| Schema   | [`UserProgressUpsertSchema`](../src/lib/schemas.ts#L275) |

Upserts the `(user_id, course_id, subtopic_id)` row in `user_progress`.

---

### `GET /api/learning-progress`
Source: [`src/app/api/learning-progress/route.ts`](../src/app/api/learning-progress/route.ts)

| Property | Value |
|----------|-------|
| Auth     | `resolveAuthContext` (header or cookie) + `assertCourseOwnership` |
| Logged   | Yes — `learning-progress` |
| Query    | `courseId: string` (required) |

Aggregated learning progress built by `buildLearningProgressStatus()`. 404 on
missing course.

---

### `GET /api/learning-profile`
Source: [`src/app/api/learning-profile/route.ts`](../src/app/api/learning-profile/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Cookie JWT; admins may pass `?userId=` to read another user |

Returns `{ exists, profile }`.

### `POST /api/learning-profile`

| Property | Value |
|----------|-------|
| Auth     | `withProtection()` (cookie + CSRF) |
| Schema   | [`LearningProfileSchema`](../src/lib/schemas.ts#L287) — `userId` is NOT in body, derived from JWT |
| Logged   | Yes — `learning-profile-save` |

Upserts the `learning_profiles` row by `user_id`.

---

## 5. AI Generation Endpoints

All AI endpoints rate-limit per user via `aiRateLimiter` (30 req / 60 min).
Prompt input is sanitized through `sanitizePromptInput()` and wrapped in XML
boundary markers (`<user_content>...</user_content>`) to mitigate prompt
injection.

### `POST /api/generate-course`
Source: [`src/app/api/generate-course/route.ts`](../src/app/api/generate-course/route.ts)

| Property   | Value |
|------------|-------|
| Auth       | `withProtection()` (cookie + CSRF) |
| Schema     | [`GenerateCourseSchema`](../src/lib/schemas.ts#L61) — `.strict()`, identity NOT accepted from body |
| Rate limit | `aiRateLimiter` |
| Logged     | Yes — `generate-course` |
| Other      | Custom `OPTIONS` handler for restricted CORS origins; up to 3 retry attempts with 90s timeout |
| Service    | `chatCompletion()` ([`ai.service.ts`](../src/services/ai.service.ts)) |

Returns `{ outline: Module[], courseId }`. Generated modules include
"discussion" leaf nodes appended via `appendDiscussionNodes()`.

---

### `POST /api/generate-subtopic`
Source: [`src/app/api/generate-subtopic/route.ts`](../src/app/api/generate-subtopic/route.ts)

| Property   | Value |
|------------|-------|
| Auth       | `x-user-id` header (with cookie fallback); enforces strict learning gate |
| CSRF       | Yes (handled by middleware for the POST) |
| Schema     | [`GenerateSubtopicSchema`](../src/lib/schemas.ts#L76) |
| Rate limit | `aiRateLimiter` |
| Logged     | Yes — `generate-subtopic` |
| Caching    | Persists generated content to `subtopic_cache` keyed by canonical `buildSubtopicCacheKey()` |
| Side-effect| Queues background discussion-template preparation for the leaf subtopic |

Returns the subtopic content shape (`{ objectives, pages, keyTakeaways, quiz, whatNext, ... }`).

---

### `POST /api/generate-examples`
Source: [`src/app/api/generate-examples/route.ts`](../src/app/api/generate-examples/route.ts)

| Property   | Value |
|------------|-------|
| Auth       | `withProtection()` |
| Schema     | [`GenerateExamplesSchema`](../src/lib/schemas.ts#L173) — `.strict()` |
| Rate limit | `aiRateLimiter` |
| Logged     | No (uses `withProtection` only) |
| Side-effect| `after()` hook records an `example_usage_events` row with SHA-256 context hash |

Returns `{ examples: string[] }` (capped at 3).

---

### `POST /api/ask-question` (streaming)
Source: [`src/app/api/ask-question/route.ts`](../src/app/api/ask-question/route.ts)

| Property   | Value |
|------------|-------|
| Auth       | `withProtection()` |
| Schema     | [`AskQuestionSchema`](../src/lib/schemas.ts#L146) |
| Rate limit | `aiRateLimiter` |
| Logged     | Yes — `ask-question` |
| Streaming  | text/plain stream via `chatCompletionStream()` |
| Side-effect| Persists Q+A to `ask_question_history`, scores prompt stage in background |

IDOR check: rejects when JWT `userId` does not match `body.userId`.

### `GET /api/ask-question`

| Property | Value |
|----------|-------|
| Auth     | Cookie JWT; rejects when JWT userId does not match `?userId=` |
| Query    | `userId` (required), `courseId`, `moduleIndex`, `subtopicIndex`, `pageNumber` |
| Logged   | Yes — `ask-question-history` |

Returns `{ success, responses: AskQuestionRow[] }` for the page restoration UI.

---

### `POST /api/challenge-thinking` (streaming)
Source: [`src/app/api/challenge-thinking/route.ts`](../src/app/api/challenge-thinking/route.ts)

| Property   | Value |
|------------|-------|
| Auth       | `withProtection()` |
| Schema     | [`ChallengeThinkingSchema`](../src/lib/schemas.ts#L161) |
| Rate limit | `aiRateLimiter` |
| Streaming  | Yes |
| Logged     | No |

Difficulty adapts to `level` (`beginner` / `intermediate` / `advanced`).

---

### `POST /api/challenge-feedback`
Source: [`src/app/api/challenge-feedback/route.ts`](../src/app/api/challenge-feedback/route.ts)

| Property   | Value |
|------------|-------|
| Auth       | `withProtection()` |
| Schema     | [`ChallengeFeedbackSchema`](../src/lib/schemas.ts#L166) |
| Rate limit | `aiRateLimiter` |
| Logged     | Yes — `challenge-feedback` |

Returns `{ feedback: string }` (Markdown). Output normalized through
`normalizeChallengeFeedback()`.

---

### `POST /api/challenge-response`
Source: [`src/app/api/challenge-response/route.ts`](../src/app/api/challenge-response/route.ts)

| Property | Value |
|----------|-------|
| Auth     | `withProtection()` |
| Schema   | [`ChallengeResponseSchema`](../src/lib/schemas.ts#L186) |
| Logged   | Yes — `challenge-response` |

Persists answer + AI feedback to `challenge_responses`. Returns
`{ success, challengeId, message }`.

### `GET /api/challenge-response`

| Property | Value |
|----------|-------|
| Auth     | Cookie JWT; rejects when JWT userId does not match `?userId=` |
| Query    | `userId` (required), `courseId`, `moduleIndex`, `subtopicIndex`, `pageNumber` |

Returns `{ success, responses: ChallengeResponseRow[] }`.

---

## 6. Quiz Endpoints

### `POST /api/quiz/submit`
Source: [`src/app/api/quiz/submit/route.ts`](../src/app/api/quiz/submit/route.ts)

| Property | Value |
|----------|-------|
| Auth     | `withProtection()` |
| Schema   | [`QuizSubmitSchema`](../src/lib/schemas.ts#L116) — requires exactly 5 answers, `moduleTitle` and `subtopicTitle` required for cache-key recovery |
| Logged   | Yes — `quiz-submit` |

Uses 4 matching strategies (exact / fuzzy / title / lazy-seed insert) to find
the quiz row. Returns `{ success, submissionIds, matchingResults, message }`.

---

### `GET /api/quiz/status`
Source: [`src/app/api/quiz/status/route.ts`](../src/app/api/quiz/status/route.ts)

| Property   | Value |
|------------|-------|
| Auth       | Cookie JWT (with header fallback) + `assertCourseOwnership` |
| Schema     | [`QuizStatusSchema`](../src/lib/schemas.ts#L92) — at least one of `subtopicTitle` / `moduleTitle` required |
| Rate limit | `apiRateLimiter` (300 / minute) — tuned for polling |
| Logged     | Yes — `quiz-status` |

Returns `{ completed, attemptCount, latest: AttemptSummary | null }`.

---

### `POST /api/quiz/regenerate`
Source: [`src/app/api/quiz/regenerate/route.ts`](../src/app/api/quiz/regenerate/route.ts)

| Property   | Value |
|------------|-------|
| Auth       | Header or cookie JWT + `assertCourseOwnership` |
| Schema     | Inline Zod (`courseId`, `moduleTitle`, `subtopicTitle`) |
| Rate limit | `aiRateLimiter` |
| Logged     | Yes — `quiz-regenerate` |

Generates 5 new questions via OpenAI, appends them via `appendNewQuizQuestions`
(old rows preserved for audit), and refreshes `subtopic_cache`. Returns
`{ success, quiz }` or 500 with `code: 'QUIZ_CACHE_UPDATE_FAILED'`.

---

## 7. Journal & Reflection

### `POST /api/jurnal/save`
Source: [`src/app/api/jurnal/save/route.ts`](../src/app/api/jurnal/save/route.ts)

| Property | Value |
|----------|-------|
| Auth     | `resolveAuthUserId()` (header or cookie). Body MUST NOT carry `userId` for non-admins |
| CSRF     | Middleware-enforced |
| Schema   | [`JurnalSchema`](../src/lib/schemas.ts#L232) — `superRefine` enforces all-or-nothing for `structured_reflection` |
| Logged   | Yes — `jurnal-save` |
| Side-effect | Mirrors a corresponding row into `feedback` table with `origin_jurnal_id`; refreshes research evidence asynchronously |

Returns `{ success, id, feedbackSaved, feedbackMirrorAction }`.

There is intentionally no separate `/api/feedback` write endpoint anymore —
direct feedback is written through the jurnal mirror path. The admin
read-side still exposes `/api/admin/activity/feedback`.

---

### `GET /api/jurnal/status`
Source: [`src/app/api/jurnal/status/route.ts`](../src/app/api/jurnal/status/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Cookie JWT + `assertCourseOwnership` |
| Logged   | Yes — `jurnal-status` |
| Query    | `courseId` (required), `subtopicId`, `subtopicLabel`, `subtopic`, `moduleIndex`, `subtopicIndex` |

Returns reflection submission status (submitted / completed flags, revision
count, latest submission timestamp, `sourceKinds`, `hasFeedbackMirror`,
`latest`).

There is intentionally no separate `/api/transcript/save` endpoint — Q&A
transcripts are persisted as part of `/api/ask-question` writing to
`ask_question_history`. Admin transcripts read out of the same backing data.

---

## 8. Discussion Endpoints (Student)

### `POST /api/discussion/prepare`
Source: [`src/app/api/discussion/prepare/route.ts`](../src/app/api/discussion/prepare/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Cookie JWT |
| Logged   | Yes — `discussion.prepare` |

Triggers (or polls) background generation of a discussion template. Returns
503 with `Retry-After` while preparing, or 200 once ready.

---

### `POST /api/discussion/start`
Source: [`src/app/api/discussion/start/route.ts`](../src/app/api/discussion/start/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Cookie JWT + `assertCourseOwnership` |
| Schema   | None (handler validates inline) |
| Logged   | Yes — `discussion.start` |

Starts (or resumes) a discussion session for a `(courseId, subtopic)` pair.
Returns `{ session, messages, currentStep }`. Returns 503 when the template is
still preparing (`DISCUSSION_TEMPLATE_PREPARING_CODE`).

---

### `POST /api/discussion/respond`
Source: [`src/app/api/discussion/respond/route.ts`](../src/app/api/discussion/respond/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Cookie JWT |
| Logged   | Yes — `discussion.respond` |

Body: `{ sessionId, message }`. Evaluates the student response, updates goal
coverage, may auto-complete the session, and refreshes research evidence in
the background via `after()`.

Response includes optional flags depending on branch taken:
`effortRejection`, `isRetry`, `clarificationGiven`, `isRemediation`,
`remediationRound`.

---

### `GET /api/discussion/history`
Source: [`src/app/api/discussion/history/route.ts`](../src/app/api/discussion/history/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Cookie JWT |
| Logged   | Yes — `discussion.history` |
| Query    | `sessionId`, `courseId`, `subtopicId`, `subtopicTitle` (any combination that uniquely identifies a session) |

Returns `{ session, messages, currentStep }`.

---

### `GET /api/discussion/status`
Source: [`src/app/api/discussion/status/route.ts`](../src/app/api/discussion/status/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Cookie JWT + `assertCourseOwnership` |
| Logged   | Yes — `discussion.status` |
| Query    | `courseId`, `subtopicId` or `subtopicTitle` |

Returns the latest session's `{ session: { id, status, phase, learningGoals, ... } }`.
404 with `code: 'SESSION_NOT_FOUND'` or `'DISCUSSION_CONTEXT_NOT_FOUND'`.

---

### `GET /api/discussion/module-status`
Source: [`src/app/api/discussion/module-status/route.ts`](../src/app/api/discussion/module-status/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Cookie JWT + `assertCourseOwnership` |
| Logged   | Yes — `discussion.module-status` |
| Query    | `courseId`, `moduleId` (both required) |

Returns the prerequisites payload: `{ ready, summary: { total, completed, generated, quizCompleted }, subtopics: [...] }`.

---

## 9. Onboarding & Prompt Journey

### `GET /api/onboarding-state`
Source: [`src/app/api/onboarding-state/route.ts`](../src/app/api/onboarding-state/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Cookie JWT |
| Schema   | None |

Returns `{ success, state: { introSlidesCompleted, courseTourCompleted } }`.

### `POST /api/onboarding-state`

| Property | Value |
|----------|-------|
| Auth     | `withProtection()` (cookie + CSRF) |
| Schema   | [`OnboardingStateSchema`](../src/lib/schemas.ts#L299) — `userId` derived from JWT |
| Logged   | Yes — `onboarding-state-update` |

Sets a single onboarding flag (`intro_slides` or `course_tour`). Returns 409
`code: 'PROFILE_MISSING'` when the `learning_profiles` row does not yet exist.

---

### `GET /api/prompt-journey`
Source: [`src/app/api/prompt-journey/route.ts`](../src/app/api/prompt-journey/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Cookie JWT; non-admin cannot pass another user's `?userId=` |
| Query    | `userId?` (admin only), `courseId?` |

Returns `{ success, entries, count }` from `ask_question_history` for prompt
evolution analytics. Capped at 200 rows.

---

## 10. Admin Dashboard, Users, Insights, Monitoring

All admin routes require `payload.role.toLowerCase() === 'admin'`. Middleware
enforces this for the entire `/api/admin/*` namespace.

### `GET /api/admin/dashboard`
Source: [`src/app/api/admin/dashboard/route.ts`](../src/app/api/admin/dashboard/route.ts)

Auth: `verifyAdminFromCookie`. Query: `range = all | 7d | 30d | 90d`.
Returns `{ kpi, rm2, rm3, studentSummary, recentActivity, meta: { range, cachedAt, queryTimeMs } }`. Uses an in-process 30-second cache.

---

### `GET /api/admin/users`
Source: [`src/app/api/admin/users/route.ts`](../src/app/api/admin/users/route.ts)

Returns the student list with engagement scores and prompt-stage hints.
Backed by the `get_admin_user_stats` Postgres function.

### `DELETE /api/admin/users/[id]`
Source: [`src/app/api/admin/users/[id]/route.ts`](../src/app/api/admin/users/[id]/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Admin role required |
| CSRF     | Required (`verifyCsrfToken`) |

Cascades user deletion across related tables. Self-deletion blocked with 403.
Returns `{ success, message, warnings? }`.

### `GET /api/admin/users/[id]/detail`
Source: [`src/app/api/admin/users/[id]/detail/route.ts`](../src/app/api/admin/users/[id]/detail/route.ts)

Returns aggregated profile data for a single user.

### `GET /api/admin/users/[id]/activity-summary`
Source: [`src/app/api/admin/users/[id]/activity-summary/route.ts`](../src/app/api/admin/users/[id]/activity-summary/route.ts)

Activity rollup (counts of quizzes, journals, transcripts, etc.).

### `GET /api/admin/users/[id]/subtopics`
### `POST /api/admin/users/[id]/subtopics`
Source: [`src/app/api/admin/users/[id]/subtopics/route.ts`](../src/app/api/admin/users/[id]/subtopics/route.ts)

GET returns the user's courses with subtopic listings. POST (CSRF) accepts
`{ courseId, subtopicId, note }` for legacy admin notes (the
`admin_subtopic_delete_logs` table is not currently populated).

### `GET /api/admin/users/export`
Source: [`src/app/api/admin/users/export/route.ts`](../src/app/api/admin/users/export/route.ts)

Query: `format = csv | json`, `user_id?`, `start_date?`, `end_date?`,
`anonymize?`. Streams a per-student export.

---

### `GET /api/admin/insights`
Source: [`src/app/api/admin/insights/route.ts`](../src/app/api/admin/insights/route.ts)

Query: `userId?`, `courseId?`, `range`. Cached for 60 s.

### `GET /api/admin/insights/export`
Source: [`src/app/api/admin/insights/export/route.ts`](../src/app/api/admin/insights/export/route.ts)

Query: `format = csv | json`. Exports insights for research.

---

### `GET /api/admin/monitoring/logging`
Source: [`src/app/api/admin/monitoring/logging/route.ts`](../src/app/api/admin/monitoring/logging/route.ts)

Returns `api_logs` rows for a configurable time window (`?days=N`, capped at
30, default 7).

---

## 11. Admin Activity Tracking

All `/api/admin/activity/*` routes are GET-only (with one exception listed
below) and use `withProtection({ adminOnly: true, csrfProtection: false })`.
They are read-only inspection endpoints powering the admin UI.

| Endpoint                                                                                                                  | Method | Notes |
|---------------------------------------------------------------------------------------------------------------------------|--------|-------|
| `/api/admin/activity/actions`                                                                                             | POST   | `csrfProtection: true` — admin write surface for action logs |
| `/api/admin/activity/analytics`                                                                                           | GET    |       |
| `/api/admin/activity/ask-question`                                                                                        | GET    |       |
| `/api/admin/activity/challenge`                                                                                           | GET    |       |
| `/api/admin/activity/courses`                                                                                             | GET    |       |
| `/api/admin/activity/discussion`                                                                                          | GET    | Custom handler (no `withProtection` wrapper) |
| `/api/admin/activity/examples`                                                                                            | GET    |       |
| `/api/admin/activity/export`                                                                                              | GET    | Bulk export across activity types |
| `/api/admin/activity/feedback`                                                                                            | GET    |       |
| `/api/admin/activity/generate-course`                                                                                     | GET    |       |
| `/api/admin/activity/jurnal`                                                                                              | GET    |       |
| `/api/admin/activity/jurnal/[id]`                                                                                         | GET    |       |
| `/api/admin/activity/learning-profile`                                                                                    | GET    | Custom handler |
| `/api/admin/activity/quiz`                                                                                                | GET    |       |
| `/api/admin/activity/quiz/[id]`                                                                                           | GET    |       |
| `/api/admin/activity/search`                                                                                              | GET    | Cross-activity search |
| `/api/admin/activity/topics`                                                                                              | GET    |       |
| `/api/admin/activity/transcript`                                                                                          | GET    |       |
| `/api/admin/activity/transcript/[id]`                                                                                     | GET    |       |

Source files live under [`src/app/api/admin/activity/`](../src/app/api/admin/activity).

---

## 12. Admin Discussion Monitoring

The admin discussion surface is **read-only by design** — mutation routes are
intentionally wired to return 405 with the message
`"Admin discussion interventions are disabled. Monitoring is read-only."`

| Endpoint                                                          | Method | Notes |
|-------------------------------------------------------------------|--------|-------|
| [`/api/admin/discussions`](../src/app/api/admin/discussions/route.ts)                                | GET    | Listing with filters: `status`, `courseId`, `subtopicId`, `userId`, `sortBy`, `limit`. Logged as `admin.discussions.list`. |
| [`/api/admin/discussions/[sessionId]`](../src/app/api/admin/discussions/[sessionId]/route.ts)        | GET    | Session detail with messages and audit entries. Logged as `admin.discussions.detail`. |
| [`/api/admin/discussions/[sessionId]`](../src/app/api/admin/discussions/[sessionId]/route.ts)        | POST   | Returns 405 (intervention disabled). Logged as `admin.discussions.intervention`. |
| [`/api/admin/discussions/[sessionId]/feedback`](../src/app/api/admin/discussions/[sessionId]/feedback/route.ts) | POST   | Returns 405. |
| [`/api/admin/discussions/analytics`](../src/app/api/admin/discussions/analytics/route.ts)            | GET    | Session-level analytics. |
| [`/api/admin/discussions/module-status`](../src/app/api/admin/discussions/module-status/route.ts)    | GET    | Cross-user module readiness. |
| [`/api/admin/discussions/bulk`](../src/app/api/admin/discussions/bulk/route.ts)                      | POST   | Body: `{ sessionIds, action }`. Only `action === 'export_csv'` is accepted; everything else returns 405. |

---

## 13. Admin Research Pipeline

These endpoints back the RM2/RM3 research data flow. All require admin role.
Each schema is documented in code; query/body shapes vary by endpoint.

| Endpoint                                                                                                          | Methods | Notes |
|-------------------------------------------------------------------------------------------------------------------|---------|-------|
| [`/api/admin/research/analytics`](../src/app/api/admin/research/analytics/route.ts)                                | GET     | Research analytics aggregates. |
| [`/api/admin/research/artifacts`](../src/app/api/admin/research/artifacts/route.ts)                                | GET, POST | Artifact catalog. |
| [`/api/admin/research/auto-code`](../src/app/api/admin/research/auto-code/route.ts)                                | GET, POST | `awaitLog: false` on POST. |
| [`/api/admin/research/auto-scores`](../src/app/api/admin/research/auto-scores/route.ts)                            | GET     | Logged as `admin.auto-scores`. |
| [`/api/admin/research/auto-scores/summary`](../src/app/api/admin/research/auto-scores/summary/route.ts)            | GET     | Logged as `admin.auto-scores-summary`. |
| [`/api/admin/research/bulk`](../src/app/api/admin/research/bulk/route.ts)                                          | POST    | Bulk operations on research evidence. |
| [`/api/admin/research/classifications`](../src/app/api/admin/research/classifications/route.ts)                    | GET, POST, PUT, DELETE | CRUD for prompt classifications. Filters: `user_id`, `course_id`, `learning_session_id`, `prompt_stage`, `prompt_source`, `offset`, `limit`. |
| [`/api/admin/research/classify`](../src/app/api/admin/research/classify/route.ts)                                  | POST    | Run a single classification job. |
| [`/api/admin/research/evidence`](../src/app/api/admin/research/evidence/route.ts)                                  | GET, POST, PUT | Evidence record management. |
| [`/api/admin/research/export`](../src/app/api/admin/research/export/route.ts)                                      | GET     | Query: `format`, `data_type` (or `type`), `spss`. CSV/JSON export. |
| [`/api/admin/research/indicators`](../src/app/api/admin/research/indicators/route.ts)                              | GET, POST, PUT, DELETE | CRUD for cognitive indicators. |
| [`/api/admin/research/readiness`](../src/app/api/admin/research/readiness/route.ts)                                | GET     | Per-student readiness snapshot. Query: `user_id`, `course_id`, `start_date`, `end_date`. |
| [`/api/admin/research/reconcile`](../src/app/api/admin/research/reconcile/route.ts)                                | POST    | `dry_run`, `limit`, `user_id`, `course_id`. `maxDuration = 55` s. |
| [`/api/admin/research/sessions`](../src/app/api/admin/research/sessions/route.ts)                                  | GET, POST, PUT, DELETE | Manage research learning sessions. |
| [`/api/admin/research/triangulation`](../src/app/api/admin/research/triangulation/route.ts)                        | GET, POST, PUT, DELETE | Triangulation records. |

> Per [`MEMORY.md`](../../.claude/agent-memory) (project context), the
> classifier pipeline that populates the 9 research tables is not yet built —
> these endpoints are wired but largely return empty result sets in production.

---

## 14. Admin — Per-Student Evolution

### `GET /api/admin/siswa/[id]/evolusi`
Source: [`src/app/api/admin/siswa/[id]/evolusi/route.ts`](../src/app/api/admin/siswa/[id]/evolusi/route.ts)

| Property | Value |
|----------|-------|
| Auth     | Admin role |
| Path     | `id` must be a UUID |

Returns `{ sessions, stageProgression, promptHistory }` for the student's
prompt evolution view. Tolerant of missing research tables (returns empty
arrays instead of erroring).

---

## 15. Debug Endpoints

All `/api/debug/*` routes are dual-gated:

1. `process.env.NODE_ENV !== 'production'` OR `ENABLE_DEBUG_ROUTES=1`
2. Caller has admin role (`x-user-role`)

Either condition failing returns **404 (not 403)** so the routes do not leak
their existence to unauthorized callers.

| Endpoint                                                                                  | Methods | Purpose |
|-------------------------------------------------------------------------------------------|---------|---------|
| [`/api/debug/users`](../src/app/api/debug/users/route.ts)                                  | GET, POST | GET probes the `users` table. POST inserts a throwaway test user. |
| [`/api/debug/generate-courses`](../src/app/api/debug/generate-courses/route.ts)            | GET     | Returns mock generate-course records for UI testing. |
| [`/api/debug/course-test/[id]`](../src/app/api/debug/course-test/[id]/route.ts)            | GET     | Walks course → subtopics → outline parsing for the given course id. |

---

## 16. Schema Index

All schemas in [`src/lib/schemas.ts`](../src/lib/schemas.ts), used by the
indicated routes.

| Schema                                                                  | Used by                                                       |
|-------------------------------------------------------------------------|---------------------------------------------------------------|
| [`LoginSchema`](../src/lib/schemas.ts#L31)                              | `POST /api/auth/login`                                        |
| [`RegisterSchema`](../src/lib/schemas.ts#L37)                           | `POST /api/auth/register`                                     |
| [`AdminLoginSchema`](../src/lib/schemas.ts#L43)                         | `POST /api/admin/login`                                       |
| [`AdminRegisterSchema`](../src/lib/schemas.ts#L49)                      | `POST /api/admin/register`                                    |
| [`GenerateCourseSchema`](../src/lib/schemas.ts#L61)                     | `POST /api/generate-course`                                   |
| [`GenerateSubtopicSchema`](../src/lib/schemas.ts#L76)                   | `POST /api/generate-subtopic`                                 |
| [`QuizStatusSchema`](../src/lib/schemas.ts#L92)                         | `GET /api/quiz/status`                                        |
| [`QuizSubmitSchema`](../src/lib/schemas.ts#L116)                        | `POST /api/quiz/submit`                                       |
| [`PromptComponentsSchema`](../src/lib/schemas.ts#L137)                  | nested in `AskQuestionSchema`                                 |
| [`AskQuestionSchema`](../src/lib/schemas.ts#L146)                       | `POST /api/ask-question`                                      |
| [`ChallengeThinkingSchema`](../src/lib/schemas.ts#L161)                 | `POST /api/challenge-thinking`                                |
| [`ChallengeFeedbackSchema`](../src/lib/schemas.ts#L166)                 | `POST /api/challenge-feedback`                                |
| [`GenerateExamplesSchema`](../src/lib/schemas.ts#L173)                  | `POST /api/generate-examples`                                 |
| [`ChallengeResponseSchema`](../src/lib/schemas.ts#L186)                 | `POST /api/challenge-response`                                |
| [`FeedbackSchema`](../src/lib/schemas.ts#L216)                          | (legacy mirror — direct writes go through `/api/jurnal/save`) |
| [`JurnalSchema`](../src/lib/schemas.ts#L232)                            | `POST /api/jurnal/save`                                       |
| [`UserProgressUpsertSchema`](../src/lib/schemas.ts#L275)                | `POST /api/user-progress`                                     |
| [`LearningProfileSchema`](../src/lib/schemas.ts#L287)                   | `POST /api/learning-profile`                                  |
| [`OnboardingStateSchema`](../src/lib/schemas.ts#L299)                   | `POST /api/onboarding-state`                                  |

`parseBody()` (the helper at [`src/lib/schemas.ts:312`](../src/lib/schemas.ts#L312))
returns a tagged union — handlers use `if (!parsed.success) return parsed.response`
to short-circuit on validation failure.

---

*Generated by walking `src/app/api/**/route.ts`. When adding a new endpoint:
update this file in the same PR, link the relevant schema with a line-anchored
markdown link, and note any non-default behaviour (rate limit, logging label,
streaming, custom auth pattern).*
