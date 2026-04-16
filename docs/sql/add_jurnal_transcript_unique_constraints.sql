-- Legacy note:
--   This file used to add `UNIQUE (user_id, course_id)` on `public.jurnal`.
--   That guidance is no longer correct for the current reflection model.
--
-- Current application behavior:
--   - `src/app/api/jurnal/save/route.ts` is insert-only
--   - multiple historical reflections per course/subtopic must be preserved
--   - admin activity and analytics now dedupe `jurnal + feedback` at read time
--
-- If a legacy unique constraint still exists in Supabase, remove it with:
--   docs/sql/drop_legacy_jurnal_user_course_unique.sql
--
-- This file is kept only for the transcript constraint, which still matches
-- the current route behavior.

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
