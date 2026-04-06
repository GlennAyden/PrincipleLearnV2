import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import type { DiscussionAnalytics, SessionHealthScore } from '@/types/discussion';

async function getHandler(request: NextRequest) {
  try {
    const token = request.cookies.get('access_token')?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = request.nextUrl;
    const courseId = searchParams.get('courseId');
    const userId = searchParams.get('userId');
    const limit = Number(searchParams.get('limit')) || 500;

    // Base query for aggregates
    let baseQuery = adminDb
      .from('discussion_sessions')
      .select(`
        id,
        status,
        phase,
        learning_goals,
        created_at,
        updated_at,
        user_id,
        course_id,
        users:user_id(email),
        courses:course_id(title),
        subtopics:subtopic_id(title),
        count_messages:discussion_messages(id)
      `)
      .order('updated_at', { ascending: false })
      .limit(limit);

    if (courseId) baseQuery = baseQuery.eq('course_id', courseId);
    if (userId) baseQuery = baseQuery.eq('user_id', userId);

    const { data: sessionsRaw, error } = await baseQuery;

    if (error) {
      console.error('[AdminDiscussionsAnalytics] Query error:', error);
      return NextResponse.json({ error: 'Failed to load analytics' }, { status: 500 });
    }

    interface AnalyticsSessionRow {
      id: string; status: string; phase?: string; learning_goals: { covered?: boolean }[];
      created_at: string; updated_at: string; user_id: string; course_id: string;
      users?: { email: string } | null; courses?: { title: string } | null;
      subtopics?: { title: string } | null; count_messages?: unknown;
    }
    const sessions = (sessionsRaw ?? []) as unknown as AnalyticsSessionRow[];

    // Calculate aggregates
    const now = new Date();
    const stalledHours = 48;
    const totalSessions = sessions.length;
    const statuses = {
      inProgress: sessions.filter(s => s.status === 'in_progress').length,
      completed: sessions.filter(s => s.status === 'completed').length,
      stalled: 0,
    };
    statuses.stalled = sessions.filter(s => {
      const updated = new Date(s.updated_at);
      return s.status === 'in_progress' && (now.getTime() - updated.getTime()) > (stalledHours * 60 * 60 * 1000);
    }).length;

    let totalTurns = 0;
    let totalGoals = 0;
    let coveredGoals = 0;

    const sessionsWithHealth = sessions.map(session => {
      const messageCount = Number(session.count_messages || 0);
      totalTurns += messageCount;

      const goals = Array.isArray(session.learning_goals) ? session.learning_goals : [];
      totalGoals += goals.length;
      coveredGoals += goals.filter((g: { covered?: boolean }) => g.covered).length;

      // Health score logic
      const daysStalled = (now.getTime() - new Date(session.updated_at).getTime()) / (24 * 60 * 60 * 1000);
      const goalPct = goals.length ? (goals.filter((g: { covered?: boolean }) => g.covered).length / goals.length) : 0;
      const hasActivity = messageCount > 3;
      const score = Math.round(
        (goalPct * 50) +
        (hasActivity ? 30 : 0) +
        (daysStalled < 2 ? 20 : 0)
      );
      const color = score >= 80 ? 'green' : score >= 50 ? 'yellow' : 'red';
      const reasons: string[] = [];
      if (goalPct < 0.5) reasons.push('Low goal coverage');
      if (!hasActivity) reasons.push('Low activity');
      if (daysStalled > 2) reasons.push('Stalled');

      return {
        ...session,
        healthScore: { score, color, reasons } as SessionHealthScore,
        messageCount,
      };
    });

    const analytics: DiscussionAnalytics = {
      totalSessions,
      inProgress: statuses.inProgress,
      completed: statuses.completed,
      stalled: statuses.stalled,
      avgTurns: totalSessions ? Math.round(totalTurns / totalSessions) : 0,
      completionRate: totalSessions ? Math.round((statuses.completed / totalSessions) * 100) : 0,
      avgGoalCoverage: totalGoals ? Math.round((coveredGoals / totalGoals) * 100) : 0,
    };

    return NextResponse.json({
      sessions: sessionsWithHealth,
      analytics,
    });

  } catch (error) {
    console.error('[AdminDiscussionsAnalytics] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withApiLogging(getHandler, {
  label: 'admin.discussions.analytics',
});

