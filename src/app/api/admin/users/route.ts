// src/app/api/admin/users/route.ts
// Admin Users List API — auth guard, batch queries, complete counts, prompt stage

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { verifyToken } from '@/lib/jwt'
import { computeEngagementScore } from '@/lib/engagement'
import { deriveAdminPromptStage } from '@/lib/admin-prompt-stage'
import { getQuizAttemptCountsByUser, type QuizAttemptMetricRow } from '@/lib/admin-quiz-attempts'
import type { StudentListItem } from '@/types/student'

// ─── Auth Helper ──────────────────────────────────────────────────────────────

function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}

function requireAdmin(request: NextRequest) {
  const token =
    request.cookies.get('access_token')?.value
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') return null
  return payload
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toOptionalIsoDateOnly(value: unknown): string | null {
  if (!value || typeof value !== 'string') return null
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return null
  return parsed.toISOString().split('T')[0]
}

// ─── Row shape returned by get_admin_user_stats() ────────────────────────────

interface UserStatsRow {
  id: string
  email: string
  name: string | null
  role: string
  created_at: string
  total_courses: number
  total_quizzes: number
  total_journals: number
  total_transcripts: number
  total_ask_questions: number
  total_challenges: number
  total_discussions: number
  total_feedbacks: number
  completed_progress: number
  total_progress: number
  last_activity: string | null
}

// ─── GET Handler ──────────────────────────────────────────────────────────────

interface PromptStageRow {
  user_id: string
  prompt_stage?: string | null
  prompt_components?: unknown
  created_at?: string | null
}

interface UserQuizAttemptRow extends QuizAttemptMetricRow {
  user_id?: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder returns complex generic types
async function optionalRows<T>(query: any, label: string): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    console.warn(`[Admin Users] Optional ${label} query failed:`, error.message)
    return []
  }
  return Array.isArray(data) ? data as T[] : []
}

function groupByUser<T extends { user_id?: string | null }>(rows: T[]): Record<string, T[]> {
  const grouped: Record<string, T[]> = {}
  for (const row of rows) {
    if (!row.user_id) continue
    if (!grouped[row.user_id]) grouped[row.user_id] = []
    grouped[row.user_id].push(row)
  }
  return grouped
}

export async function GET(request: NextRequest) {
  // Auth guard
  const admin = requireAdmin(request)
  if (!admin) return unauthorized()

  try {
    const [statsResult, promptClassifications, promptHistory, quizAttemptRows] = await Promise.all([
      // Single aggregated query via Postgres function (replaces 9 parallel full-table scans)
      adminDb.rpc('get_admin_user_stats'),
      optionalRows<PromptStageRow>(
        adminDb.from('prompt_classifications').select('user_id, prompt_stage, created_at'),
        'prompt_classifications',
      ),
      optionalRows<PromptStageRow>(
        adminDb.from('ask_question_history').select('user_id, prompt_stage, prompt_components, created_at'),
        'ask_question_history prompt stages',
      ),
      optionalRows<UserQuizAttemptRow>(
        adminDb
          .from('quiz_submissions')
          .select('id, user_id, quiz_attempt_id, attempt_number, course_id, subtopic_id, leaf_subtopic_id, subtopic_label, created_at'),
        'quiz attempt counts',
      ),
    ])

    const { data, error } = statsResult

    if (error || !data) {
      console.error('[Admin Users] Error fetching user stats:', error)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    const rows = data as UserStatsRow[]
    const classificationsByUser = groupByUser(promptClassifications)
    const promptsByUser = groupByUser(promptHistory)
    const quizCountsByUser = getQuizAttemptCountsByUser(quizAttemptRows)

    const result: StudentListItem[] = rows.map((row) => {
      const quizCounts = quizCountsByUser[row.id]
      const totalQuizAttempts = quizCounts?.attemptCount ?? row.total_quizzes
      const totalQuizAnswerRows = quizCounts?.answerRowCount ?? row.total_quizzes

      // Course completion rate
      const courseCompletionRate = row.total_progress > 0
        ? Math.round((row.completed_progress / row.total_progress) * 100)
        : 0

      // Engagement score (0–100): shared formula — see src/lib/engagement.ts
      const engagementScore = computeEngagementScore({
        courses: row.total_courses,
        quizzes: totalQuizAttempts,
        journals: row.total_journals,
        transcripts: row.total_transcripts,
        askQuestions: row.total_ask_questions,
        challenges: row.total_challenges,
        discussions: row.total_discussions,
        feedbacks: row.total_feedbacks,
      })

      const interactionCount = row.total_ask_questions + row.total_challenges + row.total_discussions
      const promptStage = deriveAdminPromptStage({
        classifications: classificationsByUser[row.id] ?? [],
        prompts: promptsByUser[row.id] ?? [],
        interactionCount,
      })

      return {
        id: row.id,
        email: row.email,
        name: row.name || 'Unknown',
        role: row.role.toUpperCase(),
        createdAt: row.created_at,
        totalCourses: row.total_courses,
        totalTranscripts: row.total_transcripts,
        totalQuizzes: totalQuizAttempts,
        totalQuizAttempts,
        quizAttemptCount: totalQuizAttempts,
        totalQuizAnswerRows,
        totalJournals: row.total_journals,
        totalChallenges: row.total_challenges,
        totalAskQuestions: row.total_ask_questions,
        totalDiscussions: row.total_discussions,
        totalFeedbacks: row.total_feedbacks,
        promptStage,
        engagementScore,
        lastActivity: toOptionalIsoDateOnly(row.last_activity),
        courseCompletionRate,
      }
    })

    return NextResponse.json(result)
  } catch (err: unknown) {
    console.error('[Admin Users] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch users' },
      { status: 500 }
    )
  }
}
