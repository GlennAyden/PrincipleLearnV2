-- MVR Item 4: RAG retrieval function. SECURITY DEFINER bound to service_role
-- only; called from server-side rag.service.ts which already authenticates the
-- user via the standard middleware path.
-- Applied via Supabase migration `mvr_w5_match_material_chunks_function` (version 20260516063545).

CREATE OR REPLACE FUNCTION match_material_chunks(
  p_query_embedding vector(1536),
  p_template_topic VARCHAR(50),
  p_match_count INT DEFAULT 4,
  p_similarity_threshold FLOAT DEFAULT 0.65
)
RETURNS TABLE (
  chunk_id UUID,
  material_id UUID,
  chunk_text TEXT,
  page_number INT,
  similarity FLOAT,
  material_title TEXT,
  material_source_url TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    mc.id        AS chunk_id,
    mc.material_id,
    mc.chunk_text,
    mc.page_number,
    (1 - (mc.embedding <=> p_query_embedding))::float AS similarity,
    m.title::text       AS material_title,
    m.source_url::text  AS material_source_url
  FROM material_chunks mc
  JOIN materials m ON m.id = mc.material_id
  WHERE m.validation_status = 'validated'
    AND p_template_topic = ANY(m.template_topics)
    AND mc.embedding IS NOT NULL
    AND (1 - (mc.embedding <=> p_query_embedding)) >= p_similarity_threshold
  ORDER BY mc.embedding <=> p_query_embedding
  LIMIT p_match_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION match_material_chunks FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION match_material_chunks TO service_role;
