import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import type { GlobalActivityItem, ActivityType } from '@/types/activity';
import { withProtection } from '@/lib/api-middleware';
import { deriveAdminPromptStage } from '@/lib/admin-prompt-stage';

const TABLES: Record<ActivityType, string> = {
  generate: 'course_generation_activity',
  ask: 'ask_question_history',
  challenge: 'challenge_responses',
  quiz: 'quiz_submissions',
  feedback: 'feedback',
  jurnal: 'jurnal',
  transcript: 'transcript',
  learningProfile: 'learning_profiles',
  discussion: 'discussion_sessions',
  example: 'example_usage_events',
};

// Dynamic DB rows from multiple tables with varying schemas — string index is unavoidable
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DynamicRow = Record<string, any>;
type SearchActivityItem = GlobalActivityItem & { sortTime: number };

async function safeQuery(table: string): Promise<DynamicRow[]> {
  try {
    const { data, error } = await adminDb.from(table).select('*').limit(1000);
    if (error) {
      throw new Error(`[Activity Search] Query ${table} failed: ${error.message}`);
    }
    return Array.isArray(data) ? (data as DynamicRow[]) : [];
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`[Activity Search] Query ${table} failed`);
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
    feedback: 4, transcript: 3, generate: 9, learningProfile: 2, example: 2
  };
  return scores[type] || 1;
}

async function getUserEmailMap(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await adminDb
    .from('users')
    .select('id,email')
    .in('id', uniqueIds);

  if (error) {
    throw new Error(`[Activity Search] Query users failed: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((user: { id: string; email?: string | null }) => [
      user.id,
      user.email ?? 'Unknown User',
    ]),
  );
}

async function handler(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const timeRange = searchParams.get('timeRange') || '7d';
  const userId = searchParams.get('userId') || undefined;
  const types = searchParams.get('types') ? searchParams.get('types')!.split(',') : undefined;
  const q = searchParams.get('q') || undefined;
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('size') || '50');

  const dateFilter = getDateFilter(timeRange);
  const rawItems: Array<{ type: ActivityType; row: DynamicRow }> = [];

  for (const [typeStr, table] of Object.entries(TABLES)) {
    const type = typeStr as ActivityType;
    if (types && !types.includes(type)) continue;

    const items = await safeQuery(table);
    rawItems.push(...items.map((row) => ({ type, row })));
  }

  const userEmailMap = await getUserEmailMap(
    rawItems
      .map(({ row }) => (typeof row.user_id === 'string' ? row.user_id : null))
      .filter((value): value is string => Boolean(value)),
  );
  const queryText = q?.toLowerCase();

  const allItems: SearchActivityItem[] = rawItems
    .map(({ type, row }) => {
      const ts = new Date(row.created_at || row.updated_at || '1970');
      const rowUserId = row.user_id || 'unknown';
      const userEmail = typeof rowUserId === 'string'
        ? userEmailMap.get(rowUserId) ?? 'Unknown User'
        : 'Unknown User';

      return {
        id: row.id,
        type,
        timestamp: formatTimestamp(ts),
        sortTime: Number.isNaN(ts.getTime()) ? 0 : ts.getTime(),
        userId: rowUserId,
        userEmail,
        topic: row.subtopic_label || row.topic || row.title || 'N/A',
        detail: row.question || row.content || row.answer || row.comment || row.usage_scope || 'Activity',
        stage: type === 'ask'
          ? deriveAdminPromptStage({ prompts: [row], interactionCount: 1 })
          : undefined,
        engagementScore: computeEngagement(type),
        courseId: row.course_id
      };
    })
    .filter(item => {
      if (item.sortTime < dateFilter.getTime()) return false;
      if (userId && item.userId !== userId) return false;
      if (queryText) {
        const fields = [
          item.id,
          item.type,
          item.userId,
          item.userEmail,
          item.topic,
          item.detail,
          item.stage,
          item.courseId,
        ].join(' ').toLowerCase();
        if (!fields.includes(queryText)) return false;
      }
      return true;
    });

  const sorted = allItems
    .sort((a, b) => b.sortTime - a.sortTime)
    .slice((page - 1) * pageSize, page * pageSize)
    .map(({ sortTime: _sortTime, ...item }) => item);

  return NextResponse.json({
    items: sorted,
    total: allItems.length,
    page,
    pageSize,
    timeRange
  });
}

export const GET = withProtection(handler, { adminOnly: true, requireAuth: true, csrfProtection: false });
