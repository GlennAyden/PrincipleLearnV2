CREATE UNIQUE INDEX IF NOT EXISTS idx_feedback_origin_jurnal_unique
  ON public.feedback (origin_jurnal_id)
  WHERE origin_jurnal_id IS NOT NULL;;
