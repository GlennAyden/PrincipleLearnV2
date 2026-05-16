import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { requireAdminMutation, verifyAdminFromCookie } from '@/lib/admin-auth';
import { assertResearchModeOnly } from '@/lib/admin-mode';
import { parseBody } from '@/lib/schemas';

/**
 * MVR Item 9.4 — interactive-blocks authoring API.
 *
 * GET: list all leaf-subtopiks across the 4 research-mode template courses
 *      with their current `interactive_blocks` payload + course/module context
 *      so the admin UI can render a per-course accordion.
 * PATCH: replace `interactive_blocks` for one leaf. We validate the array
 *        shape minimally (each entry must have `type` + `config`); deep
 *        per-component schema validation is left to the renderer, which
 *        fails gracefully on bad config rather than crashing the page.
 */

const KNOWN_BLOCK_TYPES = [
  'trace_table',
  'output_predictor',
  'parsons',
  'bug_hunt',
  'flowchart_builder',
  'block_builder',
] as const;

const InteractiveBlockShape = z.object({
  type: z.enum(KNOWN_BLOCK_TYPES),
  config: z.record(z.string(), z.unknown()),
});

const UpdateInteractiveBlocksSchema = z.object({
  leafId: z.string().uuid(),
  blocks: z.array(InteractiveBlockShape),
}).strict();

async function getHandler(req: NextRequest) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;

  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: courses, error: cErr } = await adminDb
    .from('courses')
    .select('id, title, template_topic')
    .eq('is_template', true)
    .eq('mode', 'research')
    .order('template_topic', { ascending: true });
  if (cErr) {
    console.error('[admin/sumber/interactive-blocks GET] courses error', cErr);
    return NextResponse.json({ error: 'Gagal memuat daftar course.' }, { status: 500 });
  }

  type CourseRow = { id: string; title: string; template_topic: string | null };
  const courseRows = (courses ?? []) as CourseRow[];
  const courseIds = courseRows.map((c) => c.id);
  if (courseIds.length === 0) {
    return NextResponse.json({ success: true, courses: [], leaves: [] });
  }

  const { data: leaves, error: lErr } = await adminDb
    .from('leaf_subtopics')
    .select('id, course_id, module_title, title, module_index, subtopic_index, interactive_blocks')
    .in('course_id', courseIds)
    .order('module_index', { ascending: true })
    .order('subtopic_index', { ascending: true });
  if (lErr) {
    console.error('[admin/sumber/interactive-blocks GET] leaves error', lErr);
    return NextResponse.json({ error: 'Gagal memuat daftar leaf-subtopik.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    courses: courseRows,
    leaves: leaves ?? [],
  });
}

async function patchHandler(req: NextRequest) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;

  const csrfGuard = requireAdminMutation(req);
  if (csrfGuard) return csrfGuard;

  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseBody(UpdateInteractiveBlocksSchema, await req.json());
  if (!parsed.success) return parsed.response;
  const { leafId, blocks } = parsed.data;

  const { error: updErr } = await adminDb
    .from('leaf_subtopics')
    .eq('id', leafId)
    .update({
      interactive_blocks: blocks,
      updated_at: new Date().toISOString(),
    });
  if (updErr) {
    console.error('[admin/sumber/interactive-blocks PATCH] update error', updErr);
    return NextResponse.json({ error: 'Gagal menyimpan interactive_blocks.' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    leafId,
    blockCount: blocks.length,
  });
}

export const GET = withApiLogging(getHandler, { label: 'admin-sumber-interactive-blocks-list' });
export const PATCH = withApiLogging(patchHandler, { label: 'admin-sumber-interactive-blocks-update' });
