/**
 * Dashboard Types for Admin Overview
 * PrincipleLearn V3 - Admin Dashboard Optimization
 */

// ── Tab & Filter Types ──

/** Tab identifiers for dashboard sections */
export type DashboardTab = 'overview' | 'system';

/** Time range filter options */
export type TimeRange = '7d' | '30d' | '90d' | 'all';

// ── KPI Types ──

/** Enhanced KPI interface — all metrics shown on dashboard overview */
export interface DashboardKPI {
  activeStudents: number;
  totalCourses: number;
  quizAccuracy: number;
  totalDiscussions: number;
  completedDiscussions: number;
  /** Unified reflection event count sourced from jurnal, with feedback mirrors merged in. */
  totalJournals: number;
  totalChallenges: number;
  totalAskQuestions: number;
  /** Count of reflected entries that carry feedback payload, without double counting mirrors. */
  totalFeedbacks: number;
  /** Average rating across unified reflection events that have a valid 1..5 rating. */
  avgRating: number;
  ctCoverageRate: number;
  // New KPIs
  totalTranscripts: number;
  totalLearningProfiles: number;
  onboardingCompletionRate: number;
}

// ── RM2 Types (Prompt Stage Distribution) ──

/** RM2 data with research integration support */
export interface RM2Data {
  stages: Record<string, number>; // e.g. { SCP: 5, SRP: 10, MQP: 3, Reflektif: 2 }
  totalPrompts: number;
  /** Whether data comes from research tables or heuristic fallback */
  hasResearchData: boolean;
  avgStageScore: number;
  microMarkerDistribution?: Record<string, number>; // e.g. { GCP: 4, PP: 3, ARP: 2 }
}

// ── RM3 Types (Cognitive Indicators) ──

/** CT breakdown per dimension (scale 0-2 each, averaged) */
export interface CTBreakdown {
  decomposition: number;
  pattern_recognition: number;
  abstraction: number;
  algorithm_design: number;
  evaluation_debugging: number;
  generalization: number;
}

/** Critical Thinking breakdown per dimension (scale 0-2 each, averaged) */
export interface CThBreakdown {
  interpretation: number;
  analysis: number;
  evaluation: number;
  inference: number;
  explanation: number;
  self_regulation: number;
}

/** RM3 data with cognitive indicators */
export interface RM3Data {
  totalGoals: number;
  coveredGoals: number;
  ctCoverageRate: number;
  quizAccuracy: number;
  totalChallenges: number;
  /** Whether data comes from research tables or heuristic fallback */
  hasResearchData: boolean;
  avgCTScore?: number;   // 0-12
  avgCThScore?: number;  // 0-12
  ctBreakdown?: CTBreakdown;
  cthBreakdown?: CThBreakdown;
}

// ── System Health Types ──

/** System alert from monitoring */
export interface SystemAlert {
  severity: 'high' | 'medium';
  path: string;
  failed: number;
  failureRate: number;
  message: string;
}

/** Failing endpoint summary */
export interface FailingEndpoint {
  path: string;
  total: number;
  success: number;
  failed: number;
  failureRate: number;
}

/** System health data aggregated from monitoring/logging */
export interface SystemHealth {
  periodDays: number;
  totalRequests: number;
  totalFailures: number;
  totalSuccess: number;
  failureRate: number;
  alerts: SystemAlert[];
  topFailingEndpoints: FailingEndpoint[];
}

// ── Activity Feed Types ──

/** All possible activity types across the platform */
export type ActivityType =
  | 'course'
  | 'ask'
  | 'challenge'
  | 'quiz'
  | 'journal'
  | 'transcript'
  | 'feedback'
  | 'discussion';

/** Enhanced activity item supporting all 8 activity types */
export interface ActivityItem {
  type: ActivityType;
  email: string;
  detail: string;
  timestamp: string;
}

// ── Student Summary Types ──

/** Enhanced student row for dashboard student table */
export interface StudentRow {
  id: string;
  email: string;
  courses: number;
  quizzes: number;
  quizAccuracy: number;
  journals: number;
  challenges: number;
  discussions: number;
  promptStage: string;
  // New fields
  askQuestions: number;
  transcripts: number;
  lastActivity: string;
}

// ── Full Dashboard API Response ──

/** Complete response shape from /api/admin/dashboard */
export interface DashboardAPIResponse {
  kpi: DashboardKPI;
  rm2: RM2Data;
  rm3: RM3Data;
  studentSummary: StudentRow[];
  recentActivity: ActivityItem[];
  meta: {
    timeRange: TimeRange;
    generatedAt: string;
    queryTimeMs: number;
  };
}
