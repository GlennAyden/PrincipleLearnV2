/**
 * MVR Item 4b — Subtopic cache lock + QA workflow for Mode Penelitian.
 *
 * Goal: research subtopik content must be byte-identical across all students
 * (validity of RM2/RM3 longitudinal analysis depends on every participant
 * seeing the same prompt + same scaffolded content). To achieve this we:
 *
 *   1. Only the FIRST student to access a given (courseId, leafSubtopicId)
 *      pair triggers generation; the row is inserted with `qa_status='pending'`
 *      and `locked=true`.
 *   2. Subsequent students see CONTENT_UNDER_REVIEW until the researcher
 *      approves the row via /api/admin/sumber/cache-review.
 *   3. Once approved, all students return the same `content` payload.
 *
 * Generation pulls top-k chunks from the bank sumber for the course's
 * `template_topic` (Item 4), then asks the AI to write 3-5 paragraph
 * exposition + 4-6 key takeaways, all sourced from the chunks.
 *
 * Note on `cache_key`: we reuse the existing format `${courseId}::${module}::${leaf}`
 * via buildSubtopicCacheKey from quiz-content.ts to stay consistent with the
 * pre-existing general-mode cache.
 */

import crypto from 'crypto';
import { adminDb } from '@/lib/database';
import { chatCompletionWithRetry, sanitizePromptInput } from '@/services/ai.service';
import { retrieveContext, renderSourcesForPrompt } from '@/services/rag.service';

export type ResearchCacheStatus = 'pending' | 'approved' | 'needs_revision' | 'rejected';

export interface ResearchCacheRow {
  id: string;
  cache_key: string;
  content: unknown;
  mode: string;
  locked: boolean;
  qa_status: ResearchCacheStatus;
  qa_notes: string | null;
  source_chunk_ids: string[];
  generation_seed: string | null;
  generated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type GetOrGenerateResult =
  | { status: 'approved'; row: ResearchCacheRow }
  | { status: 'under_review'; row: ResearchCacheRow }
  | { status: 'generated'; row: ResearchCacheRow }
  | { status: 'error'; error: string };

export interface ResearchGenerationInputs {
  cacheKey: string;
  courseId: string;
  templateTopic: string;
  leafTitle: string;
  moduleTitle: string;
  userId: string;
}

const SYSTEM_PROMPT_KONTEN = `Anda adalah penulis materi pembelajaran kurikulum SMA Fase E (Mushthofa dkk. 2023, Kemdikbudristek).

Tugas: tulis konten ekspositoris berbasis sumber untuk subtopik yang diberikan, mengikuti format berikut PERSIS:
1. 3-5 paragraf inti (tiap paragraf 60-90 kata). Setiap klaim faktual WAJIB diikuti citation [c{uuid}] yang merujuk salah satu <source>.
2. Setelah paragraf, beri bagian "**Poin Kunci**" berisi 4-6 bullet ringkas, juga dengan citation.
3. Bahasa: Indonesia, gaya buku ajar SMA. Hindari jargon yang tidak ada di <source>.

Aturan ketat:
- Jawab HANYA berdasarkan isi <source>. Jika sumber tidak cukup, tulis "[BUTUH SUMBER TAMBAHAN]" pada bagian yang kurang.
- Jangan menyalin lebih dari 25 kata berturut-turut dari satu sumber.
- Output BUKAN JSON — keluaran berupa Markdown siap-pakai.`;

export async function getOrGenerateResearchSubtopicContent(
  input: ResearchGenerationInputs,
): Promise<GetOrGenerateResult> {
  // 1. Check existing row for this cache_key in research mode.
  const { data: existingRaw } = await adminDb
    .from('subtopic_cache')
    .select('id, cache_key, content, mode, locked, qa_status, qa_notes, source_chunk_ids, generation_seed, generated_by, created_at, updated_at')
    .eq('cache_key', input.cacheKey)
    .eq('mode', 'research')
    .maybeSingle();

  const existing = (existingRaw as ResearchCacheRow | null) ?? null;

  if (existing) {
    if (existing.qa_status === 'approved') {
      return { status: 'approved', row: existing };
    }
    // Pending or rejected — block student access until researcher decides.
    return { status: 'under_review', row: existing };
  }

  // 2. No row yet — generate.
  const retrieval = await retrieveContext({
    query: `${input.moduleTitle}. ${input.leafTitle}`,
    templateTopic: input.templateTopic,
    k: 8,
    threshold: 0.55,
  });

  if (retrieval.chunks.length === 0) {
    return {
      status: 'error',
      error: 'Bank sumber kosong untuk topik ini. Admin perlu mengunggah materi tervalidasi terlebih dahulu.',
    };
  }

  // Deterministic seed marker (sha256 hex slice). gpt-5-mini does not expose
  // a seed param so we cannot enforce byte-equality at the API level; we keep
  // the value as a provenance tag in the row so we can detect re-generations.
  const seedHash = crypto.createHash('sha256').update(input.cacheKey).digest('hex').slice(0, 16);

  const sourcesXml = renderSourcesForPrompt(retrieval.chunks);
  const userMessage = `<request>
Tulis konten subtopik berbasis kurikulum untuk:
- Modul: ${sanitizePromptInput(input.moduleTitle, 200)}
- Sub-topik: ${sanitizePromptInput(input.leafTitle, 200)}
- Slug kurikulum: ${input.templateTopic}
</request>

${sourcesXml}

Patuhi format yang diminta di system prompt. Setiap klaim faktual harus punya citation [c{uuid}] yang merujuk salah satu <source> di atas.`;

  let aiResponse;
  try {
    aiResponse = await chatCompletionWithRetry({
      messages: [
        { role: 'system', content: SYSTEM_PROMPT_KONTEN },
        { role: 'user', content: userMessage },
      ],
      maxTokens: 1800,
      timeoutMs: 60_000,
      maxAttempts: 2,
    });
  } catch (error) {
    console.error('[subtopic-cache-research] AI generation failed', error);
    return {
      status: 'error',
      error: 'Gagal memanggil AI untuk membuat konten subtopik. Coba lagi nanti.',
    };
  }

  const content = aiResponse.choices?.[0]?.message?.content?.trim() ?? '';
  if (!content) {
    return { status: 'error', error: 'AI mengembalikan konten kosong. Hubungi peneliti.' };
  }

  const sourceChunkIds = retrieval.chunks.map((c) => c.chunkId);
  const now = new Date().toISOString();

  // 3. Insert with qa_status='pending', locked=true.
  const { data: insertedRow, error: insertError } = await adminDb
    .from('subtopic_cache')
    .insert({
      cache_key: input.cacheKey,
      content: { markdown: content, generated_at: now },
      mode: 'research',
      locked: true,
      qa_status: 'pending',
      source_chunk_ids: sourceChunkIds,
      generation_seed: seedHash,
      generated_by: input.userId,
      created_at: now,
      updated_at: now,
    });

  if (insertError) {
    console.error('[subtopic-cache-research] insert error', insertError);
    return { status: 'error', error: 'Gagal menyimpan konten ke cache.' };
  }

  // Race-condition recovery: if another request beat us to the insert, refetch.
  const insertedId = (insertedRow as { id?: string } | null)?.id;
  if (!insertedId) {
    const { data: raced } = await adminDb
      .from('subtopic_cache')
      .select('id, cache_key, content, mode, locked, qa_status, qa_notes, source_chunk_ids, generation_seed, generated_by, created_at, updated_at')
      .eq('cache_key', input.cacheKey)
      .eq('mode', 'research')
      .maybeSingle();
    if (raced) return { status: 'under_review', row: raced as ResearchCacheRow };
    return { status: 'error', error: 'Insert gagal tanpa kembali baris.' };
  }

  return {
    status: 'generated',
    row: {
      id: insertedId,
      cache_key: input.cacheKey,
      content: { markdown: content, generated_at: now },
      mode: 'research',
      locked: true,
      qa_status: 'pending',
      qa_notes: null,
      source_chunk_ids: sourceChunkIds,
      generation_seed: seedHash,
      generated_by: input.userId,
      created_at: now,
      updated_at: now,
    },
  };
}
