/**
 * MVR Item 4 — RAG retrieval over the validated material_chunks corpus.
 *
 * Flow:
 *   1. embed the user query (text-embedding-3-small, 1536-dim)
 *   2. call the `match_material_chunks` SQL function which runs an ivfflat
 *      cosine search filtered by template_topic + validation_status='validated'
 *   3. return the chunks above `threshold`, sorted by similarity desc
 *
 * The Sokratik prompt builder (Item 5) consumes this output and injects the
 * chunks as `<source id="c{uuid}" page="N">text</source>` blocks; the response
 * parser (citation-parser.service.ts) then extracts `[c{uuid}]` markers from
 * the AI answer so we can persist provenance in `cited_material_chunk_ids`.
 */

import { adminDb } from '@/lib/database';
import { embedQuery } from '@/services/embedding.service';

export interface RetrievedChunk {
  chunkId: string;
  materialId: string;
  chunkText: string;
  pageNumber: number | null;
  similarity: number;
  materialTitle: string;
  materialSourceUrl: string | null;
}

export interface RetrieveContextResult {
  chunks: RetrievedChunk[];
  totalRetrieved: number;
  aboveThreshold: number;
}

export interface RetrieveContextOptions {
  query: string;
  templateTopic: string;
  k?: number;
  threshold?: number;
}

const DEFAULT_K = 4;
const DEFAULT_THRESHOLD = 0.65;

export async function retrieveContext(
  options: RetrieveContextOptions,
): Promise<RetrieveContextResult> {
  const { query, templateTopic } = options;
  const k = options.k ?? DEFAULT_K;
  const threshold = options.threshold ?? DEFAULT_THRESHOLD;

  if (!query.trim() || !templateTopic.trim()) {
    return { chunks: [], totalRetrieved: 0, aboveThreshold: 0 };
  }

  let embedding: number[];
  try {
    embedding = await embedQuery(query);
  } catch (error) {
    console.warn('[RAG] Failed to embed query, falling back to empty context', error);
    return { chunks: [], totalRetrieved: 0, aboveThreshold: 0 };
  }

  const { data, error } = await adminDb.rpc('match_material_chunks', {
    p_query_embedding: embedding,
    p_template_topic: templateTopic,
    p_match_count: k,
    p_similarity_threshold: threshold,
  });

  if (error) {
    console.warn('[RAG] match_material_chunks RPC error', error);
    return { chunks: [], totalRetrieved: 0, aboveThreshold: 0 };
  }

  type RawRow = {
    chunk_id: string;
    material_id: string;
    chunk_text: string;
    page_number: number | null;
    similarity: number | string;
    material_title: string;
    material_source_url: string | null;
  };

  const rows = (Array.isArray(data) ? data : []) as RawRow[];
  const chunks: RetrievedChunk[] = rows.map((r) => ({
    chunkId: r.chunk_id,
    materialId: r.material_id,
    chunkText: r.chunk_text,
    pageNumber: r.page_number,
    similarity: typeof r.similarity === 'number' ? r.similarity : Number(r.similarity),
    materialTitle: r.material_title,
    materialSourceUrl: r.material_source_url,
  }));

  return {
    chunks,
    totalRetrieved: chunks.length,
    aboveThreshold: chunks.length, // RPC already filters by threshold
  };
}

/**
 * Render retrieved chunks as XML-tagged source blocks the AI prompt can
 * inject as user-content. The id format `c{uuid}` is matched verbatim by the
 * citation parser regex, so any change here must update both sides.
 */
export function renderSourcesForPrompt(chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) return '<sources>(tidak ada sumber yang ditemukan untuk pertanyaan ini)</sources>';

  const blocks = chunks.map((c) => {
    const page = c.pageNumber != null ? ` page="${c.pageNumber}"` : '';
    return `<source id="c${c.chunkId}"${page} similarity="${c.similarity.toFixed(3)}">${c.chunkText}</source>`;
  });
  return `<sources>\n${blocks.join('\n\n')}\n</sources>`;
}
