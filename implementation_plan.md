# Implementation Plan: Course Generation Flow — Bug Fixes, Optimization & Test Coverage

[Overview]
Fix critical security vulnerabilities, API/frontend mismatches, and optimization gaps in the user-facing course generation flow (request-course wizard → generating → dashboard → course detail → subtopic learning).

The course generation feature is the core user journey of PrincipleLearn V3. After deep analysis of all API routes, frontend pages, database schema, middleware, admin integration points, and test scripts, **11 issues** were identified across 3 severity levels: 5 critical, 4 moderate, and test coverage gaps across 11+ untested API routes and E2E scenarios. This plan addresses all issues in priority order to ensure data integrity, security, performance, and comprehensive test coverage.

Key areas of concern:
1. **Security**: `GET /api/courses` has no auth check; `generate-subtopic` middleware returns HTML redirect instead of JSON 401
2. **Data integrity**: `subtopics.content` TEXT vs JSONB mismatch risking double-encoding; `Advance` vs `Advanced` enum inconsistency
3. **UX/Frontend**: generate-course API doesn't return courseId (no direct redirect); triple-fetch of course data; broken preload logic
4. **Test coverage**: 11+ API routes have zero tests; E2E tests don't cover post-generation flows

[Types]
Fix the `Level` type inconsistency between `'Advance'` and `'Advanced'`.

**Current** (`src/context/RequestCourseContext.tsx`):
```typescript
export type Level = '' | 'Beginner' | 'Intermediate' | 'Advance';
```

**Updated to**:
```typescript
export type Level = '' | 'Beginner' | 'Intermediate' | 'Advanced';
```

All references to `'Advance'` in the codebase must be updated to `'Advanced'`:
- `src/context/RequestCourseContext.tsx` — type definition
- `src/app/request-course/step2/page.tsx` — value: `'Advance'` → `'Advanced'`
- `src/app/course/[courseId]/page.tsx` — Level import
- `src/app/course/[courseId]/layout.tsx` — Level import
- `src/app/course/[courseId]/subtopic/[subIdx]/[pageIdx]/page.tsx` — indirect usage via course.level

Database values already stored as `'Advance'` should be handled with a fallback: display `'Advanced'` when reading `'Advance'` from DB.

[Files]
Modify 8 existing files and create 4 new test files.

**Existing files to modify:**

1. `src/app/api/courses/route.ts` — Add cookie-based auth check (like `/api/courses/[id]`)
2. `src/app/api/generate-course/route.ts` — Return `courseId` in response; fix `request_payload` documentation
3. `src/app/request-course/generating/page.tsx` — Use returned `courseId` to redirect directly to course page
4. `src/context/RequestCourseContext.tsx` — Fix `'Advance'` → `'Advanced'` in Level type
5. `src/app/request-course/step2/page.tsx` — Fix level value `'Advance'` → `'Advanced'`
6. `src/app/course/[courseId]/subtopic/[subIdx]/[pageIdx]/page.tsx` — Fix preload useEffect (separate effect depending on `data`); remove stale closure
7. `src/lib/database.ts` — Remove `'content'` from `subtopics` entry in `JSONB_COLUMNS` (content is TEXT column, should be stringified)
8. `middleware.ts` — Return JSON 401 for API routes instead of HTML redirect

**New test files to create:**

1. `tests/api/generate-subtopic/generate-subtopic.test.ts` — Unit tests for POST /api/generate-subtopic
2. `tests/api/courses/courses-auth.test.ts` — Auth-specific tests for GET /api/courses after fix
3. `tests/e2e/user/course-detail.spec.ts` — E2E tests for course overview and subtopic navigation
4. `tests/e2e/user/course-learning.spec.ts` — E2E tests for subtopic learning flow (interactive features)

[Functions]
Fix 5 existing functions and add 1 new helper function.

**Modified functions:**

1. **`GET` in `src/app/api/courses/route.ts`**
   - Current: Accepts `userId` query param without token verification
   - Change: Add `getCurrentUser()` helper (same pattern as `/api/courses/[id]/route.ts`), extract userId from cookie token, ignore query param userId for auth

2. **`postHandler` in `src/app/api/generate-course/route.ts`**
   - Current: Returns `{ outline }` only
   - Change: Return `{ outline, courseId: createdCourse?.id || null }` so frontend can redirect directly

3. **`generateCourse` in `src/app/request-course/generating/page.tsx`**
   - Current: Always redirects to `/dashboard` after success
   - Change: If `data.courseId` exists, redirect to `/course/${data.courseId}` instead of `/dashboard`

4. **Preload `useEffect` in `src/app/course/[courseId]/subtopic/[subIdx]/[pageIdx]/page.tsx`**
   - Current: Preload logic inside same useEffect that loads current subtopic; checks `data` which is stale
   - Change: Extract preload into separate `useEffect` with `[data, course, moduleIndex, subtopicIndex]` dependency array

5. **`middleware` in `middleware.ts`**
   - Current: Redirects to `/login` HTML page for all unauthenticated requests including API routes
   - Change: For paths starting with `/api/`, return `NextResponse.json({ error: 'Authentication required' }, { status: 401 })` instead of redirect

**New helper function:**

6. **`getCurrentUser()` in `src/app/api/courses/route.ts`**
   - Signature: `async function getCurrentUser(): Promise<UserRecord | null>`
   - Same implementation as in `src/app/api/courses/[id]/route.ts` — reads cookie, verifies token, fetches user from DB

[Classes]
No class modifications needed.

All changes involve standalone functions, React components, and configuration objects. The `DatabaseService` class and `SupabaseQueryBuilder` class remain unchanged.

[Dependencies]
No new dependencies needed.

All fixes use existing packages: `next/server`, `@supabase/supabase-js`, `next/headers`, `@/lib/jwt`. No version changes required. Test files use existing `jest` and `@playwright/test` frameworks.

[Testing]
Add unit tests for 2 API routes and 2 E2E test suites covering post-generation flows.

**New API test files:**

1. **`tests/api/generate-subtopic/generate-subtopic.test.ts`** — 8+ test cases:
   - Returns 400 for missing module/subtopic
   - Returns 400 for invalid JSON body
   - Returns cached content when available
   - Generates new content via OpenAI when no cache
   - Saves to subtopic_cache after generation
   - Syncs quiz questions to database
   - Handles OpenAI failure gracefully (500)
   - Validates and fixes paragraph count (3-5 per page)

2. **`tests/api/courses/courses-auth.test.ts`** — 6+ test cases:
   - Returns 401 when no access_token cookie
   - Returns 401 when token is invalid
   - Returns courses for authenticated user
   - Does NOT return other users' courses
   - Returns empty array when user has no courses
   - Admin can see all courses (optional)

**Updated existing test files:**

3. **`tests/api/generate-course/generate.test.ts`** — Add test:
   - Verify response includes `courseId` field
   - Verify `courseId` matches the inserted course record ID

4. **`tests/api/courses/courses.test.ts`** — Update tests to work with new auth-based approach (cookie instead of query param)

**New E2E test files:**

5. **`tests/e2e/user/course-detail.spec.ts`** — 6+ scenarios:
   - Course overview page loads with modules/subtopics
   - Sidebar navigation works (module switching)
   - Subtopic cards display title and overview
   - Discussion card shows correct status
   - Mobile menu toggle works
   - Back navigation works

6. **`tests/e2e/user/course-learning.spec.ts`** — 6+ scenarios:
   - Subtopic content pages load with paragraphs
   - Progress bar updates on navigation
   - Interactive buttons visible (Ask Question, Challenge, Examples)
   - Key Takeaways page renders
   - Quiz page renders with questions
   - Next/Back navigation works through all pages

[Implementation Order]
Execute fixes in dependency order: security first, then data integrity, then UX, then tests.

1. **Fix middleware API route handling** (`middleware.ts`)
   - Return JSON 401 for `/api/*` routes instead of HTML redirect
   - This is the foundation — all other API fixes depend on proper auth responses

2. **Fix `GET /api/courses` auth** (`src/app/api/courses/route.ts`)
   - Add `getCurrentUser()` helper using cookie-based auth
   - Change route to use authenticated userId instead of query param
   - Update dashboard to not send userId in query (use cookie instead)

3. **Fix Level type inconsistency** (`src/context/RequestCourseContext.tsx`, `src/app/request-course/step2/page.tsx`)
   - Change `'Advance'` → `'Advanced'` in type and step2 value
   - Add fallback normalization for existing DB records

4. **Fix subtopics.content JSONB_COLUMNS** (`src/lib/database.ts`)
   - Remove `'content'` from subtopics entry in JSONB_COLUMNS
   - This ensures TEXT column content is properly stringified

5. **Return courseId from generate-course API** (`src/app/api/generate-course/route.ts`)
   - Add `courseId` to response JSON
   - Update generating page to redirect to `/course/[courseId]`

6. **Fix generating page redirect** (`src/app/request-course/generating/page.tsx`)
   - Use `courseId` from API response for direct course redirect
   - Fallback to `/dashboard` if no courseId

7. **Fix subtopic preload race condition** (`src/app/course/[courseId]/subtopic/[subIdx]/[pageIdx]/page.tsx`)
   - Extract preload into separate useEffect with proper dependencies

8. **Update dashboard to use cookie auth** (`src/app/dashboard/page.tsx`)
   - Remove userId from courses API query param (now handled by cookie)

9. **Update existing tests** (`tests/api/courses/courses.test.ts`, `tests/api/generate-course/generate.test.ts`)
   - Add cookie mock for courses test
   - Add courseId assertion for generate test

10. **Create new API tests** (`tests/api/generate-subtopic/`, `tests/api/courses/courses-auth.test.ts`)

11. **Create new E2E tests** (`tests/e2e/user/course-detail.spec.ts`, `tests/e2e/user/course-learning.spec.ts`)
