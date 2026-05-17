// src/app/api/quiz/draft/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { withProtection } from '@/lib/api-middleware';
import { verifyToken } from '@/lib/jwt';
import { z } from 'zod';

const DraftAnswerSchema = z.object({
  quizId: z.string().optional(),
  selectedIndex: z.number().nullable(),
  reasoningNote: z.string().optional().default(''),
});

const SaveDraftSchema = z.object({
  leafSubtopicId: z.string().min(1, 'leafSubtopicId wajib diisi'),
  currentQuestionIdx: z.number().int().min(0),
  answers: z.array(DraftAnswerSchema),
});

function resolveUserId(req: NextRequest): string | null {
  const fromHeader = req.headers.get('x-user-id');
  if (fromHeader) return fromHeader;
  const token = req.cookies.get('access_token')?.value;
  if (!token) return null;
  const payload = verifyToken(token);
  return payload?.userId ?? null;
}

// GET /api/quiz/draft?leafId=<leafSubtopicId>
async function getHandler(req: NextRequest): Promise<NextResponse> {
  const userId = resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Autentikasi diperlukan' }, { status: 401 });
  }

  const leafId = req.nextUrl.searchParams.get('leafId');
  if (!leafId) {
    return NextResponse.json({ error: 'leafId wajib diisi' }, { status: 400 });
  }

  const { data, error } = await adminDb
    .from('quiz_drafts')
    .select('draft_state, updated_at')
    .eq('user_id', userId)
    .eq('leaf_subtopic_id', leafId)
    .maybeSingle();

  if (error) {
    console.error('[QuizDraft GET] DB error', error);
    return NextResponse.json({ error: 'Gagal mengambil draft' }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ draft: null }, { status: 404 });
  }

  return NextResponse.json({ draft: data.draft_state, updatedAt: data.updated_at });
}

// POST /api/quiz/draft — upsert idempotent
async function postHandler(req: NextRequest): Promise<NextResponse> {
  const userId = resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Autentikasi diperlukan' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Body tidak valid' }, { status: 400 });
  }

  const parsed = SaveDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Validasi gagal', details: parsed.error.issues },
      { status: 422 },
    );
  }

  const { leafSubtopicId, currentQuestionIdx, answers } = parsed.data;

  const draftState = {
    currentQuestionIdx,
    answers,
    savedAt: new Date().toISOString(),
  };

  // Upsert dengan ON CONFLICT DO UPDATE (via unique index di user_id+leaf_subtopic_id)
  const { error } = await adminDb.from('quiz_drafts').upsert(
    {
      user_id: userId,
      leaf_subtopic_id: leafSubtopicId,
      draft_state: draftState,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'user_id,leaf_subtopic_id' },
  );

  if (error) {
    console.error('[QuizDraft POST] Upsert failed', error);
    return NextResponse.json({ error: 'Gagal menyimpan draft' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, savedAt: draftState.savedAt });
}

// DELETE /api/quiz/draft?leafId=<leafSubtopicId>
async function deleteHandler(req: NextRequest): Promise<NextResponse> {
  const userId = resolveUserId(req);
  if (!userId) {
    return NextResponse.json({ error: 'Autentikasi diperlukan' }, { status: 401 });
  }

  const leafId = req.nextUrl.searchParams.get('leafId');
  if (!leafId) {
    return NextResponse.json({ error: 'leafId wajib diisi' }, { status: 400 });
  }

  const { error } = await adminDb
    .from('quiz_drafts')
    .eq('user_id', userId)
    .eq('leaf_subtopic_id', leafId)
    .delete();

  if (error) {
    console.error('[QuizDraft DELETE] Failed', error);
    return NextResponse.json({ error: 'Gagal menghapus draft' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

export const GET = withApiLogging(withProtection(getHandler), { label: 'quiz-draft-get', awaitLog: false });
export const POST = withApiLogging(withProtection(postHandler), { label: 'quiz-draft-save', awaitLog: false });
export const DELETE = withApiLogging(withProtection(deleteHandler), { label: 'quiz-draft-delete', awaitLog: false });
