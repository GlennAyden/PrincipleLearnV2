// src/app/api/admin/evidence/route.ts
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
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');
    const courseId = searchParams.get('courseId');

    // Fetch all evidence types in parallel
    const buildQuery = (table: string, selectFields: string) => {
      let query = adminDb.from(table).select(selectFields).order('created_at', { ascending: false }).limit(500);
      if (userId) query = query.eq('user_id', userId);
      if (courseId) query = query.eq('course_id', courseId);
      return query;
    };

    const [
      questionsResult,
      challengesResult,
      quizResult,
      jurnalResult,
      feedbackResult,
    ] = await Promise.all([
      buildQuery('ask_question_history', 'id, user_id, course_id, question, answer, reasoning_note, prompt_components, prompt_version, session_number, module_index, subtopic_index, page_number, subtopic_label, created_at'),
      buildQuery('challenge_responses', 'id, user_id, course_id, question, answer, feedback, reasoning_note, created_at'),
      buildQuery('quiz_submissions', 'id, user_id, quiz_id, answer, is_correct, reasoning_note, created_at'),
      buildQuery('jurnal', 'id, user_id, course_id, content, type, created_at'),
      buildQuery('feedback', 'id, user_id, course_id, subtopic_id, module_index, subtopic_index, comment, rating, created_at'),
    ]);

    // Combine and sort all evidence chronologically
    const evidence: any[] = [];

    const addEntries = (data: any[] | null, type: string) => {
      if (!data) return;
      data.forEach(item => {
        evidence.push({ ...item, evidence_type: type });
      });
    };

    addEntries(questionsResult.data, 'ask_question');
    addEntries(challengesResult.data, 'challenge');
    addEntries(quizResult.data, 'quiz');
    addEntries(jurnalResult.data, 'jurnal');
    addEntries(feedbackResult.data, 'feedback');

    // Sort by created_at descending
    evidence.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    for (const item of evidence) {
      if (item.evidence_type === 'ask_question') {
        item.prompt_components = normalizePromptComponents(item.prompt_components);
      }
      if (item.evidence_type === 'feedback') {
        // Keep UI contract stable while reading the current feedback schema (`comment`).
        item.content = item.comment ?? item.content ?? null;
      }
    }

    // Also fetch list of users for the filter dropdown
    const { data: users } = await adminDb.from('users').select('id, name, email').order('name', { ascending: true });

    return NextResponse.json({
      success: true,
      evidence,
      users: users || [],
      counts: {
        askQuestion: (questionsResult.data || []).length,
        challenge: (challengesResult.data || []).length,
        quiz: (quizResult.data || []).length,
        jurnal: (jurnalResult.data || []).length,
        feedback: (feedbackResult.data || []).length,
        total: evidence.length,
      },
    });
  } catch (err: any) {
    console.error('[Evidence Locker] Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
