// src/app/api/material-chunks/[id]/route.ts
//
// GET /api/material-chunks/[id]
// Returns chunk detail + surrounding context (prev/next chunk) for the
// RAG citation modal. Requires authenticated user (access_token cookie).
// Only accessible for chunks in Mode Penelitian materials.

import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';
import { withApiLogging } from '@/lib/api-logger';

interface MaterialChunkRow {
  id: string;
  chunk_idx: number;
  chunk_text: string;
  page_number: number | null;
  material_id: string;
}

interface MaterialRow {
  id: string;
  title: string;
  author: string | null;
  edition: string | null;
  source_url: string | null;
  template_topics: string[];
}

async function getHandler(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id: chunkId } = await params;

  if (!chunkId || typeof chunkId !== 'string') {
    return NextResponse.json({ error: 'Parameter chunk id tidak valid' }, { status: 400 });
  }

  // Auth: must be a logged-in user (student or admin)
  const accessToken = request.cookies.get('access_token')?.value;
  const tokenPayload = accessToken ? verifyToken(accessToken) : null;
  if (!tokenPayload) {
    return NextResponse.json({ error: 'Tidak terautentikasi' }, { status: 401 });
  }

  // Fetch the target chunk together with its parent material
  const { data: chunkRaw, error: chunkError } = await adminDb
    .from('material_chunks')
    .select('id, chunk_idx, chunk_text, page_number, material_id')
    .eq('id', chunkId)
    .maybeSingle();

  if (chunkError) {
    console.error('[material-chunks GET] chunk query error', chunkError);
    return NextResponse.json({ error: 'Gagal memuat chunk' }, { status: 500 });
  }

  const chunk = chunkRaw as MaterialChunkRow | null;
  if (!chunk) {
    return NextResponse.json({ error: 'Chunk tidak ditemukan' }, { status: 404 });
  }

  // Fetch parent material
  const { data: materialRaw, error: materialError } = await adminDb
    .from('materials')
    .select('id, title, author, edition, source_url, template_topics')
    .eq('id', chunk.material_id)
    .maybeSingle();

  if (materialError) {
    console.error('[material-chunks GET] material query error', materialError);
    return NextResponse.json({ error: 'Gagal memuat data materi' }, { status: 500 });
  }

  const material = materialRaw as MaterialRow | null;
  if (!material) {
    return NextResponse.json({ error: 'Materi induk tidak ditemukan' }, { status: 404 });
  }

  // Mode check: material must belong to at least one penelitian template topic.
  // template_topics is a VARCHAR(50)[] column (always an array).
  const PENELITIAN_TOPICS = [
    'mengenal-algoritma',
    'struktur-kendali',
    'memilih-algoritma',
    'struktur-data',
  ];
  const isResearchMaterial = Array.isArray(material.template_topics)
    && material.template_topics.some((t) => PENELITIAN_TOPICS.includes(t));

  if (!isResearchMaterial) {
    return NextResponse.json(
      { error: 'Chunk ini bukan bagian dari materi Mode Penelitian' },
      { status: 403 },
    );
  }

  // Fetch surrounding chunks (chunk_idx - 1 and chunk_idx + 1)
  const surroundingIdxs = [chunk.chunk_idx - 1, chunk.chunk_idx + 1].filter((i) => i >= 0);

  let prevChunkText: string | null = null;
  let nextChunkText: string | null = null;

  if (surroundingIdxs.length > 0) {
    const { data: surroundingRaw } = await adminDb
      .from('material_chunks')
      .select('chunk_idx, chunk_text')
      .eq('material_id', chunk.material_id)
      .in('chunk_idx', surroundingIdxs);

    const surroundingChunks = (surroundingRaw ?? []) as Array<{
      chunk_idx: number;
      chunk_text: string;
    }>;

    for (const sc of surroundingChunks) {
      if (sc.chunk_idx === chunk.chunk_idx - 1) prevChunkText = sc.chunk_text;
      if (sc.chunk_idx === chunk.chunk_idx + 1) nextChunkText = sc.chunk_text;
    }
  }

  return NextResponse.json({
    success: true,
    chunk: {
      chunkId: chunk.id,
      materialId: material.id,
      materialTitle: material.title,
      materialAuthor: material.author,
      materialEdition: material.edition,
      sourceUrl: material.source_url,
      pageNumber: chunk.page_number,
      chunkText: chunk.chunk_text,
      surroundingContext: {
        before: prevChunkText,
        after: nextChunkText,
      },
    },
  });
}

export const GET = withApiLogging(getHandler, { label: 'material-chunk-detail' });
