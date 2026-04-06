# Comprehensive Codebase Audit Report

**Date**: 2026-04-06
**Project**: PrincipleLearn V3
**Branch**: `principle-learn-3.0`

---

## Executive Summary

| Audit | Critical | High | Medium | Low | OK |
|-------|----------|------|--------|-----|-----|
| 1. API Contract | 0 | 3 | 1 | 3 | 62 endpoints wired correctly |
| 2. Database-Code Schema | 3 | 7 | 3 | 0 | 17 tables OK |
| 3. Auth & Authorization | 6 | 6 | 3 | 2 | 15 routes properly guarded |
| 4. Feature E2E Wiring | 0 | 2 | 2 | 1 | 14 features fully wired |
| 5. Dead Code / Orphans | 0 | 0 | 5 | 30+ | - |
| 6. Error Handling | 1 | 4 | 3 | 3 | 76/77 routes have try/catch |
| 7. RLS & Data Access | 7 | 3 | 2 | 1 | Core auth routes OK |
| **TOTAL** | **17** | **25** | **19** | **40+** | |

---

## 1. API Contract Audit

### HIGH — Functional Bugs

**MISMATCH: Admin login reads wrong error field**
- `src/app/admin/login/page.tsx:42` reads `data.message` but API returns `{ error: '...' }`
- **Impact**: Error messages never shown, always falls back to generic "Login failed"

**MISMATCH: Admin register reads wrong error field**
- `src/app/admin/register/page.tsx:30` reads `data.message` but API returns `{ error: '...' }`
- **Impact**: Same as above — specific errors never displayed

**MISMATCH: Research sessions page expects `data.users` wrapper**
- `src/app/admin/research/sessions/page.tsx:72` reads `data.users` from `/api/admin/users`
- API returns raw array, not `{ users: [...] }`
- **Impact**: User dropdown in research sessions page is broken/empty

### MEDIUM

**MISMATCH: `/api/auth/login` response missing `name` field**
- Frontend reads `data.user.name` but backend only returns `{ id, email, role }`
- **Impact**: User name is null until page reload

### LOW

| Issue | Detail |
|-------|--------|
| Extra `userEmail` in quiz submit | Silently stripped by Zod |
| `limit` param ignored on `/api/admin/users` and `/api/courses` | Functional but wasteful |
| Dead code in challenge-thinking non-streaming fallback | `responseData.question` path never hit |

### Orphan Routes (17 routes with no frontend caller)

| Route | Type |
|-------|------|
| `/api/user-progress` | Called only server-side |
| `/api/generate-course/log` | Explicitly deprecated |
| `/api/admin/activity/actions` | No UI |
| `/api/admin/activity/analytics` | No UI |
| `/api/admin/activity/search` | No UI |
| `/api/admin/activity/export` | No UI |
| `/api/admin/activity/jurnal/[id]` | No UI |
| `/api/admin/activity/transcript/[id]` | No UI |
| `/api/admin/discussions/analytics` | No UI |
| `/api/admin/discussions/bulk` | No UI |
| `/api/admin/discussions/[sessionId]/feedback` | No UI |
| `/api/admin/users/[id]/subtopics` | No UI |
| `/api/admin/research/classify` | No UI |
| `/api/admin/research/bulk` | No UI |
| `/api/test-db` | Debug only |
| `/api/test-data` | Debug only |
| `/api/debug/*` (3 routes) | Debug only |

---

## 2. Database-Code Schema Audit

### CRITICAL — Missing Columns (data will be null/broken)

**`user_progress` has 3 incompatible schema models:**
- `/api/user-progress` uses `status`, `time_spent`, `completed_at`, `module_index`, `subtopic_index`
- Discussion routes use `is_completed`, `completion_date`, `subtopic_id`
- Admin routes select `completed` (yet another variant)
- **Impact**: Conflicting writes/reads to the same table; some fields will always be null

**`transcript` admin viewer expects nonexistent columns:**
- Code selects `question`, `answer`, `subtopic`, `title` from `transcript` table
- SQL only defines: `id, user_id, course_id, subtopic_id, content, notes, created_at, updated_at`
- **Impact**: Admin transcript detail page returns null for all detail fields

**`challenge_responses` columns don't exist:**
- Code selects `challenge_type`, `subtopic_id` — neither exists in the table
- Actual columns: `module_index`, `subtopic_index`, `page_number`
- **Impact**: Admin user detail shows null for challenge data

### HIGH — Missing Columns

| Column Referenced | Actual Schema | Files Affected |
|-------------------|---------------|----------------|
| `quiz_submissions.submitted_at` | Only `created_at` exists | admin users detail, export, activity-summary |
| `jurnal.subtopic_id` | Not in schema | admin users detail |
| `ask_question_history.subtopic_id` | Uses `subtopic_label` (text) instead | admin users detail |
| `ask_question_history.prompt_classification_id` | Not in schema | admin research bulk |
| `user_progress.completion_date` | Not in schema | discussion respond |

### Unused Tables (defined in SQL but never referenced)

| Table | Notes |
|-------|-------|
| `prompt_revisions` | Research feature, never wired |
| `research_artifacts` | Research feature, never wired |
| `triangulation_records` | Research feature, never wired |

### Missing SQL Definitions

Several core tables (`users`, `courses`, `subtopics`, `quiz`, `quiz_submissions`, `jurnal`, `feedback`, `user_progress`, `ask_question_history`, `challenge_responses`, `learning_profiles`, `discussion_sessions`, `discussion_messages`, `discussion_templates`, `subtopic_cache`, `api_logs`, `course_generation_activity`) have no CREATE TABLE SQL in the repository — likely created directly in Supabase.

---

## 3. Auth & Authorization Audit

### CRITICAL — Middleware Gap

**`middleware.ts:89` admin check uses `pathname.startsWith('/admin')` which does NOT match `/api/admin/*`**
- Any authenticated regular user can access ALL admin API routes that lack their own auth guard
- This affects **18 admin activity routes** that have zero in-route auth

### CRITICAL — IDOR Vulnerabilities (6 routes)

These routes accept `userId` from the request body instead of deriving from the JWT token:

| Route | Risk |
|-------|------|
| `/api/quiz/submit` POST | User A can submit quiz as User B |
| `/api/jurnal/save` POST | User A can save journal as User B |
| `/api/transcript/save` POST | User A can save transcript as User B |
| `/api/feedback` POST | User A can submit feedback as User B |
| `/api/user-progress` POST/GET | User A can read/write progress of User B |
| `/api/generate-course` POST | User A can generate course as User B |

### HIGH — Unprotected Admin Routes (18 routes)

All `/api/admin/activity/*` routes have NO route-level auth:
`courses`, `topics`, `feedback`, `actions`, `analytics`, `ask-question`, `challenge`, `discussion`, `export`, `generate-course`, `jurnal`, `jurnal/[id]`, `quiz`, `quiz/[id]`, `search`, `transcript`, `transcript/[id]`, `learning-profile`

### HIGH — Data Exposure

| Route | Issue |
|-------|-------|
| `/api/test-data` | **No production guard** — exposes ALL users, courses, quiz, journals to any authenticated user |
| `/api/courses` GET | Fallback accepts `userId`/`userEmail` from query params, allowing listing of any user's courses |

### MEDIUM — Missing CSRF (27+ mutation endpoints)

Only 3 endpoints validate CSRF server-side: `challenge-thinking`, `challenge-feedback`, `generate-examples`. All other POST/PUT/DELETE endpoints skip CSRF validation despite frontend sending CSRF tokens.

### MEDIUM — Token Issues

| Issue | Detail |
|-------|--------|
| Access/refresh tokens use same secret, no `type` claim | Refresh token usable as access token |
| No server-side refresh token revocation | Captured refresh tokens valid until natural 7-day expiry |
| Admin login sets no CSRF token or refresh token | Admin sessions have no CSRF protection and no refresh capability |

---

## 4. Feature E2E Wiring Audit

### All 14 Core Features: WIRED

Registration, Login, Course Creation, Subtopic Viewing/Generation, Quiz, Journal, Transcript, Ask Question, Challenge Thinking, Discussion (Socratic), Admin Dashboard, Admin User Management, Feedback, Onboarding — all fully wired end-to-end.

### Issues Found

| Severity | Issue | Detail |
|----------|-------|--------|
| HIGH | Registration skips onboarding | Signup redirects to `/request-course/step1` without checking learning profile (login flow does check) |
| HIGH | Registration has no refresh token | Auto-login after signup uses `rememberMe=false`, session expires in 15 minutes |
| MEDIUM | Forgot Password is 404 | `/login` page links to `/forgot-password` which doesn't exist |
| MEDIUM | Result page is dead end | `/request-course/result` exists but is never navigated to |
| LOW | FeedbackForm component orphaned | Exists but never imported; functionality integrated into StructuredReflection |

---

## 5. Dead Code / Orphan Audit

### Entirely Unused Files (safe to delete)

| File | Reason |
|------|--------|
| `src/lib/csrf.ts` | CSRF logic duplicated in `api-middleware.ts` |
| `src/lib/validation.ts` | Superseded by Zod schemas in `schemas.ts` |
| `src/lib/api-error.ts` | `ApiError`, `handleApiError`, `ApiErrors` never imported |
| `src/types/database.ts` | Placeholder with `Json` and `Database` types, never used |

### Unused Components

| Component | Notes |
|-----------|-------|
| `src/components/FeedbackForm/FeedbackForm.tsx` | Replaced by StructuredReflection |
| `src/components/admin/CourseParameterModal.tsx` | Never imported |
| `src/components/admin/QuizResultModal.tsx` | Never imported |

### Debug Routes in Production (5)

| Route | Risk |
|-------|------|
| `/api/test-db` | Exposes DB connection status |
| `/api/test-data` | **Exposes ALL database contents** |
| `/api/debug/course-test/[id]` | Has production guard |
| `/api/debug/generate-courses` | Has production guard |
| `/api/debug/users` | Has production guard |

### Unused Exports Summary

| Category | Count |
|----------|-------|
| Unused lib exports (functions/constants) | 15 |
| Unused type exports | 38+ (mostly in `research.ts`) |
| Unused service type exports | 8 |

---

## 6. Error Handling Audit

### CRITICAL

**`/api/admin/logout` has no try/catch** — if cookie deletion throws, returns unhandled 500 with no structured body.

### HIGH

| Issue | Detail |
|-------|--------|
| Streaming errors give truncated text | `/api/ask-question` and `/api/challenge-thinking` — if OpenAI stream fails mid-way, client gets partial text with no error indication |
| `discussion/respond` calls OpenAI without timeout | Direct `openai.chat.completions.create()` call bypasses `chatCompletion` timeout protection |
| Admin login reads `data.message` not `data.error` | Error messages never displayed (also in API Contract section) |
| Quiz submission failure silently swallowed | `Quiz.tsx:123` only console.errors, no user feedback |

### MEDIUM

| Issue | Detail |
|-------|--------|
| 6 admin discussion routes return 403 for unauthenticated | Should be 401 for missing auth, 403 for wrong role |
| Error format inconsistency | Some routes use `{ success: false, error }`, others `{ error }`, others `{ message }` |
| No nested error boundaries | Only root `error.tsx` exists; admin/course sections lose all navigation on error |

### LOW

| Issue | Detail |
|-------|--------|
| Several frontend pages use `fetch()` instead of `apiFetch()` | Missing 401 auto-retry and CSRF |
| `QuestionBox` renders errors as "answers" | Error strings mixed into answer list |
| No Supabase connection timeout configured | DB queries can hang until TCP timeout |

---

## 7. RLS & Data Access Audit

### CRITICAL — Same as Auth Section

The middleware gap (`pathname.startsWith('/admin')` not matching `/api/admin/*`) means **15+ admin activity routes are accessible to any authenticated regular user**, exposing all users' quiz submissions, journals, transcripts, Q&A history, challenge responses, discussion sessions, feedback, and learning profiles.

### CRITICAL — `/api/test-data` has no production guard

Exposes all users, courses, subtopics, quiz questions, journals, and transcripts without any authentication.

### HIGH

| Issue | Detail |
|-------|--------|
| `/api/prompt-journey` GET | Any user can read another user's prompt history via `userId` query param |
| `/api/courses` GET fallback | Accepts `userId`/`userEmail` from query params when cookie auth fails |
| 5 routes use `adminDb` where `publicDb` suffices | `discussion/start`, `discussion/history`, `discussion/respond`, `discussion/start` (cache read), `discussion/module-status` for `subtopic_cache` and `discussion_templates` reads |

### MEDIUM

**RLS policies are effectively dead code** — since the app uses custom JWT (not Supabase Auth), `auth.uid()` in RLS policies never resolves. All data isolation depends entirely on application-level `user_id` filtering in API route code. If `adminDb` (service-role) is used without proper WHERE clauses, any user's data is accessible.

---

## Priority Fix Recommendations

### P0 — Fix Immediately (Security)

1. **Fix middleware admin check** — change `pathname.startsWith('/admin')` to also cover `/api/admin/` paths
2. **Add route-level auth to all 18 admin activity routes** — defense in depth
3. **Fix IDOR in 6 routes** — derive `userId` from JWT token, not request body
4. **Remove or guard `/api/test-data`** — currently exposes entire database to any authenticated user
5. **Remove `/api/generate-course/log`** — deprecated, no auth

### P1 — Fix Soon (Bugs)

6. **Fix admin login/register error field** — change `data.message` to `data.error`
7. **Fix research sessions user dropdown** — unwrap `data.users` or change API to return raw array
8. **Fix `user_progress` schema conflict** — unify the 3 incompatible models
9. **Fix transcript admin viewer** — update column references to match actual schema
10. **Fix registration flow** — add onboarding check and `rememberMe=true` for auto-login
11. **Add timeout to `discussion/respond` OpenAI call**
12. **Differentiate access/refresh tokens** — add `type` claim to JWT

### P2 — Fix When Possible (Quality)

13. **Add CSRF validation to remaining 27+ mutation endpoints**
14. **Standardize error response format** across all API routes
15. **Remove 4 dead lib files** (`csrf.ts`, `validation.ts`, `api-error.ts`, `types/database.ts`)
16. **Remove 3 unused components** and their stylesheets
17. **Add nested error boundaries** for admin and course sections
18. **Fix missing columns** in admin detail views (`challenge_type`, `subtopic_id`, `submitted_at`, etc.)

### P3 — Nice to Have (Cleanup)

19. Remove 15 orphan API routes or wire them to frontend
20. Remove 38+ unused type exports (mostly in `research.ts`)
21. Switch 5 `adminDb` reads to `publicDb` for least privilege
22. Add Supabase connection timeout configuration
23. Remove `/forgot-password` dead link from login page
24. Remove orphaned `/request-course/result` page
