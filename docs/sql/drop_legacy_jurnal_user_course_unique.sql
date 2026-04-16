-- Finalize reflection history rollout by removing the legacy uniqueness
-- invariant from `public.jurnal`.
--
-- Run this only after:
--   - additive reflection rollout snippets have been applied
--   - admin/research read paths are already using the unified reflection model
--   - live prechecks confirm historical duplicate rows are expected
--   - no legacy writer still depends on overwrite semantics

ALTER TABLE public.jurnal
  DROP CONSTRAINT IF EXISTS jurnal_user_course_unique;

ALTER TABLE public.jurnal
  DROP CONSTRAINT IF EXISTS jurnal_user_course_subtopic_unique;
