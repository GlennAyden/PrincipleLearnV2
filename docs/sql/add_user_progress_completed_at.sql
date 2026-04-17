-- Adds the completion timestamp expected by learning progress and discussion
-- completion APIs.

ALTER TABLE public.user_progress
  ADD COLUMN IF NOT EXISTS completed_at timestamptz;

COMMENT ON COLUMN public.user_progress.completed_at
  IS 'Timestamp when a user/module progress record was marked completed.';

UPDATE public.user_progress
SET completed_at = COALESCE(completed_at, updated_at, created_at)
WHERE is_completed = true
  AND completed_at IS NULL;

UPDATE public.user_progress
SET completed_at = NULL
WHERE is_completed = false
  AND completed_at IS NOT NULL;
