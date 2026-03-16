// src/app/api/prompt-journey/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';

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

    return NextResponse.json({
      success: true,
      entries: data || [],
      count: (data || []).length,
    });
  } catch (err: any) {
    console.error('[PromptJourney] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
