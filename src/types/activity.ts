/**
 * Global Activity Types - Admin Activity Optimization
 * Enhances existing tabbed activity monitoring with global search/analytics
 */

export interface ActivitySearchParams {
  timeRange?: '1h'|'24h'|'7d'|'30d'|'90d'|'all';
  userId?: string;
  activityTypes?: string[];
  searchTerm?: string;
  page?: number;
  pageSize?: number;
}

export interface GlobalActivityItem {
  id: string;
  type: ActivityType;
  timestamp: string;
  userId: string;
  userEmail: string;
  topic: string;
  detail: string;
  stage?: string;
  engagementScore: number;
  courseId?: string;
}

// "jurnal" uses Indonesian spelling to match the database table and API routes.
export type ActivityType =
  | 'generate' | 'ask' | 'challenge' | 'quiz' | 'feedback'
  | 'jurnal' | 'transcript' | 'learningProfile' | 'discussion' | 'example';

export interface ActivityAnalytics {
  total: number;
  topUsers: Array<{userId: string; email: string; count: number; engagement: number}>;
  typeDist: Record<ActivityType, number>;
  trends: Array<{date: string; events: number; avgEngagement: number}>;
  anomalies: Array<{type: 'low_engagement'|'quiz_failure'|'no_activity'; userId: string; message: string}>;
}

export interface ActivityActionRequest {
  action: 'flag' | 'reset' | 'notify';
  activityId: string;
  reason?: string;
}

