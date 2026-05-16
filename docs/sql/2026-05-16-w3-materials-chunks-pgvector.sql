-- MVR Item 3: Bank sumber tables (PDF buku Fase E → chunks → embeddings).
-- pgvector v0.8.0 confirmed available; enable extension first.
-- Applied via Supabase migration `mvr_w3_materials_and_chunks_with_pgvector` (version 20260516063020).

CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE materials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255) NOT NULL,
  author VARCHAR(255),
  edition VARCHAR(50),
  template_topics VARCHAR(50)[] NOT NULL,  -- multi-select: 1 PDF dapat menutupi beberapa course Fase E
  source_url TEXT,
  storage_path TEXT NOT NULL,
  file_size_bytes BIGINT,
  page_count INT,
  validation_status VARCHAR(20) NOT NULL DEFAULT 'draft'
    CHECK (validation_status IN ('draft','validated','retired')),
  validated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  validated_at TIMESTAMPTZ,
  uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_materials_template_topics ON materials USING GIN (template_topics);
CREATE INDEX idx_materials_validation_status ON materials(validation_status);

CREATE TABLE material_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  material_id UUID NOT NULL REFERENCES materials(id) ON DELETE CASCADE,
  chunk_idx INT NOT NULL,
  chunk_text TEXT NOT NULL,
  page_number INT,
  token_count INT,
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (material_id, chunk_idx)
);

CREATE INDEX idx_material_chunks_material_id ON material_chunks(material_id);
-- ivfflat list count = sqrt(num_chunks); 100 fits initial corpus 1k-10k chunks.
CREATE INDEX idx_material_chunks_embedding
  ON material_chunks USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Minimal RLS — defense in depth. Service role (adminDb) bypasses these.
ALTER TABLE materials ENABLE ROW LEVEL SECURITY;
ALTER TABLE material_chunks ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_full_access ON materials       FOR ALL TO service_role USING (true);
CREATE POLICY service_role_full_access ON material_chunks FOR ALL TO service_role USING (true);

-- Updated-at trigger reuse (function already exists from prior migrations)
CREATE TRIGGER trg_materials_updated_at
  BEFORE UPDATE ON materials
  FOR EACH ROW EXECUTE FUNCTION set_updated_at_timestamp();
