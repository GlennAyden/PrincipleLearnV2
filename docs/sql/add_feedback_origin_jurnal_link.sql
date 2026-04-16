-- Optional linkage between mirrored feedback rows and their source journal.
--
-- Why this matters:
--   - structured reflections written through `/api/jurnal/save` currently
--     dual-write into both `jurnal` and `feedback`
--   - admin activity and analytics dedupe these pairs heuristically today
--   - adding an explicit origin key makes future reporting and backfills safer
--
-- This column remains nullable because some feedback rows are direct feedback
-- submissions and should not be forced to reference a journal row.
--
-- This is the additive phase only.
-- Enforce one-to-one uniqueness later with:
--   docs/sql/enforce_feedback_origin_jurnal_uniqueness.sql

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
  WHERE origin_jurnal_id IS NOT NULL;

-- Suggested rollout:
--   1. apply this schema change
--   2. update `/api/jurnal/save` to populate `origin_jurnal_id` on mirror write
--   3. backfill legacy mirror pairs with
--      `docs/sql/backfill_feedback_origin_jurnal_id.sql` using
--      user/course/subtopic/module/subtopic scope plus timestamp proximity
--   4. if the backfill is collision-free, enforce uniqueness with
--      `docs/sql/enforce_feedback_origin_jurnal_uniqueness.sql`
