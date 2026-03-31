// src/app/api/admin/users/route.ts
// Admin Users List API — auth guard, batch queries, complete counts, prompt stage

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { verifyToken } from '@/lib/jwt'
import type { StudentListItem } from '@/types/student'

// ─── Auth Helper ──────────────────────────────────────────────────────────────

function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}

function requireAdmin(request: NextRequest) {
  const token =
    request.cookies.get('access_token')?.value ??
    request.cookies.get('token')?.value
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') return null
  return payload
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseValidDate(value: unknown): Date | null {
  if (!value) return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value
  if (typeof value !== 'string') return null
  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toIsoDateOnly(value: unknown): string {
  const parsed = parseValidDate(value) ?? new Date()
  return parsed.toISOString().split('T')[0]
}

/** Group an array of rows by a key field, returning a Map<keyValue, rows[]> */
function groupBy<T>(rows: T[], key: keyof T): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const row of rows) {
    const k = String(row[key] ?? '')
    if (!k) continue
    const arr = map.get(k)
    if (arr) arr.push(row)
    else map.set(k, [row])
  }
  return map
}

/** Safely query a table; return [] on error */
async function safeQuery<T>(
  table: string,
  select: string = 'id, user_id, created_at'
): Promise<T[]> {
  try {
    const { data, error } = await adminDb
      .from(table)
      .select(select)
    if (error) {
      console.warn(`[Admin Users] Warning querying ${table}:`, error.message)
      return []
    }
    return (data ?? []) as T[]
  } catch (err) {
    console.warn(`[Admin Users] Exception querying ${table}:`, err)
    return []
  }
}

// ─── Interfaces for DB rows ───────────────────────────────────────────────────

interface UserRow {
  id: string
  email: string
  name?: string
  role: string
  created_at: string
  updated_at: string
}

interface HasUserAndDate {
  user_id: string
  created_at?: string
  submitted_at?: string
  updated_at?: string
}

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  // Auth guard
  const admin = requireAdmin(request)
  if (!admin) return unauthorized()

  try {
    console.log('[Admin Users] Fetching users with batch queries...')

    // ── 1. Get all users ─────────────────────────────────────────────────────
    const { data: usersData, error: usersError } = await adminDb
      .from('users')
      .select('id, email, name, role, created_at, updated_at')
      .order('created_at', { ascending: false })

    if (usersError || !usersData) {
      console.error('[Admin Users] Error fetching users:', usersError)
      return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
    }

    const users = usersData as UserRow[]
    console.log(`[Admin Users] Found ${users.length} users`)

    // ── 2. Batch-query all activity tables in parallel ───────────────────────
    const [
      courses,
      quizSubmissions,
      journals,
      transcripts,
      askQuestions,
      challenges,
      discussions,
      feedbacks,
      userProgress,
    ] = await Promise.all([
      safeQuery<HasUserAndDate & { id: string; created_by?: string }>('courses', 'id, created_by, created_at'),
      safeQuery<HasUserAndDate & { id: string; is_correct?: boolean }>('quiz_submissions', 'id, user_id, submitted_at, created_at'),
      safeQuery<HasUserAndDate & { id: string }>('jurnal', 'id, user_id, created_at'),
      safeQuery<HasUserAndDate & { id: string }>('transcript', 'id, user_id, created_at'),
      safeQuery<HasUserAndDate & { id: string }>('ask_question_history', 'id, user_id, created_at'),
      safeQuery<HasUserAndDate & { id: string }>('challenge_responses', 'id, user_id, created_at'),
      safeQuery<HasUserAndDate & { id: string }>('discussion_sessions', 'id, user_id, created_at, updated_at'),
      safeQuery<HasUserAndDate & { id: string }>('feedback', 'id, user_id, created_at'),
      safeQuery<{ user_id: string; subtopic_id: string; completed: boolean }>('user_progress', 'user_id, subtopic_id, completed'),
    ])

    // ── 3. Group by user_id ──────────────────────────────────────────────────
    // courses uses 'created_by' instead of 'user_id'
    const coursesByUser = new Map<string, typeof courses>()
    for (const c of courses) {
      const uid = (c as any).created_by ?? ''
      if (!uid) continue
      const arr = coursesByUser.get(uid)
      if (arr) arr.push(c)
      else coursesByUser.set(uid, [c])
    }

    const quizByUser = groupBy(quizSubmissions, 'user_id' as any)
    const journalByUser = groupBy(journals, 'user_id' as any)
    const transcriptByUser = groupBy(transcripts, 'user_id' as any)
    const askByUser = groupBy(askQuestions, 'user_id' as any)
    const challengeByUser = groupBy(challenges, 'user_id' as any)
    const discussionByUser = groupBy(discussions, 'user_id' as any)
    const feedbackByUser = groupBy(feedbacks, 'user_id' as any)
    const progressByUser = groupBy(userProgress as any[], 'user_id' as any)

    // ── 4. Build response ────────────────────────────────────────────────────
    const result: StudentListItem[] = users.map((user) => {
      const uid = user.id
      const userCourses = coursesByUser.get(uid) ?? []
      const userQuiz = (quizByUser.get(uid) ?? []) as any[]
      const userJournals = journalByUser.get(uid) ?? []
      const userTranscripts = transcriptByUser.get(uid) ?? []
      const userAsk = askByUser.get(uid) ?? []
      const userChallenge = challengeByUser.get(uid) ?? []
      const userDiscussion = discussionByUser.get(uid) ?? []
      const userFeedback = feedbackByUser.get(uid) ?? []
      const userProg = (progressByUser.get(uid) ?? []) as any[]

      // Calculate last activity across ALL tables
      const allDates: Date[] = []
      const pushDates = (rows: any[], field: string = 'created_at') => {
        for (const r of rows) {
          const d = parseValidDate(r[field])
          if (d) allDates.push(d)
        }
      }
      pushDates(userCourses)
      pushDates(userQuiz, 'submitted_at')
      pushDates(userQuiz, 'created_at')
      pushDates(userJournals)
      pushDates(userTranscripts)
      pushDates(userAsk)
      pushDates(userChallenge)
      pushDates(userDiscussion, 'updated_at')
      pushDates(userFeedback)

      const lastActivityDate = allDates.length > 0
        ? new Date(Math.max(...allDates.map(d => d.getTime())))
        : parseValidDate(user.created_at) ?? new Date()

      // Course completion rate
      const totalProgress = userProg.length
      const completedProgress = userProg.filter((p: any) => p.completed === true).length
      const courseCompletionRate = totalProgress > 0
        ? Math.round((completedProgress / totalProgress) * 100)
        : 0

      // Engagement score (0–100): weighted composite
      const totalActivities =
        userCourses.length * 5 +        // course generation is high engagement
        userQuiz.length * 2 +
        userJournals.length * 3 +
        userTranscripts.length * 2 +
        userAsk.length * 2 +
        userChallenge.length * 3 +
        userDiscussion.length * 4 +
        userFeedback.length * 1

      // Normalize to 0-100 (cap at 100)
      const engagementScore = Math.min(100, Math.round(totalActivities * 2))

      // Prompt stage heuristic: based on discussion/ask/challenge counts
      let promptStage = 'N/A'
      const interactionCount = userAsk.length + userChallenge.length + userDiscussion.length
      if (interactionCount >= 15) promptStage = 'REFLECTIVE'
      else if (interactionCount >= 8) promptStage = 'MQP'
      else if (interactionCount >= 3) promptStage = 'SRP'
      else if (interactionCount >= 1) promptStage = 'SCP'

      return {
        id: uid,
        email: user.email,
        name: user.name || 'Unknown',
        role: user.role.toUpperCase(),
        createdAt: user.created_at,
        totalCourses: userCourses.length,
        totalTranscripts: userTranscripts.length,
        totalQuizzes: userQuiz.length,
        totalJournals: userJournals.length,
        totalChallenges: userChallenge.length,
        totalAskQuestions: userAsk.length,
        totalDiscussions: userDiscussion.length,
        totalFeedbacks: userFeedback.length,
        promptStage,
        engagementScore,
        lastActivity: toIsoDateOnly(lastActivityDate),
        courseCompletionRate,
      }
    })

    console.log(`[Admin Users] Returning ${result.length} users with complete activity data`)
    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[Admin Users] Unexpected error:', err)
    return NextResponse.json(
      { error: 'Failed to fetch users', details: err?.message },
      { status: 500 }
    )
  }
}
