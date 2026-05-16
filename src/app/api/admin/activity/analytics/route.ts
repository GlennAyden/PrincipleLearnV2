import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { withCacheHeaders, withProtection } from '@/lib/api-middleware';
import type { ActivityAnalytics, ActivityType } from '@/types/activity';
import { getAdminModeFromRequest, applyAdminModeFilter } from '@/lib/admin-mode';

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
  discussion: 'discussion_sessions',
  example: 'example_usage_events',
};

function computeEngagement(type: ActivityType): number {
  const scores: Record<ActivityType, number> = {
    discussion: 10,
    challenge: 8,
    jurnal: 7,
    quiz: 6,
    ask: 5,
    feedback: 4,
    transcript: 3,
    generate: 9,
    learningProfile: 2,
    example: 2,
  };
  return scores[type] || 1;
}

interface ActivityAnalyticsRow {
  type: ActivityType;
  userId: string | null;
  timestamp: Date;
}

// Tables with a direct 'mode' column
const ANALYTICS_TABLES_WITH_MODE = new Set(['ask_question_history', 'challenge_responses', 'quiz_submissions', 'jurnal']);
// Tables without mode, filterable via course_id
const ANALYTICS_TABLES_WITH_COURSE_ID = new Set(['feedback', 'transcript', 'discussion_sessions', 'example_usage_events', 'course_generation_activity']);

async function getActivityRows(
  type: ActivityType,
  table: string,
  days: number,
  options?: {
    adminMode?: import('@/lib/admin-mode').AdminMode
    researchCourseIds?: string[] | null
  },
): Promise<ActivityAnalyticsRow[]> {
  try {
    const since = subDays(new Date(), days).toISOString();
    const mode = options?.adminMode ?? 'general';
    const researchCourseIds = options?.researchCourseIds ?? null;

    let q = adminDb.from(table).select('id,user_id,created_at').gte('created_at', since);

    if (mode === 'research') {
      if (ANALYTICS_TABLES_WITH_MODE.has(table)) {
        q = applyAdminModeFilter(q, mode);
      } else if (ANALYTICS_TABLES_WITH_COURSE_ID.has(table)) {
        if (researchCourseIds && researchCourseIds.length > 0) {
          q = q.in('course_id', researchCourseIds);
        } else {
          return []; // No research courses — nothing to return
        }
      }
    }

    const { data, error } = await q;
    if (error) {
      throw new Error(`[Activity Analytics] Query ${table} failed: ${error.message}`);
    }

    return (Array.isArray(data) ? data : []).map((row: { user_id?: string | null; created_at?: string | null }) => {
      const timestamp = new Date(row.created_at || since);
      return {
        type,
        userId: row.user_id ?? null,
        timestamp: Number.isNaN(timestamp.getTime()) ? new Date(since) : timestamp,
      };
    });
  } catch (error) {
    if (error instanceof Error) throw error;
    throw new Error(`[Activity Analytics] Query ${table} failed`);
  }
}

async function getUserEmailMap(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(userIds.filter(Boolean)));
  if (uniqueIds.length === 0) return new Map();

  const { data, error } = await adminDb
    .from('users')
    .select('id,email')
    .in('id', uniqueIds);

  if (error) {
    throw new Error(`[Activity Analytics] Query users failed: ${error.message}`);
  }

  return new Map(
    (data ?? []).map((user: { id: string; email?: string | null }) => [
      user.id,
      user.email ?? 'Unknown User',
    ]),
  );
}

async function handler(req: NextRequest) {
  const adminMode = getAdminModeFromRequest(req);
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get('days') || '7');

  // In Mode Penelitian: get research course_ids once for tables without direct mode column
  let researchCourseIds: string[] | null = null;
  if (adminMode === 'research') {
    const { data: courseData } = await applyAdminModeFilter(
      adminDb.from('courses').select('id'),
      adminMode,
    );
    researchCourseIds = (Array.isArray(courseData) ? courseData : []).map(
      (r: { id: string }) => r.id,
    );
  }

  const typeDist = {} as Record<ActivityType, number>;
  const trends: Array<{date: string; events: number; avgEngagement: number}> = [];
  const anomalies: ActivityAnalytics['anomalies'] = [];
  const rows: ActivityAnalyticsRow[] = [];

  for (const [type, table] of Object.entries(TABLES)) {
    const activityType = type as ActivityType;
    const tableRows = await getActivityRows(activityType, table, days, {
      adminMode,
      researchCourseIds,
    });
    rows.push(...tableRows);
    typeDist[activityType] = tableRows.length;
  }

  const total = rows.length;
  const daily = new Map<string, { events: number; engagement: number }>();
  for (const row of rows) {
    const date = formatDate(row.timestamp);
    const current = daily.get(date) ?? { events: 0, engagement: 0 };
    current.events += 1;
    current.engagement += computeEngagement(row.type);
    daily.set(date, current);
  }

  for (let i = Math.max(0, Math.min(days, 30) - 1); i >= 0; i--) {
    const dateStr = formatDate(subDays(new Date(), i));
    const entry = daily.get(dateStr) ?? { events: 0, engagement: 0 };
    trends.push({
      date: dateStr,
      events: entry.events,
      avgEngagement: entry.events > 0 ? Math.round((entry.engagement / entry.events) * 10) / 10 : 0,
    });
  }

  const userStats = new Map<string, { count: number; engagement: number; lastSeen: number }>();
  for (const row of rows) {
    if (!row.userId) continue;
    const current = userStats.get(row.userId) ?? { count: 0, engagement: 0, lastSeen: 0 };
    current.count += 1;
    current.engagement += computeEngagement(row.type);
    current.lastSeen = Math.max(current.lastSeen, row.timestamp.getTime());
    userStats.set(row.userId, current);
  }
  const emailMap = await getUserEmailMap(Array.from(userStats.keys()));
  const topUsers = Array.from(userStats.entries())
    .map(([userId, stat]) => ({
      userId,
      email: emailMap.get(userId) ?? 'Unknown User',
      count: stat.count,
      engagement: stat.count > 0 ? Math.round((stat.engagement / stat.count) * 10) / 10 : 0,
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  const analytics: ActivityAnalytics = {
    total,
    topUsers,
    typeDist,
    trends,
    anomalies
  };

  return withCacheHeaders(NextResponse.json(analytics), 60);
}

export const GET = withProtection(handler, { adminOnly: true, requireAuth: true, csrfProtection: false });

