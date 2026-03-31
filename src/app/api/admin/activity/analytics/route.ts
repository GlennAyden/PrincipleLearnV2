import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import type { ActivityAnalytics, ActivityType } from '@/types/activity';
import { format, subDays } from 'date-fns';

const TABLES: Record<ActivityType, string> = {
  generate: 'course_generation_activity',
  ask: 'ask_question_history',
  challenge: 'challenge_responses',
  quiz: 'quiz_submissions',
  feedback: 'feedback',
  jurnal: 'jurnal',
  transcript: 'transcript',
  learningProfile: 'learning_profiles',
  discussion: 'discussion_sessions'
};

async function getTableCount(table: string, days: number): Promise<number> {
  try {
    const since = subDays(new Date(), days).toISOString();
    const { count } = await adminDb
      .from(table)
      .select('*', { count: 'exact', head: true })
      .gte('created_at', since);
    return count || 0;
  } catch {
    return 0;
  }
}

async function getTopUsers(table: string, limit: number): Promise<Array<{userId: string; count: number}>> {
  try {
    const { data } = await adminDb
      .from(table)
      .select('user_id, count(*)')
      .eq('user_id', 'user_id')
      .limit(limit * 10);
    // Simplified - aggregate in prod
    return [];
  } catch {
    return [];
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') || '7');

  let total = 0;
  const typeDist: Record<ActivityType, number> = {} as any;
  const topUsers: Array<{userId: string; email: string; count: number; engagement: number}> = [];
  const trends: Array<{date: string; events: number; avgEngagement: number}> = [];
  const anomalies: Array<{type: string; userId: string; message: string}> = [];

  for (const [type, table] of Object.entries(TABLES)) {
    const count = await getTableCount(table, days);
    total += count;
    (typeDist as any)[type] = count;
  }

  // Mock trends (7 days)
  for (let i = 6; i >= 0; i--) {
    const dateStr = format(subDays(new Date(), i), 'yyyy-MM-dd');
    trends.push({
      date: dateStr,
      events: Math.floor(Math.random() * 50) + 10,
      avgEngagement: 6.5 + (Math.random() - 0.5)
    });
  }

  // Mock anomalies
  anomalies.push({
    type: 'low_engagement',
    userId: 'user123',
    message: 'User inactive 14 days'
  });

  const analytics: ActivityAnalytics = {
    total,
    topUsers,
    typeDist,
    trends,
    anomalies
  };

  return NextResponse.json(analytics);
}

