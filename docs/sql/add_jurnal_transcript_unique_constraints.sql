-- Unique constraints to back the application-level upsert logic in
-- src/app/api/jurnal/save/route.ts and src/app/api/transcript/save/route.ts.
--
-- Bug context:
--   Bug #5 (MEDIUM) — both endpoints previously called insertRecord on every
--   submission, so re-submitting created duplicate rows. The route handlers
--   were patched to perform a fetch-then-update/insert ("upsert"), but a
--   database-level UNIQUE constraint is required to make the guarantee
--   race-safe and to enforce the invariant for any future writers.
--
-- IMPORTANT:
--   If existing rows already violate these constraints (duplicate jurnal
--   entries per (user_id, course_id) or duplicate transcript entries per
--   (user_id, course_id, subtopic_id)), these ALTER statements WILL FAIL.
--   De-duplicate the affected tables manually before applying.

-- Jurnal: one journal record per user per course.
ALTER TABLE public.jurnal
  ADD CONSTRAINT jurnal_user_course_unique
  UNIQUE (user_id, course_id);

-- Transcript: one transcript/notes record per user per subtopic of a course.
-- Granularity matches the route handler upsert key and the schema doc
-- description ("Student course notes and transcripts per subtopic").
-- NOTE: Postgres treats NULLs as distinct in UNIQUE constraints by default,
-- so rows with subtopic_id IS NULL will not collide with each other. If
-- transcripts without a resolved subtopic also need to be unique per course,
-- migrate Postgres 15+ and use `UNIQUE NULLS NOT DISTINCT` instead.
ALTER TABLE public.transcript
  ADD CONSTRAINT transcript_user_course_subtopic_unique
  UNIQUE (user_id, course_id, subtopic_id);
