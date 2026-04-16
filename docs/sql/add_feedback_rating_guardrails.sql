-- Guardrails for direct and mirrored writes into `public.feedback`.
--
-- Current runtime behavior:
--   - `/api/feedback` accepts only ratings in the 1..5 range
--   - `/api/jurnal/save` mirrors structured reflection rating/comment into
--     `feedback` and also clamps rating to 1..5
--
-- This DB-level constraint keeps analytics safe even if future writers bypass
-- route-level validation.

ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_rating_range_check;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_rating_range_check
  CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

-- `comment` is intentionally kept nullable/empty-string friendly because the
-- reflection mirror can represent "rating only" submissions.
ALTER TABLE public.feedback
  ALTER COLUMN comment SET DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_feedback_rating_created_at
  ON public.feedback (rating, created_at DESC)
  WHERE rating IS NOT NULL;
