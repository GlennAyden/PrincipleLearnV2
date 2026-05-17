// src/app/api/courses/[id]/retry-failed/route.ts
//
// A4 — Retry circuit breaker endpoint.
// Finds all leaf_subtopics with generation_status='pending_retry' for a given
// course and re-triggers generate-subtopic generation for each one.
// Auth: course owner only (or admin).

import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logger';
import { withProtection } from '@/lib/api-middleware';
import { resolveAuthContext } from '@/lib/auth-helper';
import { adminDb } from '@/lib/database';
import { getCourseById, canAccessCourse } from '@/services/course.service';
import { apiFetch } from '@/lib/api-client';

interface LeafRow {
  id: string;
  course_id: string;
  module_id: string | null;
  module_title: string | null;
  title: string | null;
  module_index: number | null;
  subtopic_index: number | null;
  generation_status: string;
}

async function corePostHandler(req: NextRequest, courseId: string) {
  const authCtx = resolveAuthContext(req);
  const userId = authCtx?.userId ?? req.headers.get('x-user-id');
  const userRole = authCtx?.role ?? req.headers.get('x-user-role') ?? undefined;

  if (!userId) {
    return NextResponse.json({ error: 'Autentikasi diperlukan' }, { status: 401 });
  }

  // Verify course ownership
  const course = await getCourseById(courseId);
  if (!course) {
    return NextResponse.json({ error: 'Kursus tidak ditemukan' }, { status: 404 });
  }
  if (!canAccessCourse(course, userId, userRole)) {
    return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
  }

  // Query all leaves with pending_retry or failed status
  const { data: leaves, error: queryErr } = await adminDb
    .from('leaf_subtopics')
    .select('id, course_id, module_id, module_title, title, module_index, subtopic_index, generation_status')
    .eq('course_id', courseId)
    .in('generation_status', ['pending_retry', 'failed']);

  if (queryErr) {
    console.error('[RetryFailed] Query error:', queryErr);
    return NextResponse.json({ error: 'Gagal query database' }, { status: 500 });
  }

  if (!leaves || leaves.length === 0) {
    return NextResponse.json({ retriedCount: 0, message: 'Tidak ada subtopik yang perlu di-retry' });
  }

  console.log(`[RetryFailed] Retrying ${leaves.length} leaves for course ${courseId}`);

  // Mark all as 'generating' before kicking off requests.
  // SupabaseQueryBuilder.update() must be called at the end of the filter
  // chain; loop per-ID to avoid the .in().update() TypeScript issue.
  const leafIds = (leaves as LeafRow[]).map((l) => l.id);
  await Promise.allSettled(
    leafIds.map((lid) =>
      adminDb
        .from('leaf_subtopics')
        .eq('id', lid)
        .update({ generation_status: 'generating' }),
    ),
  );

  // Re-trigger generate-subtopic for each leaf (fire-and-forget per leaf,
  // capture failures to mark back to pending_retry rather than crashing).
  // We call the internal API route rather than the service function directly
  // so CSRF + auth is correctly threaded from the original request cookies.
  const results = await Promise.allSettled(
    (leaves as LeafRow[]).map(async (leaf) => {
      const moduleId = leaf.module_id;
      const moduleTitle = leaf.module_title ?? '';
      const subtopicTitle = leaf.title ?? '';

      if (!moduleId || !subtopicTitle || !moduleTitle) {
        // Cannot retry without minimum identifiers — mark failed
        await adminDb
          .from('leaf_subtopics')
          .eq('id', leaf.id)
          .update({ generation_status: 'failed', updated_at: new Date().toISOString() });
        return { id: leaf.id, status: 'skipped' };
      }

      try {
        // Forward the caller's cookies so the internal generate-subtopic route
        // receives a valid auth context (CSRF + JWT).
        const cookieHeader = req.headers.get('cookie') ?? '';
        const csrfCookie = cookieHeader.match(/csrf_token=([^;]+)/)?.[1] ?? '';

        const res = await apiFetch('/api/generate-subtopic', {
          method: 'POST',
          headers: {
            'x-csrf-token': csrfCookie,
            cookie: cookieHeader,
          },
          body: JSON.stringify({
            module: moduleTitle,
            subtopic: subtopicTitle,
            courseId,
            moduleId,
            moduleIndex: leaf.module_index,
            subtopicIndex: leaf.subtopic_index,
          }),
        });

        if (res.ok) {
          // generate-subtopic succeeded; update status to completed
          await adminDb
            .from('leaf_subtopics')
            .eq('id', leaf.id)
            .update({ generation_status: 'completed', updated_at: new Date().toISOString() });
          return { id: leaf.id, status: 'ok' };
        } else {
          // Failed again; generate-subtopic's own catch will mark pending_retry
          // but we also do it here for belt-and-suspenders.
          await adminDb
            .from('leaf_subtopics')
            .eq('id', leaf.id)
            .update({ generation_status: 'pending_retry', updated_at: new Date().toISOString() });
          return { id: leaf.id, status: 'failed' };
        }
      } catch (err) {
        console.error(`[RetryFailed] Leaf ${leaf.id} retry threw:`, err);
        await adminDb
          .from('leaf_subtopics')
          .eq('id', leaf.id)
          .update({ generation_status: 'pending_retry', updated_at: new Date().toISOString() });
        return { id: leaf.id, status: 'error' };
      }
    }),
  );

  const succeeded = results.filter(
    (r) => r.status === 'fulfilled' && (r.value as { status: string }).status === 'ok',
  ).length;
  const failed = results.length - succeeded;

  return NextResponse.json({
    retriedCount: results.length,
    succeeded,
    failed,
    message: `${succeeded}/${results.length} subtopik berhasil di-generate ulang`,
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  if (!courseId) {
    return NextResponse.json({ error: 'courseId required' }, { status: 400 });
  }
  const handler = withApiLogging(
    withProtection((r: NextRequest) => corePostHandler(r, courseId)),
    { label: 'courses-retry-failed' },
  );
  return handler(req);
}
