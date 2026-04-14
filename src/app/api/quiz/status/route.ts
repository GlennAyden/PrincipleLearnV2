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

interface SubmissionRow {
  attempt_number: number;
  quiz_attempt_id: string;
  is_correct: boolean;
  created_at: string;
}

async function getHandler(req: NextRequest) {
  // Prefer middleware-injected header; fall back to the JWT cookie directly.
  // The header injection has proven unreliable in production (likely a Next.js
  // middleware→handler header-propagation quirk), so we mirror the
  // cookie-based pattern used by /api/challenge-response, /api/ask-question, etc.
  let authUserId = req.headers.get('x-user-id');
  if (!authUserId) {
    const accessToken = req.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;
    if (tokenPayload?.userId) {
      authUserId = tokenPayload.userId;
    }
  }
  if (!authUserId) {
    return NextResponse.json({ error: 'Autentikasi diperlukan' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('courseId');
  const subtopicTitle = searchParams.get('subtopicTitle');

  if (!courseId) {
    return NextResponse.json({ error: 'courseId wajib' }, { status: 400 });
  }

  const user = await resolveUserByIdentifier(authUserId);
  if (!user) {
    return NextResponse.json({ error: 'Pengguna tidak ditemukan' }, { status: 404 });
  }

  // Resolve subtopic_id from (courseId, subtopicTitle). If no title provided,
  // we can't narrow it down — return "not completed" as a safe default.
  // Use case-insensitive match + trim to survive whitespace/casing drift
  // between the outline cached on the client and the DB row.
  let subtopicId: string | null = null;
  const trimmedTitle = subtopicTitle?.trim() ?? '';
  if (trimmedTitle) {
    try {
      const { data: sub } = await adminDb
        .from('subtopics')
        .select('id')
        .eq('course_id', courseId)
        .ilike('title', trimmedTitle)
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
    const { data: submissions, error } = await adminDb
      .from('quiz_submissions')
      .select('attempt_number, quiz_attempt_id, is_correct, created_at')
      .eq('user_id', user.id)
      .eq('subtopic_id', subtopicId)
      .order('attempt_number', { ascending: false });

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
