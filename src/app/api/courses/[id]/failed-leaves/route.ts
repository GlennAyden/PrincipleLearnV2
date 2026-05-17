// src/app/api/courses/[id]/failed-leaves/route.ts
//
// A4 — Returns count of leaf_subtopics with generation_status in
// ('pending_retry', 'failed') for a given course.
// Used by RetryBanner to decide whether to show the warning.

import { NextRequest, NextResponse } from 'next/server';
import { withApiLogging } from '@/lib/api-logger';
import { withProtection } from '@/lib/api-middleware';
import { resolveAuthContext } from '@/lib/auth-helper';
import { adminDb } from '@/lib/database';
import { getCourseById, canAccessCourse } from '@/services/course.service';

async function coreHandler(
  req: NextRequest,
  courseId: string,
) {
  const authCtx = resolveAuthContext(req);
  const userId = authCtx?.userId ?? req.headers.get('x-user-id');
  const userRole = authCtx?.role ?? req.headers.get('x-user-role') ?? undefined;

  if (!userId) {
    return NextResponse.json({ error: 'Autentikasi diperlukan' }, { status: 401 });
  }

  const course = await getCourseById(courseId);
  if (!course) {
    return NextResponse.json({ count: 0 });
  }
  if (!canAccessCourse(course, userId, userRole)) {
    return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
  }

  const { count, error } = await adminDb
    .from('leaf_subtopics')
    .select('id', { count: 'exact', head: true })
    .eq('course_id', courseId)
    .in('generation_status', ['pending_retry', 'failed']);

  if (error) {
    console.error('[FailedLeaves] Query error:', error);
    return NextResponse.json({ count: 0 });
  }

  return NextResponse.json(
    { count: count ?? 0 },
    {
      headers: {
        // Short cache — the banner needs to reflect fresh state after a retry
        'Cache-Control': 'private, max-age=30',
      },
    },
  );
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: courseId } = await params;
  if (!courseId) {
    return NextResponse.json({ error: 'courseId required' }, { status: 400 });
  }
  const handler = withApiLogging(
    withProtection((r: NextRequest) => coreHandler(r, courseId)),
    { label: 'courses-failed-leaves' },
  );
  return handler(req);
}
