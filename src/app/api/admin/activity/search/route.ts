import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import type { GlobalActivityItem, ActivityType } from '@/types/activity';

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

// Dynamic DB rows from multiple tables with varying schemas — string index is unavoidable
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicRow = Record<string, any>;

async function safeQuery(table: string): Promise<DynamicRow[]> {
  try {
    const { data } = await adminDb.from(table).select('*').limit(1000);
    return Array.isArray(data) ? (data as DynamicRow[]) : [];
  } catch {
    return [];
  }
}

function getDateFilter(timeRange: string): Date {
  const now = new Date();
  switch (timeRange) {
    case '1h': {
      const d = new Date(now); d.setHours(d.getHours() - 1); return d;
    }
    case '24h': {
      const d = new Date(now); d.setDate(d.getDate() - 1); return d;
    }
    case '7d': {
      const d = new Date(now); d.setDate(d.getDate() - 7); return d;
    }
    case '30d': {
      const d = new Date(now); d.setDate(d.getDate() - 30); return d;
    }
    case '90d': {
      const d = new Date(now); d.setDate(d.getDate() - 90); return d;
    }
    default: return new Date(0);
  }
}

function formatTimestamp(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm} ${hh}:${min}`;
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
    const filtered = items
      .filter(item => {
        const ts = new Date(item.created_at || item.updated_at || '1970');
        if (ts < dateFilter) return false;
        if (userId && item.user_id !== userId) return false;
        if (q) {
          const fields = Object.values(item).join(' ').toLowerCase();
          if (!fields.includes(q.toLowerCase())) return false;
        }
        return true;
      })
      .map(item => {
        const ts = new Date(item.created_at || item.updated_at || '1970');
        return {
          id: item.id,
          type,
          timestamp: formatTimestamp(ts),
          userId: item.user_id || 'unknown',
          userEmail: 'user@email.com', // From cache in prod
          topic: item.subtopic_label || item.topic || item.title || 'N/A',
          detail: item.question || item.content || item.answer || item.comment || 'Activity',
          stage: item.prompt_components ? 'SRP' : undefined,
          engagementScore: computeEngagement(type),
          courseId: item.course_id
        } as GlobalActivityItem;
      });

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
