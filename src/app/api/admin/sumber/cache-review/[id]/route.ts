import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { requireAdminMutation, verifyAdminFromCookie } from '@/lib/admin-auth';
import { assertResearchModeOnly } from '@/lib/admin-mode';
import { parseBody } from '@/lib/schemas';

const isUuid = (v: string | undefined): v is string =>
  !!v && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const PatchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'),         qaNotes: z.string().optional() }),
  z.object({ action: z.literal('request_revision'), qaNotes: z.string().min(1) }),
  z.object({ action: z.literal('reject'),          qaNotes: z.string().min(1) }),
  z.object({
    action: z.literal('edit'),
    contentMarkdown: z.string().trim().min(40, 'Konten terlalu pendek (minimum 40 karakter)'),
    qaNotes: z.string().optional(),
  }),
]);

async function patchHandler(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;
  const csrfGuard = requireAdminMutation(req);
  if (csrfGuard) return csrfGuard;

  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await ctx.params;
  if (!isUuid(id)) {
    return NextResponse.json({ error: 'Invalid cache row id' }, { status: 400 });
  }

  const parsed = parseBody(PatchSchema, await req.json());
  if (!parsed.success) return parsed.response;
  const action = parsed.data;

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    qa_reviewed_by: admin.userId,
    qa_reviewed_at: now,
    updated_at: now,
  };

  switch (action.action) {
    case 'approve':
      updates.qa_status = 'approved';
      if (action.qaNotes) updates.qa_notes = action.qaNotes;
      break;
    case 'request_revision':
      updates.qa_status = 'needs_revision';
      updates.qa_notes = action.qaNotes;
      break;
    case 'reject':
      updates.qa_status = 'rejected';
      updates.qa_notes = action.qaNotes;
      break;
    case 'edit': {
      // Replace the markdown body, then mark approved. Existing source_chunk_ids
      // and generation_seed are preserved as provenance even though the human
      // edited the body — we add a flag in content to mark the override.
      const { data: existingRow } = await adminDb
        .from('subtopic_cache')
        .select('content')
        .eq('id', id)
        .maybeSingle();
      const existingContent = (existingRow?.content && typeof existingRow.content === 'object')
        ? (existingRow.content as Record<string, unknown>)
        : {};
      updates.content = {
        ...existingContent,
        markdown: action.contentMarkdown,
        human_edited: true,
        edited_at: now,
      };
      updates.qa_status = 'approved';
      if (action.qaNotes) updates.qa_notes = action.qaNotes;
      break;
    }
  }

  const { error } = await adminDb
    .from('subtopic_cache')
    .eq('id', id)
    .update(updates);

  if (error) {
    console.error('[admin/sumber/cache-review PATCH] update error', error);
    return NextResponse.json({ error: 'Gagal memperbarui status review.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, action: action.action });
}

export const PATCH = withApiLogging(patchHandler, { label: 'admin-sumber-cache-review-patch' });
