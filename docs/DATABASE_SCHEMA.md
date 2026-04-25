# PrincipleLearn V3 - Database Schema Documentation

> **Database Engine:** Supabase PostgreSQL with Row-Level Security (RLS)
> **Project ID:** `wesgoqdldgjbwgmubfdm`
> **Tables:** 34 (in `public` schema)
> **Views:** 4
> **Functions:** 10 (incl. triggers and event triggers)
> **Last Updated:** 2026-04-26

This is the single source of truth for the database schema. The previous companion file [`database-and-data-model.md`](./database-and-data-model.md) is now a pointer to this document.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Connection Model and Auth Bridge](#2-connection-model-and-auth-bridge)
3. [Naming and Audit Conventions](#3-naming-and-audit-conventions)
4. [Table Reference](#4-table-reference)
   - 4.1 [Identity and Profile](#41-identity-and-profile)
   - 4.2 [Course Content](#42-course-content)
   - 4.3 [Learning Activity](#43-learning-activity)
   - 4.4 [Discussion](#44-discussion)
   - 4.5 [Research and RM2/RM3 Pipeline](#45-research-and-rm2rm3-pipeline)
   - 4.6 [Infrastructure](#46-infrastructure)
5. [Row-Level Security (RLS) Summary](#5-row-level-security-rls-summary)
6. [Functions and Triggers](#6-functions-and-triggers)
7. [Views](#7-views)
8. [JSONB Column Map](#8-jsonb-column-map)
9. [Foreign Key Map](#9-foreign-key-map)
10. [Empty / Reserved Tables](#10-empty--reserved-tables)
11. [Research Pipeline Status (RM2/RM3)](#11-research-pipeline-status-rm2rm3)
12. [Migration History](#12-migration-history)
13. [Cross-References](#13-cross-references)

---

## 1. Overview

PrincipleLearn V3 uses Supabase Postgres for all persistent state. The schema spans six logical domains:

| Domain | Tables | Purpose |
|---|---|---|
| Identity and profile | 2 | Users and learning preferences |
| Course content | 4 | Course outline, content, leaf-level navigation, AI cache |
| Learning activity | 10 | Quizzes, journals, transcripts, challenges, Q&A, progress, examples |
| Discussion | 5 | Guided discussion sessions, messages, templates, assessments, audit |
| Research / RM2-RM3 | 10 | Prompt classification, cognitive scoring, evidence ledger, triangulation |
| Infrastructure | 3 | API logs, rate limits, course generation activity |

Live row counts (snapshot 2026-04-26) are noted on each table.

---

## 2. Connection Model and Auth Bridge

Defined in [`src/lib/database.ts`](../src/lib/database.ts).

| Client | Key | RLS Behaviour | Primary Use |
|---|---|---|---|
| `adminDb` | `SUPABASE_SERVICE_ROLE_KEY` | bypassed | All writes, all per-user reads, admin queries, research operations |
| `publicDb` | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | enforced | Reads of `discussion_templates` and `subtopic_cache` only |

**Auth bridge.** PrincipleLearn does not use Supabase Auth. Authentication is custom JWT (see `src/services/auth.service.ts`, `src/lib/jwt.ts`). The identity reaches API routes via three middleware-injected headers:

- `x-user-id`
- `x-user-email`
- `x-user-role`

Because `auth.uid()` returns NULL for our requests, RLS is **defence-in-depth, not the primary access control**. Layer 1 (mandatory) is application logic that filters by `x-user-id` before issuing queries through `adminDb`. Layer 2 (RLS) only takes effect for `publicDb` reads or if the anon key is ever used directly from the browser.

---

## 3. Naming and Audit Conventions

- **Indonesian column/table names are intentional.** `jurnal` (journal), `riset` (research), and similar Bahasa Indonesia spellings are part of the domain vocabulary and must not be renamed.
- **Timestamps.** `created_at` and `updated_at` (`timestamptz`, default `now()`) on virtually every table. `set_updated_at_timestamp` trigger maintains `updated_at`.
- **Soft delete.** `users.deleted_at` (`timestamptz`, nullable) is the soft-delete marker. Active users index: `idx_users_active ... WHERE deleted_at IS NULL`. Do not hard-delete the admin or `sal@expandly.id` rows during migrations.
- **Research audit columns.** Most learning-activity tables carry a uniform research-audit triplet:
  - `research_validity_status` (default `valid`)
  - `coding_status` (default `uncoded`)
  - `researcher_notes` (free text)
  - `data_collection_week` (varchar)
  - `raw_evidence_snapshot` (jsonb, default `{}`)
- **Generated columns.** `cognitive_indicators.ct_total_score`, `cognitive_indicators.cth_total_score`, `auto_cognitive_scores.ct_total_score` / `cth_total_score`, and `research_artifacts.total_artifact_score` are PostgreSQL `GENERATED ALWAYS AS (...)` columns and cannot be written to directly.
- **Polymorphic references.** `prompt_classifications`, `auto_cognitive_scores`, `research_evidence_items`, and `triangulation_records` use a `(source_type, source_id)` (or `prompt_source, prompt_id`) discriminator pattern that crosses table boundaries without an enforced FK. Application code must keep these consistent.

---

## 4. Table Reference

### 4.1 Identity and Profile

#### 4.1.1 `users` (29 rows)

Central identity table for both students and admins. Authentication, role, and refresh-token state live here.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, default `gen_random_uuid()` |
| `email` | text | UNIQUE, login credential |
| `name` | text | nullable |
| `password_hash` | text | bcrypt hash; written by `auth.service.ts` |
| `role` | text | default `user`; CHECK `lower(role) IN ('user','admin')` |
| `refresh_token_hash` | text | nullable; rotated on each refresh |
| `onboarding_completed` | boolean | default `false` |
| `deleted_at` | timestamptz | soft-delete marker |
| `created_at`, `updated_at` | timestamptz | default `now()` |

- **PK:** `users_pkey (id)`
- **Unique:** `users_email_key (email)`
- **Indexes:** `idx_users_active (created_at DESC) WHERE deleted_at IS NULL`, `users_pending_onboarding_idx (id) WHERE onboarding_completed = false`
- **RLS:** `users_read_own` (SELECT, `id = auth.uid()`), `service_role_full_access`
- **Zod:** [`LoginSchema`, `RegisterSchema`, `AdminRegisterSchema`](../src/lib/schemas.ts)

#### 4.1.2 `learning_profiles` (6 rows)

Optional per-user learning preferences captured during onboarding.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | UNIQUE, FK -> `users(id)` ON DELETE CASCADE |
| `display_name` | varchar | |
| `programming_experience` | varchar | |
| `learning_style` | varchar | |
| `learning_goals` | text | default `''` |
| `challenges` | text | default `''` |
| `intro_slides_completed` | boolean | default `false` |
| `course_tour_completed` | boolean | default `false` |
| `created_at`, `updated_at` | timestamptz | default `now()` |

- **PK:** `learning_profiles_pkey (id)`; **Unique:** `(user_id)`
- **RLS:** `learning_profiles_own` (`user_id = auth.uid()`), `service_role_full_access`
- **Zod:** [`LearningProfileSchema`, `OnboardingStateSchema`](../src/lib/schemas.ts)

---

### 4.2 Course Content

#### 4.2.1 `courses` (33 rows)

Course metadata. One owner per course.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `title` | text | |
| `description`, `subject`, `difficulty_level` | text | nullable |
| `estimated_duration` | integer | minutes, nullable |
| `created_by` | uuid | FK -> `users(id)` ON DELETE SET NULL |
| `created_at`, `updated_at` | timestamptz | |

- **Indexes:** `idx_courses_created_by`
- **RLS:** `courses_read_own`, `courses_insert_own`, `courses_delete_own` (all keyed on `created_by = auth.uid()`); `service_role_full_access`
- **Zod:** [`GenerateCourseSchema`](../src/lib/schemas.ts)

#### 4.2.2 `subtopics` (157 rows)

Module-level course content. JSONB `content` stores the AI-generated structured payload.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `title` | text | |
| `content` | jsonb | nullable |
| `order_index` | integer | default `0` |
| `created_at`, `updated_at` | timestamptz | |

- **Indexes:** `idx_subtopics_course_id`
- **RLS:** `subtopics_read_own_course` (joins `courses.created_by = auth.uid()`), `service_role_full_access`

#### 4.2.3 `leaf_subtopics` (106 rows)

Atomic learning units (the smallest unit of progress). Each module (`subtopics` row) owns multiple leaves. Leaf identity is `(course_id, module_id, normalized_title)`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `module_id` | uuid | FK -> `subtopics(id)` ON DELETE CASCADE |
| `module_title` | text | denormalized |
| `title` | text | CHECK non-empty |
| `normalized_title` | text | CHECK non-empty; used for dedupe |
| `module_index`, `subtopic_index` | integer | nullable, must be >= 0 |
| `created_at`, `updated_at` | timestamptz | |

- **Unique:** `leaf_subtopics_course_module_title_key (course_id, module_id, normalized_title)`
- **Indexes:** `idx_leaf_subtopics_course_module`, `idx_leaf_subtopics_module_id`
- **RLS:** `leaf_subtopics_service_role_all` only (no per-user policy; access via `adminDb` only)
- **RPC:** `ensure_leaf_subtopic(course_id, module_id, ...)` and `normalize_leaf_subtopic_title(text)` keep this table in sync with quiz / progress writes.

#### 4.2.4 `subtopic_cache` (109 rows)

Caches generated subtopic content keyed by `cache_key` to avoid redundant AI calls.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `cache_key` | text | UNIQUE |
| `content` | jsonb | nullable |
| `created_at`, `updated_at` | timestamptz | |

- **Indexes:** `idx_subtopic_cache_key`, `subtopic_cache_cache_key_key`
- **RLS:** `subtopic_cache_read` (SELECT to `authenticated`, `USING (true)`); `service_role_full_access`
- Note: production schema differs from older docs; there is no `course_id`, `generated_at`, or `expires_at` column.

---

### 4.3 Learning Activity

#### 4.3.1 `quiz` (685 rows)

Multiple-choice quiz items, scoped to a course/module/leaf.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `subtopic_id` | uuid | FK -> `subtopics(id)` ON DELETE CASCADE |
| `question` | text | |
| `options` | jsonb | array of `{text, isCorrect}` |
| `correct_answer`, `explanation` | text | nullable |
| `subtopic_label` | text | leaf title; CHECK non-empty when set |
| `leaf_subtopic_id` | uuid | FK -> `leaf_subtopics(id)` ON DELETE SET NULL |
| `created_at` | timestamptz | |

- **Indexes:** `idx_quiz_course_id`, `idx_quiz_subtopic_id`, `idx_quiz_subtopic_label`, `idx_quiz_leaf_subtopic_created_at`, `idx_quiz_scope_created_at`
- **RLS:** `quiz_read_own_course` (joins `courses.created_by`), `service_role_full_access`

#### 4.3.2 `quiz_submissions` (255 rows)

Per-question student answers, grouped into a 5-question attempt by `quiz_attempt_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `quiz_id` | uuid | FK -> `quiz(id)` ON DELETE CASCADE |
| `course_id`, `subtopic_id` | uuid | FK, nullable |
| `answer` | text | |
| `is_correct` | boolean | |
| `reasoning_note` | text | nullable |
| `module_index`, `subtopic_index` | integer | nullable, >= 0 |
| `attempt_number` | integer | default `1`, CHECK >= 1 |
| `quiz_attempt_id` | uuid | default `gen_random_uuid()`; groups one attempt |
| `subtopic_label` | text | nullable |
| `leaf_subtopic_id` | uuid | FK -> `leaf_subtopics(id)` ON DELETE SET NULL |
| `learning_session_id` | uuid | FK -> `learning_sessions(id)` ON DELETE SET NULL |
| Research audit triplet | | `research_validity_status`, `coding_status`, `researcher_notes`, `raw_evidence_snapshot`, `data_collection_week` |
| `created_at` | timestamptz | |

- **Unique:** `idx_quiz_submissions_attempt_question_unique (quiz_attempt_id, quiz_id)` -- one row per question per attempt
- **Indexes:** 11 covering attempt, leaf-subtopic, learning-session, course/subtopic combinations
- **RLS:** `quiz_submissions_own`, `service_role_full_access`
- **RPC:** `insert_quiz_attempt(...)` writes a five-row attempt atomically.
- **Zod:** [`QuizSubmitSchema`](../src/lib/schemas.ts)

#### 4.3.3 `jurnal` (43 rows)

Student reflective journal entries. Bahasa Indonesia name is intentional. History-based: each submit creates a new row.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `subtopic_id` | uuid | FK -> `subtopics(id)` ON DELETE SET NULL |
| `content`, `reflection` | text | nullable |
| `type` | varchar | default `free_text` (`structured_reflection` for new flow) |
| `module_index`, `subtopic_index` | integer | nullable |
| `subtopic_label` | text | nullable |
| `learning_session_id` | uuid | FK -> `learning_sessions(id)` ON DELETE SET NULL |
| Research audit triplet | | as above |
| `created_at`, `updated_at` | timestamptz | |

- **Indexes:** 7 (incl. `idx_jurnal_user_course_subtopic_created_at`, `idx_jurnal_learning_session`)
- **Note:** legacy unique constraint on `(user_id, course_id)` was dropped (`drop_legacy_jurnal_user_course_unique.sql`) so every submit creates history.
- **RLS:** `jurnal_own`, `service_role_full_access`
- **Zod:** [`JurnalSchema`](../src/lib/schemas.ts)

#### 4.3.4 `transcript` (0 rows)

Per-subtopic course notes / transcripts.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | NOT NULL, FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | NOT NULL, FK -> `courses(id)` ON DELETE CASCADE |
| `subtopic_id` | uuid | nullable, FK -> `subtopics(id)` ON DELETE SET NULL |
| `content`, `notes` | text | |
| `created_at`, `updated_at` | timestamptz | |

- **Unique:** `transcript_user_course_subtopic_unique (user_id, course_id, subtopic_id)`
- **Indexes:** `idx_transcript_user_id`, `idx_transcript_course_id`, `idx_transcript_subtopic_id`, `idx_transcript_created_at`
- **RLS:** `transcript_own`, `service_role_full_access`

#### 4.3.5 `transcript_integrity_quarantine` (5 rows)

Non-destructive audit ledger for transcript rows whose foreign keys do not currently resolve.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `source_table` | text | default `transcript` |
| `source_id` | uuid | |
| `quarantine_reason` | text[] | CHECK non-empty |
| `row_data` | jsonb | snapshot of the offending row |
| `detected_at`, `resolved_at` | timestamptz | |
| `resolution_notes` | text | nullable |
| `created_at`, `updated_at` | timestamptz | |

- **Unique:** `(source_table, source_id)`
- **Indexes:** `idx_transcript_integrity_quarantine_detected`, partial index for unresolved
- **RLS:** `service_role_full_access` only
- **View:** `v_transcript_integrity_audit` aggregates findings.

#### 4.3.6 `feedback` (40 rows)

Numeric rating + comment. Mirror rows from structured reflections link back via `origin_jurnal_id`.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `subtopic_id` | uuid | FK -> `subtopics(id)` ON DELETE SET NULL |
| `module_index`, `subtopic_index` | integer | nullable |
| `subtopic_label` | text | nullable |
| `rating` | integer | nullable, CHECK 1..5 |
| `comment` | text | default `''` |
| `origin_jurnal_id` | uuid | FK -> `jurnal(id)` ON DELETE SET NULL |
| `created_at` | timestamptz | |

- **Unique:** `idx_feedback_origin_jurnal_unique (origin_jurnal_id) WHERE origin_jurnal_id IS NOT NULL` -- one mirror per `jurnal` row
- **Indexes:** 7 incl. course-scope and rating partial index
- **RLS:** `feedback_own`, `service_role_full_access`
- **Zod:** [`FeedbackSchema`](../src/lib/schemas.ts)

#### 4.3.7 `ask_question_history` (17 rows)

Q&A interaction log between student and AI, including follow-ups and prompt classification context.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `module_index`, `subtopic_index`, `page_number` | integer | nullable, default `0` |
| `subtopic_label` | varchar | nullable |
| `question`, `answer`, `reasoning_note` | text | |
| `prompt_components` | jsonb | nullable |
| `prompt_version`, `session_number` | integer | nullable, default `1` |
| `learning_session_id` | uuid | FK -> `learning_sessions(id)` ON DELETE SET NULL |
| `is_follow_up` | boolean | default `false` |
| `follow_up_of` | uuid | self-FK -> `ask_question_history(id)` |
| `response_time_ms` | integer | nullable |
| `prompt_stage`, `stage_confidence`, `micro_markers` | text/real/jsonb | optional auto-classification |
| Research audit triplet | | as above |
| `research_synced_at` | timestamptz | when the row was projected into the evidence ledger |
| `created_at`, `updated_at` | timestamptz | |

- **Indexes:** 8 (course, learning-session, prompt-stage, follow-up partial)
- **RLS:** `ask_question_history_own`, `service_role_full_access`
- **Zod:** [`AskQuestionSchema`](../src/lib/schemas.ts)

#### 4.3.8 `challenge_responses` (15 rows)

Critical-thinking challenge answers and AI feedback.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK (no default; client-generated UUID) |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `module_index`, `subtopic_index`, `page_number` | integer | nullable, default `0` |
| `question`, `answer` | text | |
| `feedback`, `reasoning_note` | text | nullable |
| `learning_session_id` | uuid | FK -> `learning_sessions(id)` ON DELETE SET NULL |
| Research audit triplet | | as above |
| `created_at`, `updated_at` | timestamptz | |

- **Indexes:** 6 incl. learning-session, coding-status partial
- **RLS:** `challenge_responses_own`, `service_role_full_access`
- **Note:** `user_id` is now a real `uuid` (the prior text-vs-uuid issue documented in older revisions has been resolved).
- **Zod:** [`ChallengeResponseSchema`, `ChallengeThinkingSchema`, `ChallengeFeedbackSchema`](../src/lib/schemas.ts)

#### 4.3.9 `user_progress` (13 rows)

Per-user, per-leaf completion tracking.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `subtopic_id` | uuid | FK -> `subtopics(id)` ON DELETE CASCADE |
| `leaf_subtopic_id` | uuid | nullable, FK -> `leaf_subtopics(id)` ON DELETE SET NULL |
| `is_completed` | boolean | default `false` |
| `completed_at` | timestamptz | nullable |
| `created_at`, `updated_at` | timestamptz | |

- **Unique:** `(user_id, course_id, subtopic_id)`
- **Indexes:** `idx_user_progress_leaf_subtopic`, plus per-FK indexes
- **Comment on table:** "Access enforced at application layer via custom JWT (x-user-id header) + adminDb (service_role). Supabase auth.uid() is not used."
- **RLS:** `user_progress_own` (legacy `auth.uid()`), `service_role_full_access`
- **Zod:** [`UserProgressUpsertSchema`](../src/lib/schemas.ts)

#### 4.3.10 `example_usage_events` (18 rows)

Telemetry of when AI-generated examples were displayed/used on a subtopic.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | nullable, FK -> `courses(id)` ON DELETE SET NULL |
| `learning_session_id` | uuid | FK -> `learning_sessions(id)` ON DELETE SET NULL |
| `module_index`, `subtopic_index`, `page_number` | integer | default `0` |
| `subtopic_label` | text | nullable |
| `context_hash` | text | de-dupe key |
| `context_length`, `examples_count` | integer | CHECK `examples_count > 0` |
| `usage_scope` | text | default `used_on_subtopic` |
| `raw_evidence_snapshot` | jsonb | default `{}` |
| `data_collection_week` | varchar | |
| `created_at`, `updated_at` | timestamptz | |

- **Indexes:** `idx_example_usage_events_user_created`, `idx_example_usage_events_course_scope`, `idx_example_usage_events_session`
- **RLS:** `service_role_full_access` only

---

### 4.4 Discussion

#### 4.4.1 `discussion_sessions` (5 rows)

One row per active or completed guided discussion. UNIQUE indexes prevent duplicate sessions per user/course/subtopic (one for `subtopic_id IS NULL`, one for `subtopic_id IS NOT NULL`).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `subtopic_id` | uuid | FK -> `subtopics(id)` ON DELETE CASCADE |
| `template_id` | uuid | FK -> `discussion_templates(id)` ON DELETE SET NULL |
| `status` | text | default `in_progress` |
| `phase` | text | nullable |
| `learning_goals` | jsonb | objectives + proximity state |
| `completed_at`, `completion_reason`, `completion_summary` | timestamptz / text / jsonb | finalisation metadata |
| `learning_session_id` | uuid | FK -> `learning_sessions(id)` ON DELETE SET NULL |
| Research audit columns | | `research_validity_status`, `coding_status`, `researcher_notes`, `data_collection_week` |
| `created_at`, `updated_at` | timestamptz | |

- **RLS:** `discussion_sessions_own`, `service_role_full_access`

#### 4.4.2 `discussion_messages` (157 rows)

All messages in a discussion (agent and student). Self-FK supports prompt revision tracking.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | FK -> `discussion_sessions(id)` ON DELETE CASCADE |
| `role` | text | `agent` / `student` |
| `content` | text | |
| `step_key` | text | nullable |
| `metadata` | jsonb | nullable |
| `learning_session_id` | uuid | FK -> `learning_sessions(id)` ON DELETE SET NULL |
| `is_prompt_revision` | boolean | default `false` |
| `revision_of_message_id` | uuid | self-FK -> `discussion_messages(id)` |
| Research audit columns | | as above, plus `raw_evidence_snapshot`, `data_collection_week` |
| `created_at` | timestamptz | |

- **Indexes:** 6 (session, learning-session, revision, coding-status, ordered scan)
- **RLS:** `discussion_messages_own_session` (joins parent session), `service_role_full_access`

#### 4.4.3 `discussion_templates` (59 rows)

Pre-generated templates the discussion engine starts a session from. Mixed runtime + research provenance:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `subtopic_id` | uuid | FK -> `subtopics(id)` ON DELETE CASCADE |
| `version` | text | nullable |
| `source` | jsonb | research provenance: `source.generation = { mode, scope, trigger, provider, model, promptVersion, attempts, status, generatedAt }` |
| `template` | jsonb | flow steps |
| `generated_by` | text | runtime marker: `auto`, `auto-module`, `preparation-status` |
| `created_at` | timestamptz | |

- **Runtime gating:** valid templates have `generated_by IN ('auto','auto-module')` AND (`source.generation.status` missing OR `'ready'`). `preparation-status` rows are scratch state (`queued`/`running`/`failed`/`superseded`) and must not seed a session.
- **RLS:** `discussion_templates_read` (SELECT to `authenticated`, `USING (true)`), `service_role_full_access`

#### 4.4.4 `discussion_assessments` (45 rows)

Normalised research read-model: one row per (student message, learning goal). Comment on table: "Research read-model for each student discussion answer assessed against each learning goal."

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | FK -> `discussion_sessions(id)` ON DELETE CASCADE |
| `student_message_id` | uuid | FK -> `discussion_messages(id)` ON DELETE CASCADE |
| `prompt_message_id` | uuid | FK -> `discussion_messages(id)` ON DELETE SET NULL |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `subtopic_id` | uuid | FK -> `subtopics(id)` ON DELETE SET NULL |
| `step_key`, `phase` | text | nullable |
| `goal_id`, `goal_description` | text | |
| `assessment_status` | text | CHECK `met / near / weak / off_topic / unassessable` |
| `proximity_score` | integer | CHECK 0..100 |
| `passed` | boolean | default `false` |
| `attempt_number` | integer | default `1`, CHECK >= 1 |
| `remediation_round` | integer | nullable, >= 1 |
| `quality_flag` | text | default `adequate`; CHECK `adequate / low_effort / off_topic` |
| `evaluator` | text | CHECK `mcq / llm / fallback` |
| `model`, `evaluation_version`, `coach_feedback`, `ideal_answer`, `scaffold_action`, `evidence_excerpt` | text | |
| `advance_allowed` | boolean | default `false` |
| `assessment_raw` | jsonb | nullable; raw evaluator payload |
| `created_at` | timestamptz | |

- **Unique:** `discussion_assessments_student_goal_unique (student_message_id, goal_id)`
- **Indexes:** 6
- **RLS:** `Service role full access to discussion_assessments` only

#### 4.4.5 `discussion_admin_actions` (0 rows)

Audit log for admin moderation events on discussion sessions. Listed in `OPTIONAL_SUPABASE_TABLES`; the application tolerates its absence (PostgREST `PGRST205` is suppressed).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `session_id` | uuid | FK -> `discussion_sessions(id)` ON DELETE CASCADE |
| `admin_id`, `admin_email`, `action` | text | |
| `payload` | jsonb | nullable |
| `created_at` | timestamptz | |

- **Indexes:** `idx_discussion_admin_actions_session_created`, `idx_discussion_admin_actions_created`
- **RLS:** `service_role_full_access` only
- **Status:** Empty in production. Discussion module is out of admin scope (per project memory) so this remains untouched.

---

### 4.5 Research and RM2/RM3 Pipeline

#### 4.5.1 `learning_sessions` (22 rows)

Central research unit of analysis. Comment: "Tracking sesi pembelajaran longitudinal per siswa untuk analisis perkembangan prompt (Bab 3)."

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `session_number` | integer | UNIQUE within `(user_id, course_id)` |
| `session_date` | date | |
| `session_start`, `session_end` | timestamptz | nullable |
| `total_prompts`, `total_revisions` | integer | default `0` |
| `dominant_stage` | varchar | `SCP` / `SRP` / `MQP` / `REFLECTIVE` |
| `dominant_stage_score` | integer | 1..4 |
| `avg_cognitive_depth`, `avg_ct_score`, `avg_cth_score` | numeric | nullable |
| `stage_transition` | integer | -3..+3 |
| `transition_status` | varchar | nullable |
| `is_valid_for_analysis` | boolean | default `true` |
| `validity_note`, `researcher_notes`, `topic_focus` | text | |
| `duration_minutes` | integer | |
| `status` | varchar | default `active` |
| `data_collection_week` | varchar | |
| `evidence_summary` | jsonb | default `{}` |
| `raw_event_count`, `coded_event_count`, `artifact_count`, `triangulation_count` | integer | default `0` |
| `readiness_status` | varchar | default `perlu_data` |
| `readiness_score` | numeric | default `0` |
| `last_research_sync_at` | timestamptz | nullable |
| `created_at`, `updated_at` | timestamptz | |

- **Unique:** `(user_id, course_id, session_number)`
- **Indexes:** 6 incl. `idx_learning_sessions_readiness_status`, `idx_learning_sessions_sync`
- **RLS:** `learning_sessions_own`, `service_role_full_access`
- **Helpers:** `update_session_metrics(p_session_id)`, `refresh_learning_session_research_metrics(p_session_id)`, `calculate_stage_transition(p_user_id, p_course_id)`.

#### 4.5.2 `prompt_classifications` (143 rows)

Per-prompt research coding (RM2). Comment: "Klasifikasi tahap prompt: SCP, SRP, MQP, Reflektif (Bab 3, Tabel 7 & 8)."

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `prompt_source` | varchar | discriminator: `ask_question` / `discussion` / `challenge` |
| `prompt_id` | uuid | polymorphic source ID |
| `learning_session_id` | uuid | FK -> `learning_sessions(id)` ON DELETE SET NULL |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| `prompt_text` | text | denormalized |
| `prompt_sequence` | integer | |
| `prompt_stage` | varchar | `SCP` / `SRP` / `MQP` / `REFLECTIVE` |
| `prompt_stage_score` | integer | CHECK 1..4 |
| `micro_markers` | text[] | |
| `primary_marker` | varchar | `GCP` / `PP` / `ARP` |
| `classified_by`, `classification_method` | varchar | |
| `confidence_score` | numeric | |
| `secondary_classification_id` | uuid | for IRR pairing |
| `agreement_status` | varchar | |
| `classification_evidence`, `researcher_notes` | text | |
| `source_snapshot` | jsonb | default `{}` |
| `auto_stage`, `auto_stage_confidence` | varchar / numeric | when classified by LLM |
| `classification_status` | varchar | default `final` |
| `research_validity_status` | varchar | default `valid` |
| `data_collection_week` | varchar | |
| `created_at`, `updated_at` | timestamptz | |

- **Unique:** `(prompt_source, prompt_id, classified_by)` -- one classification per rater per prompt
- **Indexes:** 6 incl. validity composite
- **RLS:** `prompt_classifications_own`, `service_role_full_access`
- **Polymorphic mapping:** `ask_question -> ask_question_history.id`, `discussion -> discussion_messages.id`, `challenge -> challenge_responses.id`. Application enforces; no DB FK.

#### 4.5.3 `cognitive_indicators` (12 rows)

Manual CT/CTh scoring per classified prompt (RM3). Comment: "Indikator CT dan Critical Thinking per prompt (Bab 3, Tabel 9 & 10)."

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `prompt_classification_id` | uuid | FK -> `prompt_classifications(id)` ON DELETE CASCADE |
| `prompt_id`, `user_id` | uuid | denormalised, `user_id` FK -> `users(id)` ON DELETE CASCADE |
| `ct_decomposition`, `ct_pattern_recognition`, `ct_abstraction`, `ct_algorithm_design`, `ct_evaluation_debugging`, `ct_generalization` | integer | each CHECK 0..2 |
| `ct_total_score` | integer | **GENERATED** = sum of CT dimensions |
| `cth_interpretation`, `cth_analysis`, `cth_evaluation`, `cth_inference`, `cth_explanation`, `cth_self_regulation` | integer | each CHECK 0..2 |
| `cth_total_score` | integer | **GENERATED** = sum of CTh dimensions |
| `cognitive_depth_level` | integer | CHECK 1..4 |
| `evidence_text`, `indicator_notes` | text | |
| `assessed_by`, `assessment_method` | varchar | |
| `secondary_assessment_id` | uuid | for IRR pairing |
| `agreement_status` | varchar | |
| `indicator_evidence` | jsonb | default `{}` |
| `assessment_confidence` | numeric | |
| `research_validity_status` | varchar | default `valid` |
| `created_at`, `updated_at` | timestamptz | |

- **Indexes:** `idx_cog_ind_classification`, `idx_cog_ind_user`, `idx_cog_ind_ct_score`, `idx_cog_ind_cth_score`, `idx_cog_ind_depth`
- **RLS:** `cognitive_indicators_own`, `service_role_full_access`

#### 4.5.4 `auto_cognitive_scores` (12 rows)

Auto-classified CT/CTh scoring produced by LLM. Same schema as `cognitive_indicators` but uses `smallint` and a `(source, source_id)` polymorphic key (text source_id).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `source` | text | CHECK in `ask_question / challenge_response / quiz_submission / journal / discussion` |
| `source_id` | text | polymorphic id (text, not uuid) |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE CASCADE |
| CT and CTh sub-dimensions | smallint | each CHECK 0..2 |
| `ct_total_score`, `cth_total_score` | smallint | **GENERATED** |
| `cognitive_depth_level` | smallint | CHECK 1..4 |
| `confidence` | real | CHECK 0..1 |
| `evidence_summary` | text | |
| `assessment_method` | text | default `llm_auto` |
| `prompt_stage` | text | nullable |
| `is_follow_up` | boolean | default `false` |
| `created_at` | timestamptz | |

- **Indexes:** `idx_acs_source (source, source_id)`, `idx_acs_user_source`, plus FK indexes
- **RLS:** `service_role_full_access` only

#### 4.5.5 `research_evidence_items` (261 rows)

Unified evidence ledger across all activity sources. Comment: "Unified evidence ledger for RM2/RM3 thesis admin workflows across prompt logs, challenges, journals, discussion, quizzes, and artifacts."

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `source_type` | varchar | CHECK in `ask_question / challenge_response / quiz_submission / journal / discussion / artifact / observation / manual_note` |
| `source_id` | uuid | nullable |
| `source_table` | text | nullable |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE SET NULL |
| `learning_session_id` | uuid | FK -> `learning_sessions(id)` ON DELETE SET NULL |
| `prompt_classification_id` | uuid | FK -> `prompt_classifications(id)` ON DELETE SET NULL |
| `rm_focus` | varchar | default `RM2_RM3`; CHECK in `RM2 / RM3 / RM2_RM3` |
| `indicator_code`, `prompt_stage` | varchar | |
| `unit_sequence` | integer | |
| `evidence_title`, `evidence_text`, `ai_response_text`, `artifact_text`, `evidence_source_summary`, `researcher_notes` | text | |
| `evidence_status` | varchar | default `raw`; CHECK in `raw / coded / triangulated / excluded / needs_review` |
| `coding_status` | varchar | default `uncoded`; CHECK in `uncoded / auto_coded / manual_coded / reviewed` |
| `research_validity_status` | varchar | default `valid`; CHECK in `valid / low_information / duplicate / excluded / manual_note` |
| `triangulation_status` | varchar | nullable |
| `data_collection_week` | varchar | |
| `auto_confidence` | numeric | |
| `raw_evidence_snapshot`, `metadata` | jsonb | default `{}` |
| `coded_by`, `reviewed_by` | varchar | |
| `coded_at`, `reviewed_at` | timestamptz | |
| `is_auto_generated` | boolean | default `false` |
| `auto_coding_status` | varchar | default `pending`; CHECK in `pending / completed / needs_review / failed / skipped` |
| `auto_coding_run_id` | uuid | FK -> `research_auto_coding_runs(id)` ON DELETE SET NULL |
| `auto_coding_version`, `auto_coding_model`, `auto_coding_reason` | varchar / text | |
| `auto_coded_at` | timestamptz | |
| `created_at`, `updated_at` | timestamptz | |

- **Unique:** `uniq_research_evidence_items_source (source_type, source_table, source_id) WHERE source_id IS NOT NULL` -- de-dupes evidence by origin row
- **Indexes:** 9
- **RLS:** `research_evidence_items_own`, `service_role_full_access`

#### 4.5.6 `research_auto_coding_runs` (41 rows)

Stage 4 run log for automatic RM2/RM3 coding and triangulation. Comment: "Stage 4 run log for automatic RM2/RM3 coding and triangulation from the thesis evidence ledger."

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `requested_by` | uuid | FK -> `users(id)` ON DELETE SET NULL |
| `requested_by_email` | text | |
| `status` | varchar | default `running`; CHECK in `running / completed / failed / dry_run` |
| `scope`, `summary` | jsonb | default `{}` |
| `error_message` | text | |
| `started_at`, `completed_at` | timestamptz | |
| `created_at`, `updated_at` | timestamptz | |

- **Indexes:** `idx_research_auto_coding_runs_status`, `idx_research_auto_coding_runs_requested_by`
- **RLS:** `service_role_full_access` only

#### 4.5.7 `triangulation_records` (64 rows)

Cross-source triangulation outputs (Bab 3, Tabel 22).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE SET NULL |
| `learning_session_id` | uuid | FK -> `learning_sessions(id)` ON DELETE SET NULL |
| `prompt_classification_id` | uuid | FK -> `prompt_classifications(id)` ON DELETE SET NULL |
| `auto_coding_run_id` | uuid | FK -> `research_auto_coding_runs(id)` ON DELETE SET NULL |
| `finding_type`, `finding_description` | varchar / text | |
| Four evidence pairs | text + status | `log_evidence`, `observation_evidence`, `artifact_evidence`, `interview_evidence` plus `*_status` |
| `convergence_status`, `convergence_score` | varchar / integer | |
| `triangulation_status` | varchar | default `sebagian` |
| `final_decision`, `decision_rationale`, `researcher_notes`, `evidence_excerpt`, `missing_reason` | text | |
| `rm_focus` | varchar | default `RM2_RM3` |
| `indicator_code` | varchar | |
| `sources` | jsonb | default `{}` |
| `auto_generated` | boolean | default `false` |
| `generated_by`, `review_status`, `data_collection_week` | varchar | |
| `support_count`, `contradiction_count` | integer | default `0` |
| `evidence_item_ids` | uuid[] | default `'{}'`; cross-link into `research_evidence_items` |
| `created_at`, `updated_at` | timestamptz | |

- **Indexes:** 6 incl. `idx_triangulation_records_auto_indicator`
- **RLS:** `triangulation_records_own`, `service_role_full_access`

#### 4.5.8 `research_artifacts` (0 rows)

Student-produced solution artifacts (pseudocode, algorithms). Comment: "Artefak solusi siswa: pseudocode, algoritma (Bab 3, Tabel 13)." Schema is implemented but pipeline has not yet populated rows.

Key columns: `artifact_type`, `artifact_title`, `artifact_content`, five quality dimensions (CHECK 0..2 each), `total_artifact_score` (**GENERATED**), `source_type / source_id / source_table`, file fields (`file_url`, `file_name`, `mime_type`, `storage_path`), `artifact_metadata` jsonb, `evidence_status`, `coding_status` (default `manual_coded`), `research_validity_status`, `data_collection_week`.

- **RLS:** `research_artifacts_own`, `service_role_full_access`

#### 4.5.9 `prompt_revisions` (0 rows)

Tracks revision episodes within a learning session. Schema in place; no rows yet.

Key columns: `episode_id`, `episode_topic`, `original_prompt_id`, `previous_prompt_id`, `current_prompt_id`, `revision_sequence`, `revision_type`, `quality_change`, `previous_stage`, `current_stage`, `stage_improved`, `revision_notes`.

- **RLS:** `prompt_revisions_own`, `service_role_full_access`

#### 4.5.10 `inter_rater_reliability` (0 rows)

Cohen's Kappa / Po per coding round. Comment: "Rekaman reliabilitas antar-penilai (Bab 3, Tabel 25)." Schema in place; no IRR studies recorded yet.

Key columns: `coding_round`, `coding_type`, `total_units_coded`, `sample_size`, `sample_percentage`, `rater_1_id`, `rater_2_id`, `observed_agreement`, `expected_agreement`, `cohens_kappa`, `meets_po_threshold` (Po >= 0.80), `meets_kappa_threshold` (kappa >= 0.70), `overall_acceptable`, `disagreement_resolution`, `codebook_revisions`, `notes`.

- **RLS:** `service_role_full_access` only

---

### 4.6 Infrastructure

#### 4.6.1 `api_logs` (3801 rows)

Request/response logging populated by `withApiLogging()` in [`src/lib/api-logger.ts`](../src/lib/api-logger.ts).

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `method`, `path`, `query` | text | nullable |
| `status_code`, `duration_ms` | integer | |
| `ip_address`, `user_agent` | text | |
| `user_id`, `user_email`, `user_role` | text | as captured by middleware |
| `user_email_hash` | text | for anonymized analytics |
| `label` | text | endpoint label |
| `metadata` | jsonb | nullable |
| `error_message` | text | |
| `created_at` | timestamptz | |

- **Indexes:** `api_logs_created_at_idx`, `api_logs_path_created_at_idx`, `api_logs_user_id_idx (WHERE user_id IS NOT NULL)`, `idx_api_logs_path`
- **RLS:** `service_role_full_access` only

#### 4.6.2 `rate_limits` (115 rows)

Persistent state for the in-process rate limiter ([`src/lib/rate-limit.ts`](../src/lib/rate-limit.ts)). Note: the PK is `(key)`, not `(id)` -- this table has no surrogate id.

| Column | Type | Notes |
|---|---|---|
| `key` | text | **PK** |
| `count` | integer | default `1` |
| `reset_at` | timestamptz | |

- **Indexes:** `idx_rate_limits_reset_at`
- **RLS:** `rate_limits_service_role_all` only

#### 4.6.3 `course_generation_activity` (38 rows)

AI course-generation request log.

| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK |
| `user_id` | uuid | FK -> `users(id)` ON DELETE CASCADE |
| `course_id` | uuid | FK -> `courses(id)` ON DELETE SET NULL |
| `request_payload`, `outline` | jsonb | nullable |
| `created_at` | timestamptz | |

- **Indexes:** `idx_course_gen_activity_user`, `idx_course_gen_activity_course_id`
- **RLS:** `course_gen_activity_own`, `service_role_full_access`
- **Note:** The previously-documented `status` and `updated_at` columns are not present in production.

---

## 5. Row-Level Security (RLS) Summary

RLS is enabled on every public table. The pattern is consistent:

1. **Universal** `service_role_full_access` policy: `FOR ALL USING (true) WITH CHECK (true)` to the `service_role` role. This is what `adminDb` uses.
2. **Per-user `*_own` policy** to `authenticated`: `USING (user_id = (SELECT auth.uid()))`. Defence-in-depth only -- since the app does not use Supabase Auth, `auth.uid()` is NULL and these policies effectively block direct anon/authenticated access until the app key is replaced. The protection layer is application-level filtering on `x-user-id`.
3. **Public-read policies** on `discussion_templates` and `subtopic_cache` (`SELECT ... USING (true)`).
4. **Service-role only tables** (no per-user policy): `api_logs`, `auto_cognitive_scores`, `course_generation_activity` (note: also has `course_gen_activity_own`), `discussion_admin_actions`, `discussion_assessments`, `example_usage_events`, `inter_rater_reliability`, `leaf_subtopics`, `rate_limits`, `research_auto_coding_runs`, `subtopics` (write side), `transcript_integrity_quarantine`, `triangulation_records` (also has `*_own`), and `users` (write side).

Operational guidance: never expose the anon key path to write user-scoped data. All writes go through `adminDb`.

---

## 6. Functions and Triggers

| Function | Signature | Purpose |
|---|---|---|
| `get_jsonb_columns()` | returns `TABLE(table_name, column_name)` | Used by `DatabaseService.detectJsonbColumns()` to auto-parse JSONB fields |
| `get_admin_user_stats()` | returns `TABLE(...16 cols...)` | Per-user activity rollup for the admin dashboard |
| `update_session_metrics(p_session_id uuid)` | void | Recalculates per-session prompt totals and means |
| `refresh_learning_session_research_metrics(p_session_id uuid)` | void | Refreshes `evidence_summary`, readiness, and counts on `learning_sessions` |
| `calculate_stage_transition(p_user_id, p_course_id)` | void | Diff of dominant stage between latest two sessions |
| `ensure_leaf_subtopic(p_course_id, p_module_id, p_module_title, p_subtopic_title, p_module_index?, p_subtopic_index?)` | uuid | Idempotent get-or-create for `leaf_subtopics` |
| `normalize_leaf_subtopic_title(value text)` | text | Canonical normalization for leaf title dedupe |
| `insert_quiz_attempt(p_user_id, p_course_id, p_subtopic_id, p_subtopic_label, p_leaf_subtopic_id, p_module_index, p_subtopic_index, p_quiz_attempt_id, p_answers jsonb)` | TABLE | Atomic 5-question attempt insert |
| `set_updated_at_timestamp()` | trigger | Auto-touch `updated_at` |
| `rls_auto_enable()` | event_trigger | Enables RLS on every newly created public table |

---

## 7. Views

| View | Purpose |
|---|---|
| `v_longitudinal_prompt_development` | Per-session longitudinal joined view (`learning_sessions` + `users` + `courses`) used for time-series analytics |
| `v_prompt_classification_summary` | Aggregates prompt-stage counts and percentages per session from `prompt_classifications` |
| `v_cognitive_indicators_summary` | Mean per-dimension CT/CTh scores per session |
| `v_transcript_integrity_audit` | Aggregated view of `transcript_integrity_quarantine` for audit dashboards |

---

## 8. JSONB Column Map

`get_jsonb_columns()` enumerates every JSONB column for `DatabaseService` auto-parse. Inventory:

| Table | Column | Typical Structure |
|---|---|---|
| `subtopics` | `content` | Structured AI-generated module content |
| `subtopic_cache` | `content` | Mirror of generated subtopic content |
| `quiz` | `options` | `[{text, isCorrect}, ...]` |
| `course_generation_activity` | `request_payload`, `outline` | Course generation request and outline |
| `ask_question_history` | `prompt_components`, `micro_markers`, `raw_evidence_snapshot` | Prompt parts, RM2 markers, evidence snapshot |
| `quiz_submissions` | `raw_evidence_snapshot` | Evidence snapshot |
| `jurnal` | `raw_evidence_snapshot` | Evidence snapshot |
| `challenge_responses` | `raw_evidence_snapshot` | Evidence snapshot |
| `discussion_sessions` | `learning_goals`, `completion_summary` | Goals + final summary |
| `discussion_messages` | `metadata`, `raw_evidence_snapshot` | Per-message context, evidence |
| `discussion_templates` | `source`, `template` | Provenance + template flow |
| `discussion_assessments` | `assessment_raw` | Raw evaluator payload |
| `discussion_admin_actions` | `payload` | Action parameters |
| `cognitive_indicators` | `indicator_evidence` | Detailed evidence map |
| `prompt_classifications` | `source_snapshot` | Snapshot of classified source |
| `research_evidence_items` | `raw_evidence_snapshot`, `metadata` | Evidence ledger payloads |
| `research_artifacts` | `artifact_metadata` | File / artifact metadata |
| `research_auto_coding_runs` | `scope`, `summary` | Run scope and result summary |
| `triangulation_records` | `sources` | Per-source triangulation map |
| `learning_sessions` | `evidence_summary` | Aggregated readiness payload |
| `example_usage_events` | `raw_evidence_snapshot` | Evidence snapshot |
| `api_logs` | `metadata` | Request/response context |

---

## 9. Foreign Key Map

(Compact view of every FK that exists in production. ON DELETE action shown.)

| Parent | Child | FK column | ON DELETE |
|---|---|---|---|
| `users` | `courses` | `created_by` | SET NULL |
| `users` | `learning_profiles` | `user_id` | CASCADE |
| `users` | `ask_question_history` | `user_id` | CASCADE |
| `users` | `auto_cognitive_scores` | `user_id` | CASCADE |
| `users` | `challenge_responses` | `user_id` | CASCADE |
| `users` | `cognitive_indicators` | `user_id` | CASCADE |
| `users` | `course_generation_activity` | `user_id` | CASCADE |
| `users` | `discussion_assessments` | `user_id` | CASCADE |
| `users` | `discussion_sessions` | `user_id` | CASCADE |
| `users` | `example_usage_events` | `user_id` | CASCADE |
| `users` | `feedback` | `user_id` | CASCADE |
| `users` | `jurnal` | `user_id` | CASCADE |
| `users` | `learning_sessions` | `user_id` | CASCADE |
| `users` | `prompt_classifications` | `user_id` | CASCADE |
| `users` | `prompt_revisions` | `user_id` | CASCADE |
| `users` | `quiz_submissions` | `user_id` | CASCADE |
| `users` | `research_artifacts` | `user_id` | CASCADE |
| `users` | `research_auto_coding_runs` | `requested_by` | SET NULL |
| `users` | `research_evidence_items` | `user_id` | CASCADE |
| `users` | `transcript` | `user_id` | CASCADE |
| `users` | `triangulation_records` | `user_id` | CASCADE |
| `users` | `user_progress` | `user_id` | CASCADE |
| `courses` | `subtopics` | `course_id` | CASCADE |
| `courses` | `leaf_subtopics` | `course_id` | CASCADE |
| `courses` | `quiz` | `course_id` | CASCADE |
| `courses` | `quiz_submissions` (via -> quiz only; no direct course FK) | -- | -- |
| `courses` | `ask_question_history` | `course_id` | CASCADE |
| `courses` | `auto_cognitive_scores` | `course_id` | CASCADE |
| `courses` | `challenge_responses` | `course_id` | CASCADE |
| `courses` | `course_generation_activity` | `course_id` | SET NULL |
| `courses` | `discussion_assessments` | `course_id` | CASCADE |
| `courses` | `discussion_sessions` | `course_id` | CASCADE |
| `courses` | `discussion_templates` | `course_id` | CASCADE |
| `courses` | `example_usage_events` | `course_id` | SET NULL |
| `courses` | `feedback` | `course_id` | CASCADE |
| `courses` | `jurnal` | `course_id` | CASCADE |
| `courses` | `learning_sessions` | `course_id` | CASCADE |
| `courses` | `prompt_classifications` | `course_id` | CASCADE |
| `courses` | `research_artifacts` | `course_id` | CASCADE |
| `courses` | `research_evidence_items` | `course_id` | SET NULL |
| `courses` | `transcript` | `course_id` | CASCADE |
| `courses` | `triangulation_records` | `course_id` | SET NULL |
| `courses` | `user_progress` | `course_id` | CASCADE |
| `subtopics` | `leaf_subtopics` | `module_id` | CASCADE |
| `subtopics` | `quiz` | `subtopic_id` | CASCADE |
| `subtopics` | `discussion_sessions` | `subtopic_id` | CASCADE |
| `subtopics` | `discussion_assessments` | `subtopic_id` | SET NULL |
| `subtopics` | `discussion_templates` | `subtopic_id` | CASCADE |
| `subtopics` | `feedback` | `subtopic_id` | SET NULL |
| `subtopics` | `jurnal` | `subtopic_id` | SET NULL |
| `subtopics` | `transcript` | `subtopic_id` | SET NULL |
| `subtopics` | `user_progress` | `subtopic_id` | CASCADE |
| `leaf_subtopics` | `quiz` | `leaf_subtopic_id` | SET NULL |
| `leaf_subtopics` | `quiz_submissions` | `leaf_subtopic_id` | SET NULL |
| `leaf_subtopics` | `user_progress` | `leaf_subtopic_id` | SET NULL |
| `quiz` | `quiz_submissions` | `quiz_id` | CASCADE |
| `discussion_sessions` | `discussion_messages` | `session_id` | CASCADE |
| `discussion_sessions` | `discussion_assessments` | `session_id` | CASCADE |
| `discussion_sessions` | `discussion_admin_actions` | `session_id` | CASCADE |
| `discussion_messages` | `discussion_assessments` (student) | `student_message_id` | CASCADE |
| `discussion_messages` | `discussion_assessments` (prompt) | `prompt_message_id` | SET NULL |
| `discussion_messages` | `discussion_messages` (self) | `revision_of_message_id` | -- |
| `discussion_templates` | `discussion_sessions` | `template_id` | SET NULL |
| `learning_sessions` | `ask_question_history` | `learning_session_id` | SET NULL |
| `learning_sessions` | `challenge_responses` | `learning_session_id` | SET NULL |
| `learning_sessions` | `discussion_messages` | `learning_session_id` | SET NULL |
| `learning_sessions` | `discussion_sessions` | `learning_session_id` | SET NULL |
| `learning_sessions` | `example_usage_events` | `learning_session_id` | SET NULL |
| `learning_sessions` | `jurnal` | `learning_session_id` | SET NULL |
| `learning_sessions` | `prompt_classifications` | `learning_session_id` | SET NULL |
| `learning_sessions` | `prompt_revisions` | `learning_session_id` | SET NULL |
| `learning_sessions` | `quiz_submissions` | `learning_session_id` | SET NULL |
| `learning_sessions` | `research_artifacts` | `learning_session_id` | SET NULL |
| `learning_sessions` | `research_evidence_items` | `learning_session_id` | SET NULL |
| `learning_sessions` | `triangulation_records` | `learning_session_id` | SET NULL |
| `prompt_classifications` | `cognitive_indicators` | `prompt_classification_id` | CASCADE |
| `prompt_classifications` | `research_evidence_items` | `prompt_classification_id` | SET NULL |
| `prompt_classifications` | `triangulation_records` | `prompt_classification_id` | SET NULL |
| `research_auto_coding_runs` | `research_evidence_items` | `auto_coding_run_id` | SET NULL |
| `research_auto_coding_runs` | `triangulation_records` | `auto_coding_run_id` | SET NULL |
| `ask_question_history` | `ask_question_history` (self) | `follow_up_of` | -- |
| `jurnal` | `feedback` | `origin_jurnal_id` | SET NULL |

---

## 10. Empty / Reserved Tables

These tables exist with full schema but have zero rows in production. They are intentionally reserved for upcoming pipeline stages or out-of-scope features.

| Table | Reason |
|---|---|
| `discussion_admin_actions` | Discussion module is out of admin scope (per project memory); audit log unused. |
| `inter_rater_reliability` | No second rater has been onboarded yet; IRR studies pending. |
| `prompt_revisions` | Revision-detection step of the RM3 pipeline not yet implemented. |
| `research_artifacts` | Artifact ingestion (file upload + scoring) not yet wired into the admin UI. |
| `transcript` | Transcript module is currently disabled; the table remains for forward compatibility. |

---

## 11. Research Pipeline Status (RM2/RM3)

Per the project research-pipeline memory, the auto-coding pipeline is partially built. Live status:

| Table | Rows | Status |
|---|---|---|
| `prompt_classifications` | 143 | Active (mix of manual + auto stages). |
| `cognitive_indicators` | 12 | Active (manual scoring). |
| `auto_cognitive_scores` | 12 | Active (LLM auto-scoring). |
| `research_evidence_items` | 261 | Active (unified ledger). |
| `research_auto_coding_runs` | 41 | Active (run log). |
| `triangulation_records` | 64 | Active (auto + manual). |
| `discussion_assessments` | 45 | Active (research read-model). |
| `learning_sessions` | 22 | Active. |
| `research_artifacts` | 0 | Reserved -- no rows yet. |
| `prompt_revisions` | 0 | Reserved -- not yet populated. |
| `inter_rater_reliability` | 0 | Reserved -- IRR not yet recorded. |
| `discussion_admin_actions` | 0 | Reserved -- discussion module out of admin scope. |

The pipeline is functional end-to-end for evidence and triangulation but does not yet feed artifact, revision, or IRR steps.

---

## 12. Migration History

The folder [`docs/sql/`](./sql/) is kept as a historical reference of forward migrations. It is not the source of truth (the live database is) but is useful for recovery and audit. Files (alphabetical):

```
add_ask_question_research_columns.sql
add_challenge_reasoning_note.sql
add_discussion_assessment_research_model.sql
add_discussion_session_unique_constraint.sql
add_feedback_origin_jurnal_link.sql
add_feedback_rating_guardrails.sql
add_jurnal_transcript_unique_constraints.sql
add_quiz_attempt_tracking.sql
add_quiz_submission_context_columns.sql
add_refresh_token_hash.sql
add_rls_policies_all_tables.sql
add_subtopic_label_to_quiz.sql
add_user_progress_completed_at.sql
add_users_onboarding_completed.sql
align_reflection_history_model.sql
alter_learning_sessions_add_fields.sql
backfill_feedback_origin_jurnal_id.sql
create_discussion_admin_actions.sql
create_get_admin_user_stats_function.sql
create_get_jsonb_columns_function.sql
create_leaf_subtopics_and_atomic_quiz_attempts.sql
create_rate_limits_table.sql
create_research_tables.sql
create_transcript_table.sql
drop_legacy_jurnal_user_course_unique.sql
enforce_feedback_origin_jurnal_uniqueness.sql
fix_api_logs_schema.sql
fix_leaf_subtopic_advisor_findings.sql
fix_supabase_advisor_discussion_rate_limits.sql
harden_leaf_subtopic_rpc_permissions.sql
harden_quiz_integrity_and_indexes.sql
```

Files most relevant to active maintenance:

- Reflection model: `align_reflection_history_model.sql`, `add_feedback_origin_jurnal_link.sql`, `enforce_feedback_origin_jurnal_uniqueness.sql`, `drop_legacy_jurnal_user_course_unique.sql`, `backfill_feedback_origin_jurnal_id.sql`
- Quiz integrity: `add_quiz_attempt_tracking.sql`, `add_quiz_submission_context_columns.sql`, `harden_quiz_integrity_and_indexes.sql`, `create_leaf_subtopics_and_atomic_quiz_attempts.sql`
- RLS hardening: `add_rls_policies_all_tables.sql`, `harden_leaf_subtopic_rpc_permissions.sql`, `fix_supabase_advisor_discussion_rate_limits.sql`
- Research model: `create_research_tables.sql`, `alter_learning_sessions_add_fields.sql`, `add_discussion_assessment_research_model.sql`, `add_ask_question_research_columns.sql`

---

## 13. Cross-References

- [`ARCHITECTURE.md`](./ARCHITECTURE.md) -- request lifecycle and module boundaries.
- [`API_REFERENCE.md`](./API_REFERENCE.md) -- endpoint contracts and Zod payloads.
- [`SECURITY.md`](./SECURITY.md) -- end-to-end auth, RLS strategy, CSRF, rate-limit detail.
- [`src/lib/database.ts`](../src/lib/database.ts) -- `adminDb`, `publicDb`, `DatabaseService`, JSONB auto-detection.
- [`src/lib/schemas.ts`](../src/lib/schemas.ts) -- Zod request validators referenced per table.
- [`src/lib/api-middleware.ts`](../src/lib/api-middleware.ts), [`src/lib/api-logger.ts`](../src/lib/api-logger.ts) -- the writers behind `api_logs`.
