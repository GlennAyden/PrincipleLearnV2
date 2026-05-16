/**
 * Material chunker — split a long text (extracted from a PDF or pasted by an
 * admin) into ~600-token chunks with ~80-token overlap, preserving page
 * boundaries when the input is annotated with `\f` form-feed markers or
 * explicit `[[page:N]]` tags (the format produced by `pdftotext -layout`).
 *
 * Token count is approximated as `text.length / 4` (OpenAI's rough convention
 * for English; close enough for Indonesian textbook prose). Using a real
 * tiktoken encoder would shave at most 5% off chunk sizes and pull in an
 * 80KB+ dependency, so the approximation wins here.
 *
 * MVR Item 3 (rencana-eksekusi-mvr.md). Embedding model:
 * `text-embedding-3-small` → 1536-dim, $0.02/1M tokens.
 */

const APPROX_CHARS_PER_TOKEN = 4;
const DEFAULT_CHUNK_TOKENS = 600;
const DEFAULT_OVERLAP_TOKENS = 80;
const MIN_CHUNK_CHARS = 80; // discard near-empty trailing fragments

export interface RawChunkInput {
  text: string;
  /**
   * Optional pre-parsed pages, each item is the full text of one page. When
   * provided, the chunker preserves page numbers in the output so citations
   * can resolve `[c{id}]` back to a page reference for the student.
   */
  pages?: string[];
}

export interface ChunkRecord {
  chunkIdx: number;
  text: string;
  pageNumber: number | null;
  tokenCount: number;
}

export interface ChunkerOptions {
  targetTokens?: number;
  overlapTokens?: number;
}

function approxTokenCount(text: string): number {
  return Math.max(1, Math.ceil(text.length / APPROX_CHARS_PER_TOKEN));
}

/**
 * Split a long text into paragraphs (double-newline boundary), then merge
 * paragraphs into chunks targeting `targetTokens`. Each chunk gets the last
 * `overlapTokens` worth of characters from the previous chunk prepended so
 * retrieval at a chunk boundary doesn't lose context.
 */
function chunkFlatText(
  text: string,
  pageNumber: number | null,
  startIdx: number,
  options: Required<ChunkerOptions>,
): ChunkRecord[] {
  const targetChars = options.targetTokens * APPROX_CHARS_PER_TOKEN;
  const overlapChars = options.overlapTokens * APPROX_CHARS_PER_TOKEN;
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const chunks: ChunkRecord[] = [];
  let buffer = '';
  let previousTail = '';

  const flush = () => {
    if (buffer.length < MIN_CHUNK_CHARS) {
      buffer = '';
      return;
    }
    const body = previousTail ? `${previousTail}\n\n${buffer}` : buffer;
    chunks.push({
      chunkIdx: startIdx + chunks.length,
      text: body,
      pageNumber,
      tokenCount: approxTokenCount(body),
    });
    previousTail = buffer.slice(-overlapChars);
    buffer = '';
  };

  for (const p of paragraphs) {
    if (buffer.length + p.length + 2 > targetChars && buffer.length > 0) {
      flush();
    }
    buffer = buffer ? `${buffer}\n\n${p}` : p;

    // Single mega-paragraph larger than target — split by sentence boundary.
    while (buffer.length > targetChars * 1.4) {
      const cutAt = buffer.lastIndexOf('. ', targetChars);
      const cut = cutAt > targetChars / 2 ? cutAt + 1 : targetChars;
      const slice = buffer.slice(0, cut).trim();
      const body = previousTail ? `${previousTail}\n\n${slice}` : slice;
      chunks.push({
        chunkIdx: startIdx + chunks.length,
        text: body,
        pageNumber,
        tokenCount: approxTokenCount(body),
      });
      previousTail = slice.slice(-overlapChars);
      buffer = buffer.slice(cut).trim();
    }
  }
  flush();
  return chunks;
}

/**
 * Top-level entry point. Accepts either raw text or a per-page array; in
 * either case returns the same ChunkRecord shape with monotonically
 * increasing `chunkIdx` matching the DB UNIQUE (material_id, chunk_idx).
 */
export function chunkMaterial(
  input: RawChunkInput,
  options: ChunkerOptions = {},
): ChunkRecord[] {
  const opts: Required<ChunkerOptions> = {
    targetTokens: options.targetTokens ?? DEFAULT_CHUNK_TOKENS,
    overlapTokens: options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS,
  };

  const pages = (input.pages?.length ?? 0) > 0
    ? input.pages!
    : input.text.split(/\f/);

  const records: ChunkRecord[] = [];
  for (let i = 0; i < pages.length; i++) {
    const pageText = pages[i].trim();
    if (!pageText) continue;
    const pageChunks = chunkFlatText(pageText, i + 1, records.length, opts);
    records.push(...pageChunks);
  }

  return records;
}
