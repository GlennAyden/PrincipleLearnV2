# Feature Flows

End-to-end request -> API -> service -> DB chains for every user-facing and admin feature in PrincipleLearn V3. Each flow lists the entry component, the API route, the service or library it calls, the DB tables touched, and the side effects (research evidence sync, cognitive scoring, cache writes, classification).

Conventions used below:

- Every authenticated mutating endpoint is wrapped in `withApiLogging(withProtection(handler))` ([src/lib/api-middleware.ts](../src/lib/api-middleware.ts), [src/lib/api-logger.ts](../src/lib/api-logger.ts)). CSRF + JWT + rate-limit are enforced before the handler runs and a row is written to `api_logs`.
- "Side effect (research)" means the route calls `syncResearchEvidenceItem()` and `refreshResearchSessionMetrics()` from [src/services/research-session.service.ts](../src/services/research-session.service.ts).
- "Side effect (cognitive)" means the route schedules `scoreAndSave()` from [src/services/cognitive-scoring.service.ts](../src/services/cognitive-scoring.service.ts) via `after()` so it does not block the response.

Cross-references: [admin-and-research-ops.md](./admin-and-research-ops.md), [api-reference.md](./api-reference.md), [database-and-data-model.md](./database-and-data-model.md).

---

## A. Auth Flows

### A1. Signup

```text
[/signup page] --POST /api/auth/register--> auth.service.findUserByEmail
                                          + bcrypt hash
                                          + insert into users
                                          --> response (no auto-login)
```

- Page: [src/app/signup/](../src/app/signup/)
- Route: [src/app/api/auth/register/route.ts](../src/app/api/auth/register/route.ts)
- DB: insert into `users` (role `USER`)

### A2. Login

```text
[/login page] --POST /api/auth/login-->
  rate-limit (loginRateLimiter)
  -> findUserByEmail + verifyPassword (bcrypt)
  -> generateAuthTokens (access + refresh JWT)
  -> generateCsrfToken
  -> set cookies: access_token (httpOnly), refresh_token (httpOnly, optional), csrf_token (readable by JS)
```

- Route: [src/app/api/auth/login/route.ts](../src/app/api/auth/login/route.ts)
- Service: [src/services/auth.service.ts](../src/services/auth.service.ts)
- DB: read `users`, write `users.refresh_token_hash` when `rememberMe` is true.

### A3. Refresh

```text
401 from any API --(client redirect)--> /api/auth/refresh
  -> verify refresh_token cookie
  -> compare against users.refresh_token_hash
  -> rotate: issue new access + new refresh, update hash
  -> set new cookies, redirect back
```

- Route: [src/app/api/auth/refresh/route.ts](../src/app/api/auth/refresh/route.ts)
- Old refresh token is invalidated by hash rotation.

### A4. Logout

```text
[any page] --POST /api/auth/logout--> clear access_token + refresh_token + csrf_token cookies
                                    + null users.refresh_token_hash
```

- Route: [src/app/api/auth/logout/route.ts](../src/app/api/auth/logout/route.ts)

### A5. Identity check

- `GET /api/auth/me` ([route](../src/app/api/auth/me/route.ts)) returns the authed user row for hydration on first paint. Used by [src/hooks/useAuth.tsx](../src/hooks/useAuth.tsx).

### A6. Admin auth

- Mirror of A1-A5 under `/api/admin/{login,logout,register,me}` with `role` enforced to `ADMIN`.

## B. Onboarding (Two Stages)

```text
[user logs in for first time]
  middleware checks onboarding cookies
   |
   v
/onboarding page
   --POST /api/learning-profile--> insert/update users.learning_profile (jsonb) + set cookie
   |
   v
/onboarding/intro page (slides)
   --POST /api/onboarding-state--> set onboarding_intro_done flag in users + cookie
   |
   v
/dashboard
```

- Pages: [src/app/onboarding/](../src/app/onboarding/), [src/app/onboarding/intro/](../src/app/onboarding/intro/).
- Routes: [src/app/api/learning-profile/route.ts](../src/app/api/learning-profile/route.ts), [src/app/api/onboarding-state/route.ts](../src/app/api/onboarding-state/route.ts).
- Middleware ([middleware.ts](../middleware.ts)) gates `/dashboard` until both cookies are set.
- The dedicated educational-intro cookie is required (see commit `9d772a8`).

## C. Course Generation (multi-step)

```text
/request-course/step1 --(form: topic, goal)--> RequestCourseContext
/request-course/step2 --(level, extraTopics)--> RequestCourseContext
/request-course/step3 --(problem, assumption)--> RequestCourseContext
/request-course/result page
  --POST /api/generate-course-->
     parseBody(GenerateCourseSchema)
     resolveAuthContext
     aiRateLimiter.isAllowed
     chatCompletionWithRetry  (ai.service.ts)
     parseAndValidateAIResponse(CourseOutlineResponseSchema)
     createCourseWithSubtopics  (course.service.ts)
       insert into courses
       insert into subtopics (one per module, content JSONB)
       insert into leaf_subtopics
       optional insert into subtopic_cache
     log into course_generation_activity
  --> response: courseId, redirect to /course/[courseId]
```

- Pages: [src/app/request-course/](../src/app/request-course/) (`step1`, `step2`, `step3`, `generating`, `result`).
- Context: [src/context/RequestCourseContext.tsx](../src/context/RequestCourseContext.tsx) holds the multi-step state.
- Route: [src/app/api/generate-course/route.ts](../src/app/api/generate-course/route.ts).
- Services: [src/services/course.service.ts](../src/services/course.service.ts), [src/services/ai.service.ts](../src/services/ai.service.ts).
- Tables: `courses`, `subtopics`, `leaf_subtopics`, `subtopic_cache`, `course_generation_activity`, `api_logs`.

## D. Subtopic Learning (lazy generation)

```text
/course/[courseId]/[subtopicId] page
   --GET /api/courses/[courseId]/subtopics/[id]--> read subtopics + leaf_subtopics
   |
   v
   detail content present?
      no -> --POST /api/generate-subtopic--> ai.service.chatCompletion
                                              -> insert into subtopic_cache (cache_key)
                                              -> backfill quiz rows via syncQuizQuestions
      yes -> render directly
```

- Page: [src/app/course/[courseId]/](../src/app/course/[courseId]/).
- Route: [src/app/api/generate-subtopic/route.ts](../src/app/api/generate-subtopic/route.ts).
- Helper: [src/lib/quiz-sync.ts](../src/lib/quiz-sync.ts) (`buildSubtopicCacheKey`, `syncQuizQuestions`).
- Tables: `subtopic_cache`, `quiz`, `leaf_subtopics`.

## E. Examples Generation

```text
[Examples component] --POST /api/generate-examples-->
  ai.service.chatCompletion
  -> log into example_usage_events
  --> stream/return content
```

- Route: [src/app/api/generate-examples/route.ts](../src/app/api/generate-examples/route.ts)
- Component: [src/components/Examples/](../src/components/Examples/)
- Tables: `example_usage_events`.

## F. Ask Question (streaming)

```text
[AskQuestion component] --POST /api/ask-question-->
  withProtection (CSRF + JWT)
  parseBody(AskQuestionSchema)
  aiRateLimiter
  classifyPromptStage (heuristic, RM2)
  resolveResearchLearningSession
  chatCompletionStream -> openAIStreamToReadable
   ON STREAM COMPLETE:
     follow-up detection (10 min window or 2-word answer overlap)
     insert into ask_question_history (with prompt_stage, stage_confidence, micro_markers, raw_evidence_snapshot)
     side effect (research): syncResearchEvidenceItem + refreshResearchSessionMetrics
     side effect (cognitive): scoreAndSave
  --> stream chunks back to client
```

- Route: [src/app/api/ask-question/route.ts](../src/app/api/ask-question/route.ts)
- Services: [src/services/ai.service.ts](../src/services/ai.service.ts), [src/services/prompt-classifier.ts](../src/services/prompt-classifier.ts), [src/services/research-session.service.ts](../src/services/research-session.service.ts), [src/services/cognitive-scoring.service.ts](../src/services/cognitive-scoring.service.ts).
- Tables: `ask_question_history`, `prompt_classifications`, `research_evidence_items`, `learning_sessions`, `auto_cognitive_scores`, `api_logs`.

## G. Challenge Thinking (streaming + feedback + persist)

```text
[ChallengeThinking component]
  --POST /api/challenge-thinking--> stream new challenge prompt
  user submits answer
  --POST /api/challenge-feedback--> stream feedback
  --POST /api/challenge-response--> persist to challenge_responses
                                    + side effect (research)
                                    + side effect (cognitive)
```

- Routes: [src/app/api/challenge-thinking/](../src/app/api/challenge-thinking/), [src/app/api/challenge-feedback/](../src/app/api/challenge-feedback/), [src/app/api/challenge-response/](../src/app/api/challenge-response/).
- Tables: `challenge_responses`, `research_evidence_items`, `auto_cognitive_scores`.

## H. Quiz Flow

```text
[Quiz component] --GET /api/quiz/status--> attempt state, latest score, drift detection
                  --POST /api/quiz/submit-->
                     assertCourseOwnership
                     resolveModuleContext
                     loadQuizQuestions (with lazy seed from subtopic_cache via syncQuizQuestions)
                     buildAuthoritativeQuiz (compare client answers against DB rows + cache)
                     reject if QUIZ_QUESTIONS_DRIFTED
                     resolveResearchLearningSession
                     adminDb.rpc('insert_quiz_attempt') with legacy fallback
                     update quiz_submissions research metadata
                     side effect (research): syncResearchEvidenceItem
                     markSubtopicQuizCompletion (writes completion JSON into subtopic_cache.content)
                     markUserProgressCompleted (upsert user_progress)
                     side effect (cognitive): scoreAndSave (after())
                  --POST /api/quiz/regenerate--> chatCompletion -> appendNewQuizQuestions -> mergeSubtopicCacheContent
```

- Route: [src/app/api/quiz/submit/route.ts](../src/app/api/quiz/submit/route.ts), [src/app/api/quiz/regenerate/route.ts](../src/app/api/quiz/regenerate/route.ts), [src/app/api/quiz/status/route.ts](../src/app/api/quiz/status/route.ts).
- Helpers: [src/lib/quiz-sync.ts](../src/lib/quiz-sync.ts), [src/lib/quiz-content.ts](../src/lib/quiz-content.ts), [src/lib/leaf-subtopics.ts](../src/lib/leaf-subtopics.ts), [src/lib/ownership.ts](../src/lib/ownership.ts).
- Tables: `quiz`, `quiz_submissions`, `subtopic_cache`, `user_progress`, `leaf_subtopics`, `research_evidence_items`, `learning_sessions`, `auto_cognitive_scores`.

## I. Reflection (Jurnal)

```text
[Refleksi UI] --GET /api/jurnal/status--> reflection-status helper
              --POST /api/jurnal/save-->
                 resolveAuthUserId
                 parseBody(JurnalSchema)
                 verify course ownership
                 normalize structured fields (understood, confused, strategy, promptEvolution, contentRating, contentFeedback)
                 buildReflectionContext
                 resolveResearchLearningSession
                 insert into jurnal (with raw_evidence_snapshot + coding_status)
                 side effect (research): syncResearchEvidenceItem (rmFocus = RM2_RM3)
                 if structured + rating/comment present:
                    persistFeedbackMirror -> insert/dedupe into feedback (origin_jurnal_id link)
                 side effect (cognitive): scoreAndSave (after())
```

- Route: [src/app/api/jurnal/save/route.ts](../src/app/api/jurnal/save/route.ts), [src/app/api/jurnal/status/route.ts](../src/app/api/jurnal/status/route.ts).
- Helpers: [src/lib/reflection-submission.ts](../src/lib/reflection-submission.ts), [src/lib/reflection-status.ts](../src/lib/reflection-status.ts), [src/lib/admin-reflection-summary.ts](../src/lib/admin-reflection-summary.ts).
- Tables: `jurnal`, `feedback` (mirrored), `research_evidence_items`, `auto_cognitive_scores`.
- Note: `jurnal` is the canonical write-path. `feedback` is now a mirror keyed by `origin_jurnal_id`. The admin reflection surface reads `jurnal + feedback` as one domain.

## J. Learning Progress

```text
[course shell] --GET /api/learning-progress?courseId=...--> joins user_progress + leaf_subtopics
[dashboard] --GET /api/user-progress--> per-course rollup
quiz submit -> markUserProgressCompleted writes user_progress.completed_at
```

- Routes: [src/app/api/learning-progress/route.ts](../src/app/api/learning-progress/route.ts), [src/app/api/user-progress/route.ts](../src/app/api/user-progress/route.ts).
- Helper: [src/lib/learning-progress.ts](../src/lib/learning-progress.ts).
- Tables: `user_progress`, `leaf_subtopics`, `subtopics`.

## K. Prompt Journey And Timeline

```text
[Prompt Journey UI] --GET /api/prompt-journey?courseId=...-->
   verifyToken (admins may pass userId)
   read ask_question_history rows (joined classification fields)
   normalize prompt_components JSON
   --> timeline payload
```

- Route: [src/app/api/prompt-journey/route.ts](../src/app/api/prompt-journey/route.ts).
- Source data: `ask_question_history` rows already carry `prompt_stage`, `stage_confidence`, `micro_markers` thanks to flow F.
- No additional classifier call here — read-only over data already classified at capture time.

## L. Discussion (Experimental — not in active thesis use)

```text
/api/discussion/prepare    -> returns module readiness payload
/api/discussion/start      -> insert discussion_sessions + opening assistant message into discussion_messages
/api/discussion/respond    -> openai.chat -> append to discussion_messages
                              + insert into discussion_assessments
                              + side effect (research): syncResearchEvidenceItem
/api/discussion/history    -> read discussion_messages
/api/discussion/status     -> per-session status
/api/discussion/module-status -> per-module unlock state via discussion-prerequisites helper
```

- Routes: [src/app/api/discussion/](../src/app/api/discussion/).
- Helpers: [src/lib/discussion/](../src/lib/discussion/), [src/lib/discussion-prerequisites.ts](../src/lib/discussion-prerequisites.ts).
- Tables: `discussion_sessions`, `discussion_messages`, `discussion_assessments`.
- Status: code path is intact and writes research evidence, but the module is not part of the active thesis instrument.

## M. Admin Activity Drill

```text
[admin/aktivitas page] tab switch
  --GET /api/admin/activity/{module}--> joined query (user + course + module-specific table)
  click row
  --opens modal with row detail (no extra fetch for most modules)
  optionally --GET /api/admin/activity/{module}?id=--> single record
```

- Page: [src/app/admin/aktivitas/page.tsx](../src/app/admin/aktivitas/page.tsx).
- Routes: [src/app/api/admin/activity/](../src/app/api/admin/activity/) (16 sub-routes, see admin-and-research-ops.md section 2).
- Helper queries: [src/lib/admin-queries.ts](../src/lib/admin-queries.ts), [src/lib/admin-reflection-activity.ts](../src/lib/admin-reflection-activity.ts), [src/lib/admin-quiz-attempts.ts](../src/lib/admin-quiz-attempts.ts), [src/lib/admin-prompt-stage.ts](../src/lib/admin-prompt-stage.ts).

## N. Research Pipeline (admin-triggered)

```text
[admin/riset/* pages]
  bukti      -> GET /api/admin/research/evidence
  kognitif   -> GET /api/admin/research/auto-scores (+ /summary)
  prompt     -> GET /api/admin/research/classifications
  readiness  -> GET /api/admin/research/readiness
  triangulasi-> GET /api/admin/research/triangulation

[admin manual triggers]
  POST /api/admin/research/auto-code  -> runResearchAutoCoder
       writes research_auto_coding_runs + updates research_evidence_items + triangulation_records
  POST /api/admin/research/reconcile  -> runResearchDataReconciliation
       backfills learning_session_id + data_collection_week
  POST /api/admin/research/classify   -> openai gpt-4o-mini suggestion for one prompt
  POST /api/admin/research/bulk       -> mass review/code actions on evidence rows
  GET  /api/admin/research/export     -> CSV / JSON / SPSS shape
```

- Routes: [src/app/api/admin/research/](../src/app/api/admin/research/).
- Services: [src/services/research-auto-coder.service.ts](../src/services/research-auto-coder.service.ts), [src/services/research-data-reconciliation.service.ts](../src/services/research-data-reconciliation.service.ts), [src/services/research-field-readiness.service.ts](../src/services/research-field-readiness.service.ts).
- Capture happens automatically inside flows F, G, H, I, L. Admin triggers only run the deferred coding + triangulation passes.

## O. Rate Limiting

```text
incoming request -> route handler calls aiRateLimiter.isAllowed(key) or loginRateLimiter.isAllowed(key)
  in-memory + DB-backed table rate_limits
  exceeded -> return 429
  expired rows -> cleaned periodically
```

- Helper: [src/lib/rate-limit.ts](../src/lib/rate-limit.ts).
- Buckets used: `aiRateLimiter` (`generate-course`, `generate-subtopic`, `generate-examples`, `ask-question`, `challenge-thinking`, `quiz/regenerate`, `discussion/respond`), `loginRateLimiter` (`/api/auth/login`).

## P. CSRF Double-Submit

```text
login response -> set csrf_token cookie (httpOnly: false)
client apiFetch -> read cookie -> attach as x-csrf-token header
withProtection on POST/PUT/DELETE -> compare cookie vs header
  mismatch or missing -> 403
GET requests skip CSRF check
```

- Helpers: [src/lib/api-client.ts](../src/lib/api-client.ts) (`apiFetch`), [src/lib/csrf.ts](../src/lib/csrf.ts), [src/lib/api-middleware.ts](../src/lib/api-middleware.ts).

## Q. Feedback Direct Path (Compatibility)

```text
[Feedback widget] --POST /api/feedback--> insert into feedback (no origin_jurnal_id)
```

- Route: [src/app/api/feedback/](../src/app/api/feedback/) (if present in your build).
- Marked compatibility — the structured reflection path in flow I is the primary writer.

---

## Side-Effect Matrix

| User flow | research evidence | cognitive score | classifier | quiz cache | progress |
|-----------|-------------------|-----------------|------------|------------|----------|
| Generate course (C) | no | no | no | no | no |
| Subtopic detail (D) | no | no | no | yes (cache + quiz seed) | no |
| Examples (E) | no | no | no | no | no |
| Ask question (F) | yes | yes | yes (heuristic) | no | no |
| Challenge (G) | yes | yes | no | no | no |
| Quiz submit (H) | yes | yes | no | yes (completion JSON) | yes |
| Reflection (I) | yes | yes (structured only) | no | no | no |
| Discussion respond (L, experimental) | yes | no | no | no | no |

## Failure-Mode Quick Reference

- Stream completes but evidence/cognitive sync fails -> a row appears in `api_logs` with `label IN ('cognitive-scoring-failed','feedback-dual-write-failed','ask-question-history-save-failed')`. Check via `GET /api/admin/monitoring/logging`.
- Quiz drift on submit -> 409 `QUIZ_QUESTIONS_DRIFTED`; user must reload or pick "Kuis Baru".
- CSRF missing -> 403 `CSRF token missing` or `Invalid CSRF token`. Re-login refreshes the cookie.
- Auth expired on `apiFetch` -> automatic single retry through `/api/auth/refresh`, then bubbles up as 401.
