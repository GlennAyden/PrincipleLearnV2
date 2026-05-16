import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { extractText } from 'unpdf';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { requireAdminMutation, verifyAdminFromCookie } from '@/lib/admin-auth';
import { assertResearchModeOnly } from '@/lib/admin-mode';
import { chunkMaterial, type ChunkRecord } from '@/services/material-chunker.service';
import { embedTexts } from '@/services/embedding.service';
import { parseBody } from '@/lib/schemas';

const TEMPLATE_TOPIC_VALUES = [
  'mengenal-algoritma',
  'struktur-kendali',
  'memilih-algoritma',
  'struktur-data',
] as const;

const UploadMaterialSchema = z.object({
  title: z.string().trim().min(1, 'title is required').max(255),
  author: z.string().trim().optional().nullable(),
  edition: z.string().trim().max(50).optional().nullable(),
  templateTopics: z
    .array(z.enum(TEMPLATE_TOPIC_VALUES))
    .min(1, 'Pilih minimal satu topik Fase E yang dicakup oleh materi'),
  sourceUrl: z.string().trim().url().optional().nullable(),
  storagePath: z.string().trim().min(1).optional().nullable(),
  fileSizeBytes: z.number().int().nonnegative().optional().nullable(),
  pageCount: z.number().int().nonnegative().optional().nullable(),
  // Either rawText OR pdfBase64 must be provided. When pdfBase64 is sent we
  // decode + extract per-page text on the server (unpdf, pure-ESM, runs on
  // Vercel). rawText path remains for power users who already have cleaned
  // pdftotext output.
  rawText: z
    .string()
    .trim()
    .min(200, 'rawText terlalu pendek; minimum 200 karakter')
    .optional(),
  pdfBase64: z.string().min(1000, 'pdfBase64 kosong atau terlalu kecil').optional(),
  // Optional: caller can pass pre-paginated text (one page per array entry)
  // to preserve per-page chunk references. Falls back to splitting rawText by
  // form-feed (\f) when omitted, or to unpdf's per-page extraction.
  pages: z.array(z.string()).optional(),
})
  .strict()
  .refine(
    (val) => Boolean(val.rawText) || Boolean(val.pdfBase64),
    { message: 'Wajib menyediakan salah satu: rawText atau pdfBase64' },
  );

interface PdfExtractionResult {
  rawText: string;
  pages: string[];
  pageCount: number;
}

async function extractPdfText(pdfBase64: string): Promise<PdfExtractionResult> {
  // Strip optional data URI prefix (data:application/pdf;base64,...).
  const cleaned = pdfBase64.replace(/^data:application\/pdf;base64,/, '');
  const buffer = Buffer.from(cleaned, 'base64');
  const data = new Uint8Array(buffer);
  const { totalPages, text } = await extractText(data, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text ?? '')];
  const rawText = pages.join('\n\f\n');
  return { rawText, pages, pageCount: totalPages };
}

async function getHandler(req: NextRequest) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;

  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const topic = searchParams.get('topic');
  const status = searchParams.get('status');

  let query = adminDb
    .from('materials')
    .select('id, title, author, edition, template_topics, source_url, storage_path, file_size_bytes, page_count, validation_status, validated_by, validated_at, uploaded_by, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (status && ['draft', 'validated', 'retired'].includes(status)) {
    query = query.eq('validation_status', status);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[admin/sumber GET] list error', error);
    return NextResponse.json({ error: 'Gagal memuat daftar materi.' }, { status: 500 });
  }

  // Filter by topic in JS — Supabase `contains` on array is a parameterized
  // operator the JS client supports via `.contains('template_topics', [topic])`
  // but mixing it with `select` chains has been flaky in this project so we
  // do the simple in-memory filter here. List is small (<100 rows expected).
  type MaterialRow = {
    template_topics: string[];
    [key: string]: unknown;
  };
  const rows = (data ?? []) as MaterialRow[];
  const filtered = topic
    ? rows.filter((r) => Array.isArray(r.template_topics) && r.template_topics.includes(topic))
    : rows;

  // Embed chunk counts via 1 grouped lookup so the UI can render "N chunks"
  // badge without N+1.
  const ids = filtered.map((r) => r.id as string);
  let chunkCountByMaterial = new Map<string, number>();
  if (ids.length > 0) {
    const { data: countRows } = await adminDb
      .from('material_chunks')
      .select('material_id')
      .in('material_id', ids);
    const counts = (countRows ?? []) as Array<{ material_id: string }>;
    chunkCountByMaterial = counts.reduce((acc, row) => {
      acc.set(row.material_id, (acc.get(row.material_id) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
  }

  const materials = filtered.map((row) => ({
    ...row,
    chunk_count: chunkCountByMaterial.get(row.id as string) ?? 0,
  }));

  return NextResponse.json({ success: true, materials });
}

async function postHandler(req: NextRequest) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;

  const csrfGuard = requireAdminMutation(req);
  if (csrfGuard) return csrfGuard;

  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseBody(UploadMaterialSchema, await req.json());
  if (!parsed.success) return parsed.response;
  const data = parsed.data;

  // If admin sent a PDF binary (base64), extract per-page text via unpdf.
  // Scan-only PDFs (image-only) produce near-empty text — we reject them so
  // the admin uses OCR offline rather than embedding ~0 useful tokens.
  let resolvedRawText = data.rawText ?? '';
  let resolvedPages: string[] | undefined = data.pages;
  let resolvedPageCount = data.pageCount ?? null;
  if (data.pdfBase64) {
    try {
      const extraction = await extractPdfText(data.pdfBase64);
      // Heuristic: <100 char per page on average suggests scan-only PDF.
      const avgChars = extraction.rawText.length / Math.max(1, extraction.pageCount);
      if (extraction.rawText.trim().length < 200 || avgChars < 40) {
        return NextResponse.json(
          {
            error: 'PDF tampak berbasis gambar (hasil ekstrak teks terlalu pendek). Lakukan OCR manual lalu unggah ulang sebagai rawText.',
          },
          { status: 400 },
        );
      }
      resolvedRawText = extraction.rawText;
      resolvedPages = extraction.pages;
      if (resolvedPageCount == null) resolvedPageCount = extraction.pageCount;
    } catch (pdfError) {
      console.error('[admin/sumber POST] pdf extract error', pdfError);
      return NextResponse.json(
        { error: 'Gagal membaca PDF. Pastikan file valid dan bukan PDF terenkripsi.' },
        { status: 400 },
      );
    }
  }

  // 1. Insert material row (draft) so we have an id for chunk inserts.
  const { data: inserted, error: insertError } = await adminDb
    .from('materials')
    .insert({
      title: data.title,
      author: data.author ?? null,
      edition: data.edition ?? null,
      template_topics: data.templateTopics,
      source_url: data.sourceUrl ?? null,
      // storage_path is required by schema; if no upload happened use a
      // synthetic marker so the row inserts. Real PDF uploads will populate
      // this with the Supabase Storage object key.
      storage_path: data.storagePath ?? `inline://${Date.now()}`,
      file_size_bytes: data.fileSizeBytes ?? null,
      page_count: resolvedPageCount,
      validation_status: 'draft',
      uploaded_by: admin.userId,
    });

  const insertedRow = inserted as { id?: string } | null;
  const materialId = insertedRow?.id;
  if (insertError || !materialId) {
    console.error('[admin/sumber POST] insert error', insertError);
    return NextResponse.json({ error: 'Gagal menyimpan metadata materi.' }, { status: 500 });
  }

  // 2. Chunk the raw text. The chunker handles form-feed pagination if the
  // admin pasted output from `pdftotext -layout`, or uses the per-page array
  // produced by unpdf when a PDF was uploaded.
  let chunks: ChunkRecord[];
  try {
    chunks = chunkMaterial({ text: resolvedRawText, pages: resolvedPages });
  } catch (chunkError) {
    console.error('[admin/sumber POST] chunk error', chunkError);
    return NextResponse.json({ error: 'Gagal memecah teks menjadi chunk.' }, { status: 500 });
  }

  if (chunks.length === 0) {
    // Roll back the materials row — empty corpus is not useful.
    await adminDb.from('materials').eq('id', materialId).delete();
    return NextResponse.json(
      { error: 'Tidak ada chunk yang dihasilkan dari teks (mungkin terlalu pendek atau hanya whitespace).' },
      { status: 400 },
    );
  }

  // 3. Embed chunks in batches and bulk-insert. We tolerate partial failure
  // by deleting the materials row so the admin can re-upload; OpenAI charges
  // are unavoidable since some calls may have already succeeded.
  let embeddings;
  try {
    embeddings = await embedTexts(chunks.map((c) => c.text));
  } catch (embedError) {
    console.error('[admin/sumber POST] embed error', embedError);
    await adminDb.from('materials').eq('id', materialId).delete();
    return NextResponse.json(
      { error: 'Gagal memanggil OpenAI untuk embedding. Materi tidak disimpan.' },
      { status: 502 },
    );
  }

  const chunkRows = chunks.map((c) => ({
    material_id: materialId,
    chunk_idx: c.chunkIdx,
    chunk_text: c.text,
    page_number: c.pageNumber,
    token_count: c.tokenCount,
    embedding: embeddings[c.chunkIdx]?.embedding ?? null,
  }));

  // Supabase JS does not chunk inserts itself — we batch 100 at a time to
  // stay under the default 1MB request body limit on large corpora.
  const INSERT_BATCH = 100;
  for (let i = 0; i < chunkRows.length; i += INSERT_BATCH) {
    const slice = chunkRows.slice(i, i + INSERT_BATCH);
    const { error: chunkInsertError } = await adminDb
      .from('material_chunks')
      .insert(slice);
    if (chunkInsertError) {
      console.error('[admin/sumber POST] chunk insert error', chunkInsertError);
      await adminDb.from('material_chunks').eq('material_id', materialId).delete();
      await adminDb.from('materials').eq('id', materialId).delete();
      return NextResponse.json(
        { error: 'Gagal menyimpan chunk ke database. Materi dirollback.' },
        { status: 500 },
      );
    }
  }

  // Approximate embedding cost: text-embedding-3-small = $0.02 / 1M tokens.
  // Surface this so the admin sees what the upload cost.
  const totalTokens = chunks.reduce((sum, c) => sum + c.tokenCount, 0);
  const estimatedCostUsd = (totalTokens / 1_000_000) * 0.02;

  return NextResponse.json({
    success: true,
    materialId,
    summary: {
      chunk_count: chunks.length,
      total_tokens: totalTokens,
      estimated_cost_usd: Number(estimatedCostUsd.toFixed(4)),
      template_topics: data.templateTopics,
    },
  });
}

export const GET = withApiLogging(getHandler, { label: 'admin-sumber-list' });
export const POST = withApiLogging(postHandler, { label: 'admin-sumber-upload' });
