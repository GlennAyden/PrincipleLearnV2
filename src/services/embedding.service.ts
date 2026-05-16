/**
 * OpenAI embedding service for MVR Item 3 (Bank Sumber) and Item 4 (RAG).
 *
 * Uses `text-embedding-3-small` (1536-dim, $0.02/1M tokens). Falls back to
 * the env override `OPENAI_EMBEDDING_MODEL` so a future migration to a
 * larger model doesn't require a code change.
 *
 * Batching: OpenAI's embeddings endpoint accepts arrays up to 2048 inputs,
 * but the practical sweet spot is ~100 — beyond that, individual requests
 * approach the 60-second timeout and a single failure invalidates the
 * whole batch. The caller passes inputs in any size; this module enforces
 * the 100-item ceiling.
 */

import { openai } from '@/lib/openai';

const MODEL = process.env.OPENAI_EMBEDDING_MODEL ?? 'text-embedding-3-small';
const MAX_BATCH = 100;

export interface EmbeddingResult {
  index: number;
  embedding: number[];
}

/**
 * Embed an array of texts in batches of `MAX_BATCH`. Order of the returned
 * vectors matches the input order. Throws on any batch failure; callers
 * (admin upload pipeline) should catch and surface a partial-failure error
 * to the admin so they can retry without re-uploading the PDF.
 */
export async function embedTexts(inputs: string[]): Promise<EmbeddingResult[]> {
  if (inputs.length === 0) return [];

  const results: EmbeddingResult[] = [];
  for (let offset = 0; offset < inputs.length; offset += MAX_BATCH) {
    const batch = inputs.slice(offset, offset + MAX_BATCH);
    const response = await openai.embeddings.create({
      model: MODEL,
      input: batch,
    });

    for (const item of response.data) {
      results.push({
        index: offset + item.index,
        embedding: item.embedding,
      });
    }
  }

  results.sort((a, b) => a.index - b.index);
  return results;
}

/** Convenience: embed a single query at retrieval time (Item 4). */
export async function embedQuery(query: string): Promise<number[]> {
  const [result] = await embedTexts([query]);
  if (!result) throw new Error('Embedder returned no vector for query');
  return result.embedding;
}
