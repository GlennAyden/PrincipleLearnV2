import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import type { ActivitySearchParams, GlobalActivityItem, ActivityType } from '@/types/activity';
import { format, subHours, subDays } from 'date-fns';

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

async function safeQuery(table: string): Promise<any[]> {
  try {
    const { data } = await adminDb.from(table).select('*').limit(1000);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function getDateFilter(timeRange: string): Date {
  const now = new Date();
  switch (timeRange) {
    case '1h': return subHours(now, 1);
    case '24h': return subDays(now, 1);
    case '7d': return subDays(now, 7);
    case '30d': return subDays(now, 30);
    case '90d': return subDays(now, 90);
    default: return new Date(0);
  }
}

function computeEngagement(type: ActivityType): number {
  const scores: Record<ActivityType, number> = {
    discussion: 10, challenge: 8, jurnal: 7, quiz: 6, ask: 5,
    feedback: 4, transcript: 3, generate: 9, learningProfile: 2
  };
  return scores[type] || 1;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const timeRange = searchParams.get('timeRange') || '7d';
  const userId = searchParams.get('userId') || undefined;
  const types = searchParams.get('types') ? searchParams.get('types')!.split(',') : undefined;
  const q = searchParams.get('q') || undefined;
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('size') || '50');

  const dateFilter = getDateFilter(timeRange);
  const allItems: GlobalActivityItem[] = [];

  for (const [typeStr, table] of Object.entries(TABLES)) {
    const type = typeStr as ActivityType;
    if (types && !types.includes(type)) continue;

    const items = await safeQuery(table);
    const filtered = items.filter(item => {
      const ts = new Date(item.created_at || item.updated_at || '1970');
      if (ts < dateFilter) return false;
      if (userId && item.user_id !== userId) return false;
      if (q) {
        const fields = Object.values(item).join(' ').toLowerCase();
        if (!fields.includes(q.toLowerCase())) return false;
      }
      return true;
    }).map(item => ({
      id: item.id,
      type,
      timestamp: format(ts, 'dd/MM HH:mm'),
      userId: item.user_id || 'unknown',
      userEmail: 'user@email.com', // From cache in prod
      topic: item.subtopic_label || item.topic || item.title || 'N/A',
      detail: item.question || item.content || item.answer || item.comment || 'Activity',
      stage: (item.prompt_components ? 'SRP' : undefined) as any,
      engagementScore: computeEngagement(type),
      courseId: item.course_id
    } as GlobalActivityItem));

    allItems.push(...filtered);
  }

  const sorted = allItems.sort((a, b) => 
    new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  ).slice((page - 1) * pageSize, page * pageSize);

  return NextResponse.json({
    items: sorted,
    total: allItems.length,
    page,
    pageSize,
    timeRange
  });
}

