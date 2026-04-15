// src/app/api/prompt-journey/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';

interface PromptJourneyEntry {
  id: string;
  question: string;
  reasoning_note: string | null;
  prompt_components: unknown;
  prompt_version: number | null;
  session_number: number | null;
  subtopic_label: string | null;
  prompt_stage: string | null;
  stage_confidence: number | null;
  created_at: string;
}

function normalizePromptComponents(value: unknown) {
  if (!value) return null;

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }

  return typeof value === 'object' ? value : null;
}

export async function GET(request: NextRequest) {
  try {
    // Identity ALWAYS comes from the JWT — callers may not forge it via
    // query params. An admin is the only role allowed to request a
    // different `userId`; for every other caller, the query param is
    // silently ignored.
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload?.userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const requestedUserId = searchParams.get('userId');
    const courseId = searchParams.get('courseId');
    const isAdmin = (tokenPayload.role ?? '').toLowerCase() === 'admin';
    const effectiveUserId = isAdmin && requestedUserId ? requestedUserId : tokenPayload.userId;

    // Non-admin attempting to view someone else's journey: explicit 403 so
    // accidental UI bugs surface loudly instead of silently leaking data.
    if (!isAdmin && requestedUserId && requestedUserId !== tokenPayload.userId) {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 });
    }

    let query = adminDb
      .from('ask_question_history')
      .select('id, question, reasoning_note, prompt_components, prompt_version, session_number, subtopic_label, prompt_stage, stage_confidence, created_at')
      .eq('user_id', effectiveUserId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (courseId) {
      query = query.eq('course_id', courseId);
    }

    const { data, error } = await query as { data: PromptJourneyEntry[] | null; error: { message: string } | null };

    if (error) {
      console.error('[PromptJourney] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch prompt journey' }, { status: 500 });
    }

    const normalizedEntries = (data || []).map((entry: PromptJourneyEntry) => ({
      ...entry,
      prompt_components: normalizePromptComponents(entry.prompt_components),
      prompt_version:
        typeof entry.prompt_version === 'number' && entry.prompt_version > 0
          ? entry.prompt_version
          : 1,
      session_number:
        typeof entry.session_number === 'number' && entry.session_number > 0
          ? entry.session_number
          : 1,
    }));

    return NextResponse.json({
      success: true,
      entries: normalizedEntries,
      count: normalizedEntries.length,
    });
  } catch (err: unknown) {
    console.error('[PromptJourney] Error:', err);
    return NextResponse.json({ error: 'Failed to fetch prompt journey' }, { status: 500 });
  }
}
