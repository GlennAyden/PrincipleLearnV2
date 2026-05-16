-- MVR Item 4b: Subtopic cache lock + QA workflow untuk research content determinism.
-- Applied via Supabase migration `mvr_w5_subtopic_cache_lock_and_qa` (version 20260516063037).
-- 113 baris existing semua mode='general', qa_status='approved' (default), locked=false.
-- Sesuai rencana Item 4b: treat existing cache as already-validated dari production.

ALTER TABLE subtopic_cache
  ADD COLUMN mode VARCHAR(20) NOT NULL DEFAULT 'general'
    CHECK (mode IN ('general','research')),
  ADD COLUMN locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN qa_status VARCHAR(20) NOT NULL DEFAULT 'approved'
    CHECK (qa_status IN ('pending','approved','needs_revision','rejected')),
  ADD COLUMN qa_reviewed_by UUID REFERENCES users(id) ON DELETE SET NULL,
  ADD COLUMN qa_reviewed_at TIMESTAMPTZ,
  ADD COLUMN qa_notes TEXT,
  ADD COLUMN source_chunk_ids UUID[] NOT NULL DEFAULT '{}',
  ADD COLUMN generation_seed VARCHAR(64),
  ADD COLUMN generated_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_subtopic_cache_mode_qa ON subtopic_cache(mode, qa_status);
