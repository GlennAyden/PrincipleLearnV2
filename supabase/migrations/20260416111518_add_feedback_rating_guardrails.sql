ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_rating_range_check;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_rating_range_check
  CHECK (rating IS NULL OR rating BETWEEN 1 AND 5);

ALTER TABLE public.feedback
  ALTER COLUMN comment SET DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_feedback_rating_created_at
  ON public.feedback (rating, created_at DESC)
  WHERE rating IS NOT NULL;;
