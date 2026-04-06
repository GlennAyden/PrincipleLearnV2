// src/app/api/admin/users/export/route.ts
// Export student data as CSV or JSON

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { verifyToken } from '@/lib/jwt'

// ── Row Interfaces ──
interface UserExportRow { id: string; email: string; name?: string; role: string; created_at: string }
interface CourseExportRow { id: string; created_by: string; title: string; created_at: string }
interface QuizExportRow { id: string; user_id: string; is_correct: boolean; submitted_at?: string; created_at: string }
interface JournalExportRow { id: string; user_id: string; created_at: string }
interface TranscriptExportRow { id: string; user_id: string; created_at: string }
interface AskExportRow { id: string; user_id: string; created_at: string }
interface ChallengeExportRow { id: string; user_id: string; created_at: string }
interface DiscussionExportRow { id: string; user_id: string; updated_at?: string; created_at: string }
interface FeedbackExportRow { id: string; user_id: string; rating: number; created_at: string }
interface ProgressExportRow { user_id: string; subtopic_id: string; completed: boolean }

// ─── Auth ─────────────────────────────────────────────────────────────────────

function requireAdmin(request: NextRequest) {
  const token =
    request.cookies.get('access_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') return null
  return payload
}

// ─── Safe query helper ────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder returns complex generic types
async function safeQuery<T>(query: any, label: string, fallback: T): Promise<T> {
  try {
    const { data, error } = await query
    if (error) {
      console.error(`[Export] ${label} query failed:`, error.message)
      return fallback
    }
    return (data ?? fallback) as T
  } catch (err) {
    console.error(`[Export] ${label} query threw:`, err)
    return fallback
  }
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseValidDate(value: unknown): Date | null {
  if (!value) return null
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toIsoDateOnly(value: unknown): string {
  const parsed = parseValidDate(value) ?? new Date()
  return parsed.toISOString().split('T')[0]
}

// ─── CSV builder ──────────────────────────────────────────────────────────────

function escapeCSV(value: unknown): string {
  if (value == null) return ''
  const str = String(value)
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function buildCSV(headers: string[], rows: unknown[][]): string {
  const headerLine = headers.map(escapeCSV).join(',')
  const dataLines = rows.map((row) => row.map(escapeCSV).join(','))
  return [headerLine, ...dataLines].join('\n')
}

// ─── Grouping helper ─────────────────────────────────────────────────────────

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of items) {
    const k = key(item)
    if (!result[k]) result[k] = []
    result[k].push(item)
  }
  return result
}

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  try {
    // Auth guard
    const admin = requireAdmin(request)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const format = searchParams.get('format') ?? 'csv'

    if (format !== 'csv' && format !== 'json') {
      return NextResponse.json(
        { error: 'Invalid format. Use csv or json.' },
        { status: 400 }
      )
    }

    console.log(`[Export] Starting student export in ${format} format`)

    // ── Fetch all data in parallel ────────────────────────────────────
    const [
      users,
      allCourses,
      allQuizSubmissions,
      allJournals,
      allTranscripts,
      allAskQuestions,
      allChallenges,
      allDiscussions,
      allFeedbacks,
      allProgress,
    ] = await Promise.all([
      safeQuery<UserExportRow[]>(
        adminDb.from('users').select('id, email, name, role, created_at'),
        'users', []
      ),
      safeQuery<CourseExportRow[]>(
        adminDb.from('courses').select('id, created_by, title, created_at'),
        'courses', []
      ),
      safeQuery<QuizExportRow[]>(
        adminDb.from('quiz_submissions').select('id, user_id, is_correct, submitted_at, created_at'),
        'quiz_submissions', []
      ),
      safeQuery<JournalExportRow[]>(
        adminDb.from('jurnal').select('id, user_id, created_at'),
        'journals', []
      ),
      safeQuery<TranscriptExportRow[]>(
        adminDb.from('transcript').select('id, user_id, created_at'),
        'transcripts', []
      ),
      safeQuery<AskExportRow[]>(
        adminDb.from('ask_question_history').select('id, user_id, created_at'),
        'ask_questions', []
      ),
      safeQuery<ChallengeExportRow[]>(
        adminDb.from('challenge_responses').select('id, user_id, created_at'),
        'challenges', []
      ),
      safeQuery<DiscussionExportRow[]>(
        adminDb.from('discussion_sessions').select('id, user_id, updated_at, created_at'),
        'discussions', []
      ),
      safeQuery<FeedbackExportRow[]>(
        adminDb.from('feedback').select('id, user_id, rating, created_at'),
        'feedbacks', []
      ),
      safeQuery<ProgressExportRow[]>(
        adminDb.from('user_progress').select('user_id, subtopic_id, completed'),
        'user_progress', []
      ),
    ])

    // ── Group by user ─────────────────────────────────────────────────
    const coursesByUser = groupBy(allCourses, c => c.created_by)
    const quizByUser = groupBy(allQuizSubmissions, q => q.user_id)
    const journalByUser = groupBy(allJournals, j => j.user_id)
    const transcriptByUser = groupBy(allTranscripts, t => t.user_id)
    const askByUser = groupBy(allAskQuestions, a => a.user_id)
    const challengeByUser = groupBy(allChallenges, c => c.user_id)
    const discussionByUser = groupBy(allDiscussions, d => d.user_id)
    const feedbackByUser = groupBy(allFeedbacks, f => f.user_id)
    const progressByUser = groupBy(allProgress, p => p.user_id)

    // Filter to students only
    const students = users.filter(u => (u.role || '').toLowerCase() !== 'admin')

    // ── Build export rows ─────────────────────────────────────────────
    const exportRows = students.map(user => {
      const uid = user.id
      const courses = coursesByUser[uid] || []
      const quizzes = quizByUser[uid] || []
      const journals = journalByUser[uid] || []
      const transcripts = transcriptByUser[uid] || []
      const asks = askByUser[uid] || []
      const challenges = challengeByUser[uid] || []
      const discussions = discussionByUser[uid] || []
      const feedbacks = feedbackByUser[uid] || []
      const progress = progressByUser[uid] || []

      const completedCount = progress.filter(p => p.completed).length
      const totalProgressEntries = progress.length
      const completionRate = totalProgressEntries > 0
        ? Math.round((completedCount / totalProgressEntries) * 100)
        : 0

      const quizCorrect = quizzes.filter(q => q.is_correct).length
      const quizAccuracy = quizzes.length > 0
        ? Math.round((quizCorrect / quizzes.length) * 100)
        : 0

      const interactionCount = asks.length + challenges.length + discussions.length
      let promptStage = 'N/A'
      if (interactionCount >= 15) promptStage = 'REFLECTIVE'
      else if (interactionCount >= 8) promptStage = 'MQP'
      else if (interactionCount >= 3) promptStage = 'SRP'
      else if (interactionCount >= 1) promptStage = 'SCP'

      const totalInteractions =
        courses.length * 3 +
        quizzes.length * 2 +
        journals.length * 2 +
        transcripts.length +
        asks.length * 2 +
        challenges.length * 3 +
        discussions.length * 3 +
        feedbacks.length
      const engagementScore = Math.min(100, Math.round((totalInteractions / 50) * 100))

      // Last activity
      const allDates = [
        ...courses.map(c => parseValidDate(c.created_at)),
        ...quizzes.map(q => parseValidDate(q.submitted_at ?? q.created_at)),
        ...journals.map(j => parseValidDate(j.created_at)),
        ...transcripts.map(t => parseValidDate(t.created_at)),
        ...asks.map(a => parseValidDate(a.created_at)),
        ...challenges.map(c => parseValidDate(c.created_at)),
        ...discussions.map(d => parseValidDate(d.updated_at ?? d.created_at)),
        ...feedbacks.map(f => parseValidDate(f.created_at)),
      ].filter((d): d is Date => d !== null)

      const lastActivity = allDates.length > 0
        ? toIsoDateOnly(new Date(Math.max(...allDates.map((d) => d.getTime()))))
        : toIsoDateOnly(user.created_at)

      const avgFeedbackRating = feedbacks.length > 0
        ? (feedbacks.reduce((sum: number, f) => sum + (f.rating || 0), 0) / feedbacks.length).toFixed(1)
        : 'N/A'

      return {
        id: uid,
        email: user.email,
        name: user.name || 'Unknown',
        joinedAt: toIsoDateOnly(user.created_at),
        totalCourses: courses.length,
        totalQuizzes: quizzes.length,
        quizCorrect,
        quizAccuracy: `${quizAccuracy}%`,
        totalJournals: journals.length,
        totalTranscripts: transcripts.length,
        totalAskQuestions: asks.length,
        totalChallenges: challenges.length,
        totalDiscussions: discussions.length,
        totalFeedbacks: feedbacks.length,
        avgFeedbackRating,
        promptStage,
        engagementScore,
        courseCompletionRate: `${completionRate}%`,
        lastActivity,
      }
    })

    console.log(`[Export] Processed ${exportRows.length} student records`)

    // ── Return in requested format ────────────────────────────────────
    if (format === 'json') {
      const jsonString = JSON.stringify(exportRows, null, 2)
      return new NextResponse(jsonString, {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="students_${toIsoDateOnly(new Date())}.json"`,
        },
      })
    }

    // CSV format
    const headers = [
      'ID', 'Email', 'Name', 'Joined', 'Courses', 'Quizzes', 'Quiz Correct',
      'Quiz Accuracy', 'Journals', 'Transcripts', 'Questions', 'Challenges',
      'Discussions', 'Feedbacks', 'Avg Rating', 'Prompt Stage', 'Engagement',
      'Completion Rate', 'Last Activity',
    ]

    const rows = exportRows.map(r => [
      r.id, r.email, r.name, r.joinedAt, r.totalCourses, r.totalQuizzes,
      r.quizCorrect, r.quizAccuracy, r.totalJournals, r.totalTranscripts,
      r.totalAskQuestions, r.totalChallenges, r.totalDiscussions,
      r.totalFeedbacks, r.avgFeedbackRating, r.promptStage,
      r.engagementScore, r.courseCompletionRate, r.lastActivity,
    ])

    const csvContent = buildCSV(headers, rows)

    return new NextResponse(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="students_${toIsoDateOnly(new Date())}.csv"`,
      },
    })
  } catch (error) {
    console.error('[Export] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to export student data' },
      { status: 500 }
    )
  }
}
