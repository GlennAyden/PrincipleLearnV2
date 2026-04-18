// src/app/api/admin/insights/export/route.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { adminDb } from '@/lib/database'
import { countUnifiedReflections } from '@/lib/admin-reflection-summary'
import { deriveAdminPromptStage } from '@/lib/admin-prompt-stage'
import type { ExportFormat, InsightsStudentRow } from '@/types/insights'
const JWT_SECRET = process.env.JWT_SECRET!

interface UserExportRow { id: string; email: string; created_at: string }
interface PromptExportRow { id: string; user_id: string; prompt_stage?: string | null; created_at: string }
interface QuizExportRow { id: string; user_id: string; is_correct: boolean; created_at: string }
interface ReflectionExportRow { id: string; user_id: string; created_at: string }
interface ChallengeExportRow { id: string; user_id: string; created_at: string }
interface ClassificationExportRow { id: string; user_id: string; prompt_stage?: string | null; prompt_stage_score?: number | null; created_at: string }
interface AutoScoreExportRow { id: string; user_id: string; ct_total_score?: number | null; created_at: string }

function verifyAdminFromCookie(request: NextRequest): { userId: string; email: string; role: string } | null {
  const token = request.cookies.get('access_token')?.value
  if (!token) return null

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; role: string }
    if (payload.role?.toLowerCase() !== 'admin') return null
    return payload
  } catch {
    return null
  }
}

function generateCSV(students: InsightsStudentRow[]): string {
  const headers = [
    'User ID', 'Email', 'Total Prompts', 'Total Quizzes', 'Quiz Accuracy %',
    'Total Reflections', 'Total Challenges', 'Joined At', 'Prompt Stage', 
    'CT Score', 'Last Activity', 'Cohort'
  ]
  
  const rows = students.map(s => [
    s.userId,
    `"${s.email}"`,
    s.totalPrompts,
    s.totalQuizzes,
    s.quizAccuracy,
    s.totalReflections,
    s.totalChallenges,
    s.joinedAt,
    s.promptStage,
    s.ctScore || '',
    s.lastActivity,
    s.cohort || ''
  ].map(field => String(field).replace(/"/g, '""')).map(field => `"${field}"`))

  return [headers, ...rows].map(row => row.join(',')).join('\\n')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder returns complex generic types
async function queryRows<T>(query: any, label: string, optional = false): Promise<T[]> {
  const { data, error } = await query
  if (error) {
    if (optional) {
      console.warn(`[Insights Export] Optional query ${label} failed:`, error.message)
      return []
    }
    throw new Error(`[Insights Export] Query ${label} failed: ${error.message}`)
  }
  return (data ?? []) as T[]
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const result: Record<string, T[]> = {}
  for (const item of items) {
    const value = key(item)
    if (!result[value]) result[value] = []
    result[value].push(item)
  }
  return result
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function latestIso(...groups: Array<Array<{ created_at?: string }>>): string {
  const dates = groups
    .flat()
    .map((item) => parseDate(item.created_at))
    .filter((date): date is Date => date !== null)
  if (dates.length === 0) return ''
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString()
}

function derivePromptStage(
  prompts: PromptExportRow[],
  challenges: ChallengeExportRow[],
  classifications: ClassificationExportRow[],
): string {
  return deriveAdminPromptStage({
    classifications,
    prompts,
    interactionCount: prompts.length + challenges.length,
  })
}

export async function GET(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const format = (searchParams.get('format') || 'csv') as ExportFormat

    const [
      users,
      prompts,
      quizzes,
      journals,
      feedbacks,
      challenges,
      classifications,
      autoScores,
    ] = await Promise.all([
      queryRows<UserExportRow>(
        adminDb.from('users').select('id, email, created_at').eq('role', 'user'),
        'users',
      ),
      queryRows<PromptExportRow>(
        adminDb.from('ask_question_history').select('id, user_id, prompt_stage, created_at'),
        'ask_question_history',
      ),
      queryRows<QuizExportRow>(
        adminDb.from('quiz_submissions').select('id, user_id, is_correct, created_at'),
        'quiz_submissions',
      ),
      queryRows<ReflectionExportRow>(
        adminDb.from('jurnal').select('id, user_id, created_at'),
        'jurnal',
      ),
      queryRows<ReflectionExportRow>(
        adminDb.from('feedback').select('id, user_id, created_at'),
        'feedback',
      ),
      queryRows<ChallengeExportRow>(
        adminDb.from('challenge_responses').select('id, user_id, created_at'),
        'challenge_responses',
      ),
      queryRows<ClassificationExportRow>(
        adminDb.from('prompt_classifications').select('id, user_id, prompt_stage, prompt_stage_score, created_at'),
        'prompt_classifications',
        true,
      ),
      queryRows<AutoScoreExportRow>(
        adminDb.from('auto_cognitive_scores').select('id, user_id, ct_total_score, created_at'),
        'auto_cognitive_scores',
        true,
      ),
    ])

    const promptsByUser = groupBy(prompts, (item) => item.user_id)
    const quizzesByUser = groupBy(quizzes, (item) => item.user_id)
    const journalsByUser = groupBy(journals, (item) => item.user_id)
    const feedbacksByUser = groupBy(feedbacks, (item) => item.user_id)
    const challengesByUser = groupBy(challenges, (item) => item.user_id)
    const classificationsByUser = groupBy(classifications, (item) => item.user_id)
    const scoresByUser = groupBy(autoScores, (item) => item.user_id)

    const studentSummary: InsightsStudentRow[] = users.map((u) => {
      const userPrompts = promptsByUser[u.id] ?? []
      const userQuizzes = quizzesByUser[u.id] ?? []
      const userJournals = journalsByUser[u.id] ?? []
      const userFeedbacks = feedbacksByUser[u.id] ?? []
      const userChallenges = challengesByUser[u.id] ?? []
      const userClassifications = classificationsByUser[u.id] ?? []
      const userScores = scoresByUser[u.id] ?? []
      const correctQuizzes = userQuizzes.filter((quiz) => quiz.is_correct).length
      const scoreValues = userScores
        .map((score) => Number(score.ct_total_score))
        .filter((value) => Number.isFinite(value))

      return {
        userId: u.id,
        email: u.email,
        totalPrompts: userPrompts.length,
        totalQuizzes: userQuizzes.length,
        quizAccuracy: userQuizzes.length > 0 ? Math.round((correctQuizzes / userQuizzes.length) * 100) : 0,
        totalReflections: countUnifiedReflections(userJournals.length, userFeedbacks.length),
        totalChallenges: userChallenges.length,
        joinedAt: u.created_at,
        promptStage: derivePromptStage(userPrompts, userChallenges, userClassifications),
        ctScore: scoreValues.length > 0
          ? Math.round((scoreValues.reduce((sum, value) => sum + value, 0) / scoreValues.length) * 100) / 100
          : undefined,
        lastActivity: latestIso(userPrompts, userQuizzes, userJournals, userFeedbacks, userChallenges, userClassifications, userScores) || u.created_at,
        cohort: parseDate(u.created_at)?.toISOString().slice(0, 7),
      }
    })

    let content: string
    let contentType: string
    let filename: string

    if (format === 'csv') {
      content = generateCSV(studentSummary)
      contentType = 'text/csv; charset=utf-8'
      filename = `insights-students-${new Date().toISOString().split('T')[0]}.csv`
    } else {
      content = JSON.stringify(studentSummary, null, 2)
      contentType = 'application/json; charset=utf-8'
      filename = `insights-students-${new Date().toISOString().split('T')[0]}.json`
    }

    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `attachment; filename*=UTF-8''${filename}`,
        'Cache-Control': 'no-store'
      }
    })

  } catch (err: unknown) {
    console.error('[Insights Export] Error:', err)
    return NextResponse.json(
      { error: 'Export failed' },
      { status: 500 }
    )
  }
}

