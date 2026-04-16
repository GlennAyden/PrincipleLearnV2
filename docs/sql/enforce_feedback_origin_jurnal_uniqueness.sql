-- Finalize `feedback.origin_jurnal_id` linkage after precheck and backfill.
--
-- Run this only after:
--   - `docs/sql/add_feedback_origin_jurnal_link.sql` has been applied
--   - collision scan shows each mirrored journal maps to at most one feedback row
--   - any legacy duplicates have been resolved

CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_origin_jurnal_unique
  ON public.feedback (origin_jurnal_id)
  WHERE origin_jurnal_id IS NOT NULL;
