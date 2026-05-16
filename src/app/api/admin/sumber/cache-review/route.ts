import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import { assertResearchModeOnly } from '@/lib/admin-mode';

/**
 * MVR Item 4b — list pending/needs-revision research subtopic cache rows so
 * the researcher can approve / reject / edit before students see the content.
 */
async function getHandler(req: NextRequest) {
  const guard = assertResearchModeOnly(req);
  if (guard) return guard;

  const admin = verifyAdminFromCookie(req);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const statusFilter = searchParams.get('status');
  const allowedStatuses = ['pending', 'approved', 'needs_revision', 'rejected'];

  let query = adminDb
    .from('subtopic_cache')
    .select('id, cache_key, content, mode, locked, qa_status, qa_notes, source_chunk_ids, generation_seed, generated_by, qa_reviewed_by, qa_reviewed_at, created_at, updated_at')
    .eq('mode', 'research')
    .order('created_at', { ascending: false });

  if (statusFilter && allowedStatuses.includes(statusFilter)) {
    query = query.eq('qa_status', statusFilter);
  } else {
    // Default to non-approved rows so the queue is meaningful.
    query = query.in('qa_status', ['pending', 'needs_revision']);
  }

  const { data, error } = await query;
  if (error) {
    console.error('[admin/sumber/cache-review GET] error', error);
    return NextResponse.json({ error: 'Gagal memuat queue review.' }, { status: 500 });
  }

  return NextResponse.json({ success: true, rows: data ?? [] });
}

export const GET = withApiLogging(getHandler, { label: 'admin-sumber-cache-review-list' });
