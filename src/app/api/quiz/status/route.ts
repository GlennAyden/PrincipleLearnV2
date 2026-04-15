// src/app/api/quiz/status/route.ts
// GET /api/quiz/status?courseId=X&subtopicTitle=Y
// Returns whether the authenticated user has completed a quiz for the subtopic,
// plus summary of their latest attempt.

import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { verifyToken } from '@/lib/jwt';
import { resolveUserByIdentifier } from '@/services/auth.service';
import { QuizStatusSchema, parseBody } from '@/lib/schemas';
import { assertCourseOwnership, toOwnershipError } from '@/lib/ownership';
import { apiRateLimiter } from '@/lib/rate-limit';

interface SubmissionRow {
  attempt_number: number;
  quiz_attempt_id: string;
  is_correct: boolean;
  created_at: string;
}

async function getHandler(req: NextRequest) {
  // Rate-limit BEFORE any DB work so abusive polling short-circuits cheaply.
  // Keyed off the middleware-injected user id when present, otherwise a
  // stable 'anonymous' bucket — unauthenticated callers are caught by the
  // auth check below regardless.
  const rateLimitKey = req.headers.get('x-user-id') ?? 'anonymous';
  if (!(await apiRateLimiter.isAllowed(rateLimitKey))) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429 });
  }

  // Prefer middleware-injected header; fall back to the JWT cookie directly.
  // The header injection has proven unreliable in production (likely a Next.js
  // middleware→handler header-propagation quirk), so we mirror the
  // cookie-based pattern used by /api/challenge-response, /api/ask-question, etc.
  let authUserId = req.headers.get('x-user-id');
  let authUserRole = req.headers.get('x-user-role') ?? undefined;
  if (!authUserId) {
    const accessToken = req.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;
    if (tokenPayload?.userId) {
      authUserId = tokenPayload.userId;
      authUserRole = authUserRole ?? tokenPayload.role;
    }
  }
  if (!authUserId) {
    return NextResponse.json({ error: 'Autentikasi diperlukan' }, { status: 401 });
  }

  // Validate query params via Zod — mirrors the parseBody() pattern used by
  // POST routes, adapted for URLSearchParams.
  const { searchParams } = new URL(req.url);
  const rawQuery = {
    courseId: searchParams.get('courseId') ?? undefined,
    subtopicTitle: searchParams.get('subtopicTitle') ?? undefined,
    moduleTitle: searchParams.get('moduleTitle') ?? undefined,
  };
  const parsed = parseBody(QuizStatusSchema, rawQuery);
  if (!parsed.success) return parsed.response;
  const { courseId, subtopicTitle, moduleTitle } = parsed.data;

  // Ownership check — prevents scanning status for arbitrary course IDs.
  try {
    await assertCourseOwnership(authUserId, courseId, authUserRole);
  } catch (ownershipErr) {
    const asOwnership = toOwnershipError(ownershipErr);
    if (asOwnership) {
      return NextResponse.json(
        { error: asOwnership.message },
        { status: asOwnership.status },
      );
    }
    throw ownershipErr;
  }

  const user = await resolveUserByIdentifier(authUserId);
  if (!user) {
    return NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 });
  }

  // subtopics table is keyed per MODULE — prefer moduleTitle lookup, then
  // fall back to subtopicTitle for older callers that don't send moduleTitle.
  let subtopicId: string | null = null;
  const trimmedModuleTitle = moduleTitle?.trim() ?? '';
  const trimmedSubtopicLabel = subtopicTitle?.trim() ?? '';

  if (trimmedModuleTitle) {
    try {
      const { data: moduleRow } = await adminDb
        .from('subtopics')
        .select('id')
        .eq('course_id', courseId)
        .ilike('title', trimmedModuleTitle)
        .maybeSingle();
      subtopicId = (moduleRow as { id?: string } | null)?.id ?? null;
    } catch (lookupError) {
      console.warn('[QuizStatus] Module row lookup failed', lookupError);
    }
  }

  if (!subtopicId && trimmedSubtopicLabel) {
    try {
      const { data: sub } = await adminDb
        .from('subtopics')
        .select('id')
        .eq('course_id', courseId)
        .ilike('title', trimmedSubtopicLabel)
        .maybeSingle();
      subtopicId = (sub as { id?: string } | null)?.id ?? null;
    } catch (lookupError) {
      console.warn('[QuizStatus] Subtopic lookup failed', lookupError);
    }
  }

  if (!subtopicId) {
    return NextResponse.json({
      completed: false,
      attemptCount: 0,
      latest: null,
    });
  }

  try {
    // Scope by subtopic_label so sibling subtopics inside the same module
    // show independent completion state. Fall back gracefully when the
    // column is missing (pre-migration env).
    const submissionsQuery = adminDb
      .from('quiz_submissions')
      .select('attempt_number, quiz_attempt_id, is_correct, created_at')
      .eq('user_id', user.id)
      .eq('subtopic_id', subtopicId);

    let submissions: unknown = null;
    let error: unknown = null;

    if (trimmedSubtopicLabel) {
      const scopedResult = await submissionsQuery
        .eq('subtopic_label', trimmedSubtopicLabel)
        .order('attempt_number', { ascending: false });
      if (scopedResult.error) {
        console.warn('[QuizStatus] subtopic_label filter failed, falling back', scopedResult.error);
        const fallbackResult = await adminDb
          .from('quiz_submissions')
          .select('attempt_number, quiz_attempt_id, is_correct, created_at')
          .eq('user_id', user.id)
          .eq('subtopic_id', subtopicId)
          .order('attempt_number', { ascending: false });
        submissions = fallbackResult.data;
        error = fallbackResult.error;
      } else {
        submissions = scopedResult.data;
        error = null;
      }
    } else {
      const plainResult = await submissionsQuery.order('attempt_number', { ascending: false });
      submissions = plainResult.data;
      error = plainResult.error;
    }

    if (error) {
      console.warn('[QuizStatus] Query failed', error);
      return NextResponse.json({
        completed: false,
        attemptCount: 0,
        latest: null,
      });
    }

    const rows = (submissions as SubmissionRow[] | null) ?? [];
    if (rows.length === 0) {
      return NextResponse.json({
        completed: false,
        attemptCount: 0,
        latest: null,
      });
    }

    // Group by quiz_attempt_id to compute per-attempt score.
    const attemptGroups = new Map<string, SubmissionRow[]>();
    for (const row of rows) {
      const key = row.quiz_attempt_id;
      if (!attemptGroups.has(key)) attemptGroups.set(key, []);
      attemptGroups.get(key)!.push(row);
    }

    const attemptCount = attemptGroups.size;

    // Latest = highest attempt_number
    const latestAttemptId = rows[0].quiz_attempt_id;
    const latestRows = attemptGroups.get(latestAttemptId) ?? [];
    const latestCorrect = latestRows.filter((r) => r.is_correct).length;
    const latestTotal = latestRows.length;
    const latestScore = latestTotal > 0 ? Math.round((latestCorrect / latestTotal) * 100) : 0;
    const latestSubmittedAt = latestRows
      .map((r) => r.created_at)
      .sort()
      .pop() ?? rows[0].created_at;

    return NextResponse.json({
      completed: true,
      attemptCount,
      latest: {
        attemptNumber: rows[0].attempt_number,
        quizAttemptId: latestAttemptId,
        score: latestScore,
        correctCount: latestCorrect,
        totalQuestions: latestTotal,
        submittedAt: latestSubmittedAt,
      },
    });
  } catch (error) {
    console.error('[QuizStatus] Unexpected error', error);
    return NextResponse.json({
      completed: false,
      attemptCount: 0,
      latest: null,
    });
  }
}

export const GET = withApiLogging(getHandler, { label: 'quiz-status' });
