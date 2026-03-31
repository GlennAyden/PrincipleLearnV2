/**
 * Insights Types for Admin Insights Page
 * PrincipleLearn V3 - Research Dashboard Types
 */

import type { TimeRange, CTBreakdown, CThBreakdown } from './dashboard'
/* import type { User } from './student' */

// ── Core Summary Types ──

export interface InsightsSummary {
  totalPrompts: number
  avgComponentsUsed: number
  reasoningRate: number
  quizAccuracy: number
  quizTotal: number
  quizWithReasoning: number
  reflectionTotal: number
  structuredReflections: number
  avgContentRating: number
  ctIndicators: number
  challengeTotal: number
  challengesWithReasoning: number
  // New: Research integration
  discussionSessions: number
  discussionCompletionRate: number
}

// ── Evolution Chart ──

export interface EvolutionPoint {
  session: string
  totalPrompts: number
  avgComponents: number
  reasoningRate: number
  // New: Research-enhanced
  dominantStage?: string
  avgStageScore?: number
}

// ── Enhanced Student Row ──

export interface InsightsStudentRow {
  userId: string
  email: string
  totalPrompts: number
  totalQuizzes: number
  quizAccuracy: number
  totalReflections: number
  totalChallenges: number
  joinedAt: string
  // New fields
  cohort?: string  // 'week1', 'month1', etc.
  promptStage: string
  ctScore?: number
  lastActivity: string
}

// ── Research Metrics ──

export interface ResearchMetrics {
  rm2ResearchData: boolean
  rm3ResearchData: boolean
  avgStageScore: number
  ctBreakdown?: CTBreakdown
  cthBreakdown?: CThBreakdown
  microMarkerDist?: Record<string, number>
}

// ── Filter Options ──

export interface UserOption {
  id: string
  email: string
}

export interface CourseOption {
  id: string
  title: string
}

// ── Complete API Response ──

export interface InsightsAPIResponse {
  summary: InsightsSummary
  evolution: EvolutionPoint[]
  students: InsightsStudentRow[]
  research: ResearchMetrics
  filters: {
    users: UserOption[]
    courses: CourseOption[]
  }
  meta: {
    researchMode: boolean
    timeRange: TimeRange
    totalRecords: number
    generatedAt: string
    queryTimeMs: number
  }
}

// ── Export Formats ──

export type ExportFormat = 'csv' | 'json'

export interface ExportRequest {
  format: ExportFormat
  userIds?: string[]
  courseIds?: string[]
  timeRange?: TimeRange
}

