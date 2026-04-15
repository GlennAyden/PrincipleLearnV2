-- Unique index to prevent TOCTOU duplicate discussion sessions per
-- (user, course, subtopic). Backs the race-condition fix in
-- src/app/api/discussion/start/route.ts where a "fetch existing -> create
-- if not found" flow could otherwise create multiple sessions when two
-- requests arrive concurrently.
--
-- Postgres treats NULLs as distinct in a plain UNIQUE, so rows with
-- subtopic_id IS NULL would never collide. Split into two partial unique
-- indexes to enforce the invariant for both the NULL and NOT NULL cases.
--
-- IMPORTANT:
--   If existing rows already violate these constraints, these statements
--   will fail at creation time. De-duplicate the discussion_sessions table
--   manually before applying.

-- One active session per (user, course, subtopic) when subtopic_id is set.
CREATE UNIQUE INDEX IF NOT EXISTS discussion_sessions_user_course_subtopic_unique
  ON public.discussion_sessions (user_id, course_id, subtopic_id)
  WHERE subtopic_id IS NOT NULL;

-- One active session per (user, course) when subtopic_id is NULL (e.g. a
-- module-level discussion with no resolved subtopic).
CREATE UNIQUE INDEX IF NOT EXISTS discussion_sessions_user_course_null_subtopic_unique
  ON public.discussion_sessions (user_id, course_id)
  WHERE subtopic_id IS NULL;
