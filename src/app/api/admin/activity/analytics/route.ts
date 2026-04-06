import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withCacheHeaders } from '@/lib/api-middleware';
import type { ActivityAnalytics, ActivityType } from '@/types/activity';

function subDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() - days);
  return result;
}

function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

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
    const { data } = await adminDb
      .from(table)
      .select('id')
      .gte('created_at', since);
    return Array.isArray(data) ? data.length : 0;
  } catch {
    return 0;
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') || '7');

  let total = 0;
  const typeDist = {} as Record<ActivityType, number>;
  const topUsers: Array<{userId: string; email: string; count: number; engagement: number}> = [];
  const trends: Array<{date: string; events: number; avgEngagement: number}> = [];
  const anomalies: ActivityAnalytics['anomalies'] = [];

  for (const [type, table] of Object.entries(TABLES)) {
    const count = await getTableCount(table, days);
    total += count;
    typeDist[type as ActivityType] = count;
  }

  // Mock trends (7 days)
  for (let i = 6; i >= 0; i--) {
    const dateStr = formatDate(subDays(new Date(), i));
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

  return withCacheHeaders(NextResponse.json(analytics), 60);
}

