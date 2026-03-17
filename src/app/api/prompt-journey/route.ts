// src/app/api/prompt-journey/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';

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
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const courseId = searchParams.get('courseId');

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    let query = adminDb
      .from('ask_question_history')
      .select('id, question, reasoning_note, prompt_components, prompt_version, session_number, subtopic_label, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })
      .limit(200);

    if (courseId) {
      query = query.eq('course_id', courseId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[PromptJourney] Query error:', error);
      return NextResponse.json({ error: 'Failed to fetch prompt journey' }, { status: 500 });
    }

    const normalizedEntries = (data || []).map((entry: any) => ({
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
  } catch (err: any) {
    console.error('[PromptJourney] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
