import { NextRequest, NextResponse } from 'next/server';

import { adminDb } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';

function unauthorized(message = 'Unauthorized access') {
  return NextResponse.json({ message }, { status: 401 });
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const token = request.cookies.get('token')?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') {
      return unauthorized();
    }

    const userId = params.id;
    if (!userId) {
      return NextResponse.json({ message: 'user id is required' }, { status: 400 });
    }

    const { data: userRecord, error: userError } = await adminDb
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .maybeSingle();

    if (userError || !userRecord) {
      return NextResponse.json(
        { message: 'User not found' },
        { status: 404 }
      );
    }

    const [discussionResult, journalResult, transcriptResult] = await Promise.all([
      adminDb
        .from('discussion_sessions')
        .select('id, status, phase, updated_at, learning_goals')
        .eq('user_id', userId)
        .order('updated_at', { ascending: false })
        .limit(1),
      adminDb
        .from('jurnal')
        .select('id, judul, konten, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1),
      adminDb
        .from('transcript')
        .select('id, title, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1),
    ]);

    const [discussionCounts, journalCounts, transcriptCounts] = await Promise.all([
      adminDb
        .from('discussion_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      adminDb
        .from('jurnal')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
      adminDb
        .from('transcript')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId),
    ]);

    const recentDiscussion = discussionResult.data?.[0] ?? null;
    const recentJournal = journalResult.data?.[0] ?? null;
    const recentTranscript = transcriptResult.data?.[0] ?? null;

    const response = {
      userId: userRecord.id,
      email: userRecord.email,
      recentDiscussion: recentDiscussion
        ? {
            sessionId: recentDiscussion.id,
            status: recentDiscussion.status,
            phase: recentDiscussion.phase ?? null,
            updatedAt: recentDiscussion.updated_at,
            goalCount: Array.isArray(recentDiscussion.learning_goals)
              ? recentDiscussion.learning_goals.length
              : 0,
          }
        : null,
      recentJournal: recentJournal
        ? {
            id: recentJournal.id,
            title: recentJournal.judul,
            snippet:
              typeof recentJournal.konten === 'string'
                ? recentJournal.konten.slice(0, 160)
                : null,
            createdAt: recentJournal.created_at,
          }
        : null,
      recentTranscript: recentTranscript
        ? {
            id: recentTranscript.id,
            title: recentTranscript.title,
            createdAt: recentTranscript.created_at,
          }
        : null,
      totals: {
        discussions: discussionCounts.count ?? 0,
        journals: journalCounts.count ?? 0,
        transcripts: transcriptCounts.count ?? 0,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    console.error('[Admin Users Activity] Unexpected error', error);
    return NextResponse.json(
      { message: 'Failed to load activity data' },
      { status: 500 }
    );
  }
}
