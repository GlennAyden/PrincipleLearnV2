import { NextRequest, NextResponse } from 'next/server';

import { adminDb } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';

function unauthorized(message = 'Unauthorized access') {
  return NextResponse.json({ message }, { status: 401 });
}

async function safeQuery<T>(query: Promise<{ data: T; error: any }>, label: string, fallback: T): Promise<T> {
  try {
    const { data, error } = await query;
    if (error) {
      console.error(`[Admin Users Activity] ${label} query failed`, error);
      return fallback;
    }
    return (data ?? fallback) as T;
  } catch (error) {
    console.error(`[Admin Users Activity] ${label} query threw`, error);
    return fallback;
  }
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const token = request.cookies.get('access_token')?.value ?? request.cookies.get('token')?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') {
      return unauthorized();
    }

    const { id: userId } = await context.params;
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

    const [discussionRows, journalRows, discussionCountRows, journalCountRows] = await Promise.all([
      safeQuery<any[]>(
        adminDb
          .from('discussion_sessions')
          .select('id, status, phase, updated_at, learning_goals')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1),
        'recent discussion',
        []
      ),
      safeQuery<any[]>(
        adminDb
          .from('jurnal')
          .select('id, content, reflection, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent journal',
        []
      ),
      safeQuery<any[]>(
        adminDb
          .from('discussion_sessions')
          .select('id')
          .eq('user_id', userId),
        'discussion counts',
        []
      ),
      safeQuery<any[]>(
        adminDb
          .from('jurnal')
          .select('id')
          .eq('user_id', userId),
        'journal counts',
        []
      ),
    ]);

    const recentDiscussion: any = discussionRows[0] ?? null;
    const recentJournal: any = journalRows[0] ?? null;
    const recentTranscript: any = null;

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
            title:
              typeof recentJournal.reflection === 'string'
                ? recentJournal.reflection.replace(/^Subtopic:\s*/i, '')
                : null,
            snippet:
              typeof recentJournal.content === 'string'
                ? recentJournal.content.slice(0, 160)
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
        discussions: discussionCountRows.length,
        journals: journalCountRows.length,
        transcripts: 0,
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
