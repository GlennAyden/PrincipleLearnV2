ALTER TABLE public.feedback
  ADD COLUMN IF NOT EXISTS origin_jurnal_id UUID NULL;

ALTER TABLE public.feedback
  DROP CONSTRAINT IF EXISTS feedback_origin_jurnal_id_fkey;

ALTER TABLE public.feedback
  ADD CONSTRAINT feedback_origin_jurnal_id_fkey
  FOREIGN KEY (origin_jurnal_id)
  REFERENCES public.jurnal (id)
  ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_feedback_origin_jurnal_id
  ON public.feedback (origin_jurnal_id)
  WHERE origin_jurnal_id IS NOT NULL;;
