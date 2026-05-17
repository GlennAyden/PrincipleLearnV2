import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext } from '@/lib/auth-helper';
import { adminDb } from '@/lib/database';

export interface ContinueLearningData {
  courseId: string;
  courseName: string;
  subtopicId: string | null;
  lastLeafTitle: string | null;
  lastAccessedAt: string;
  continueUrl: string;
}

/**
 * GET /api/user/continue
 *
 * Returns the most recently accessed learning location for the authenticated
 * user so the dashboard can show a "Continue Learning" hero card.
 *
 * Strategy:
 *   1. Find the user_progress row with the latest updated_at (any course).
 *   2. Join to courses to get the course name.
 *   3. Attempt to resolve a subtopic title from the subtopics table.
 *   4. Build a direct URL: /course/{courseId}/subtopic/{subIdx}/{pageIdx=0}
 *      falling back to /course/{courseId} when we can't resolve the indices.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const auth = resolveAuthContext(req);
  if (!auth?.userId) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  try {
    // ── 1. Most recent user_progress row ────────────────────────────────────
    const { data: progressRows, error: progressErr } = await adminDb
      .from('user_progress')
      .select('course_id, subtopic_id, updated_at')
      .eq('user_id', auth.userId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (progressErr) {
      console.error('[continue] user_progress query failed', progressErr);
      return NextResponse.json({ error: 'Failed to load progress' }, { status: 500 });
    }

    if (!progressRows || progressRows.length === 0) {
      return NextResponse.json({ data: null });
    }

    const latest = progressRows[0] as {
      course_id: string;
      subtopic_id: string | null;
      updated_at: string;
    };

    // ── 2. Course name ───────────────────────────────────────────────────────
    const { data: courseRow, error: courseErr } = await adminDb
      .from('courses')
      .select('id, title')
      .eq('id', latest.course_id)
      .maybeSingle();

    if (courseErr || !courseRow) {
      return NextResponse.json({ data: null });
    }

    const course = courseRow as { id: string; title: string };

    // ── 3. Subtopic info & index ─────────────────────────────────────────────
    let lastLeafTitle: string | null = null;
    let subtopicOrderIndex: number | null = null;

    if (latest.subtopic_id) {
      const { data: subRow } = await adminDb
        .from('subtopics')
        .select('title, order_index')
        .eq('id', latest.subtopic_id)
        .maybeSingle();

      if (subRow) {
        const s = subRow as { title: string; order_index: number | null };
        lastLeafTitle = s.title;
        subtopicOrderIndex = s.order_index;
      }
    }

    // ── 4. Build continue URL ────────────────────────────────────────────────
    // Route pattern: /course/{courseId}/subtopic/{subIdx}/{pageIdx}
    // subIdx is 1-based (order_index stored 0-based → add 1 for URL segment).
    let continueUrl = `/course/${course.id}`;
    if (subtopicOrderIndex !== null) {
      continueUrl = `/course/${course.id}/subtopic/${subtopicOrderIndex + 1}/0`;
    }

    const payload: ContinueLearningData = {
      courseId: course.id,
      courseName: course.title,
      subtopicId: latest.subtopic_id,
      lastLeafTitle,
      lastAccessedAt: latest.updated_at,
      continueUrl,
    };

    return NextResponse.json({ data: payload });
  } catch (err) {
    console.error('[continue] unexpected error', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
