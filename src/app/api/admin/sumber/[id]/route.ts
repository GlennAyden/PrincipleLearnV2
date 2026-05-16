import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { requireAdminMutation, verifyAdminFromCookie } from '@/lib/admin-auth';
import { assertResearchModeOnly } from '@/lib/admin-mode';
import { parseBody } from '@/lib/schemas';

const TEMPLATE_TOPIC_VALUES = [
  'mengenal-algoritma',
  'struktur-kendali',
  'memilih-algoritma',
  'struktur-data',
] as const;

const PatchActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('validate') }),
  z.object({ action: z.literal('retire') }),
  z.object({
    action: z.literal('retag'),
    templateTopics: z.array(z.enum(TEMPLATE_TOPIC_VALUES)).min(1),
  }),
]);

function isUuid(value: string | undefined): value is string {
  if (!value) return false;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

async function getHandler(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;
  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid material id' }, { status: 400 });
  }

  const { data, error } = await adminDb
    .from('materials')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error) {
    console.error('[admin/sumber/:id GET] error', error);
    return NextResponse.json({ error: 'Gagal memuat materi.' }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: 'Materi tidak ditemukan.' }, { status: 404 });

  const { data: chunks } = await adminDb
    .from('material_chunks')
    .select('id, chunk_idx, page_number, token_count')
    .eq('material_id', id)
    .order('chunk_idx', { ascending: true });

  return NextResponse.json({ success: true, material: data, chunks: chunks ?? [] });
}

async function patchHandler(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;
  const csrfGuard = requireAdminMutation(req);
  if (csrfGuard) return csrfGuard;
  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid material id' }, { status: 400 });
  }

  const parsed = parseBody(PatchActionSchema, await req.json());
  if (!parsed.success) return parsed.response;
  const action = parsed.data;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = { updated_at: now };

  switch (action.action) {
    case 'validate':
      updates.validation_status = 'validated';
      updates.validated_by = admin.userId;
      updates.validated_at = now;
      break;
    case 'retire':
      updates.validation_status = 'retired';
      break;
    case 'retag':
      updates.template_topics = action.templateTopics;
      break;
  }

  const { error } = await adminDb
    .from('materials')
    .eq('id', id)
    .update(updates);

  if (error) {
    console.error('[admin/sumber/:id PATCH] update error', error);
    return NextResponse.json({ error: 'Gagal memperbarui materi.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, action: action.action });
}

async function deleteHandler(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;
  const csrfGuard = requireAdminMutation(req);
  if (csrfGuard) return csrfGuard;
  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid material id' }, { status: 400 });
  }

  // material_chunks is ON DELETE CASCADE so a single delete cascades.
  const { error } = await adminDb.from('materials').eq('id', id).delete();
  if (error) {
    console.error('[admin/sumber/:id DELETE] error', error);
    return NextResponse.json({ error: 'Gagal menghapus materi.' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}

export const GET    = withApiLogging(getHandler, { label: 'admin-sumber-detail' });
export const PATCH  = withApiLogging(patchHandler, { label: 'admin-sumber-patch' });
export const DELETE = withApiLogging(deleteHandler, { label: 'admin-sumber-delete' });
