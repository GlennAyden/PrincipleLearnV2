// src/app/api/admin/users/[id]/detail/route.ts
// Comprehensive student detail API — courses, activity, learning profile

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { verifyToken } from '@/lib/jwt'

// ── Row Interfaces ──
interface UserDetailRow { id: string; email: string; name?: string; role: string; created_at: string; updated_at?: string }
interface CourseDetailRow { id: string; title: string; created_at: string }
interface QuizDetailRow { id: string; quiz_id: string; course_id: string; subtopic_id: string; answer: string; is_correct: boolean; reasoning_note?: string; submitted_at?: string; created_at: string }
interface JournalDetailRow { id: string; content: unknown; reflection?: string; course_id: string; subtopic_id: string; created_at: string }
interface TranscriptDetailRow { id: string; title?: string; created_at: string }
interface AskDetailRow { id: string; question: string; course_id: string; subtopic_id: string; created_at: string }
interface ChallengeDetailRow { id: string; challenge_type?: string; course_id: string; subtopic_id: string; created_at: string }
interface DiscussionDetailRow { id: string; status: string; phase?: string; learning_goals: unknown; updated_at: string; created_at: string }
interface FeedbackDetailRow { id: string; rating?: number; comment?: string; created_at: string }
interface ProgressDetailRow { id: string; subtopic_id: string; completed: boolean; created_at: string }
interface SubtopicDetailRow { id: string; course_id: string; title: string; order_index?: number }
interface LearningProfileRow { display_name?: string; displayName?: string; programming_experience?: string; programmingExperience?: string; learning_style?: string; learningStyle?: string; learning_goals?: string; learningGoals?: string; challenges?: string; [key: string]: unknown }

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
      if (error.code === 'PGRST205' || error.code === '42P01') {
        console.log(`[Student Detail] Table for "${label}" does not exist, using fallback`)
        return fallback
      }
      console.error(`[Student Detail] ${label} query failed:`, error.message)
      return fallback
    }
    return (data ?? fallback) as T
  } catch (err) {
    console.error(`[Student Detail] ${label} query threw:`, err)
    return fallback
  }
}

// ─── ISO date helper ──────────────────────────────────────────────────────────

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

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Auth guard
    const admin = requireAdmin(request)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: userId } = await context.params
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // ── Verify user exists ────────────────────────────────────────────
    const { data: userRecord, error: userError } = await adminDb
      .from('users')
      .select('id, email, name, role, created_at, updated_at')
      .eq('id', userId)
      .maybeSingle()

    if (userError || !userRecord) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const user = userRecord as unknown as UserDetailRow

    // ── Parallel queries ──────────────────────────────────────────────
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
      learningProfile,
    ] = await Promise.all([
      safeQuery<CourseDetailRow[]>(
        adminDb.from('courses').select('id, title, created_at').eq('created_by', userId).order('created_at', { ascending: false }),
        'courses', []
      ),
      safeQuery<QuizDetailRow[]>(
        adminDb.from('quiz_submissions').select('id, quiz_id, course_id, subtopic_id, answer, is_correct, reasoning_note, submitted_at, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        'quiz_submissions', []
      ),
      safeQuery<JournalDetailRow[]>(
        adminDb.from('jurnal').select('id, content, reflection, course_id, subtopic_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        'journals', []
      ),
      safeQuery<TranscriptDetailRow[]>(
        adminDb.from('transcript').select('id, title, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        'transcripts', []
      ),
      safeQuery<AskDetailRow[]>(
        adminDb.from('ask_question_history').select('id, question, course_id, subtopic_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        'ask_questions', []
      ),
      safeQuery<ChallengeDetailRow[]>(
        adminDb.from('challenge_responses').select('id, challenge_type, course_id, subtopic_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        'challenges', []
      ),
      safeQuery<DiscussionDetailRow[]>(
        adminDb.from('discussion_sessions').select('id, status, phase, learning_goals, updated_at, created_at').eq('user_id', userId).order('updated_at', { ascending: false }),
        'discussions', []
      ),
      safeQuery<FeedbackDetailRow[]>(
        adminDb.from('feedback').select('id, rating, comment, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        'feedbacks', []
      ),
      safeQuery<ProgressDetailRow[]>(
        adminDb.from('user_progress').select('id, subtopic_id, completed, created_at').eq('user_id', userId),
        'user_progress', []
      ),
      safeQuery<LearningProfileRow | null>(
        adminDb.from('learning_profiles').select('*').eq('user_id', userId).maybeSingle(),
        'learning_profile', null
      ),
    ])

    // ── Per-course subtopic counts ────────────────────────────────────
    const courseIds = courses.map(c => c.id)
    let allSubtopics: SubtopicDetailRow[] = []
    if (courseIds.length > 0) {
      // Query subtopics for all courses
      for (const cid of courseIds) {
        const subs = await safeQuery<SubtopicDetailRow[]>(
          adminDb.from('subtopics').select('id, course_id, title, order_index').eq('course_id', cid),
          `subtopics for ${cid}`, []
        )
        allSubtopics = allSubtopics.concat(subs)
      }
    }

    // Group subtopics by course
    const subtopicsByCourse: Record<string, SubtopicDetailRow[]> = {}
    for (const sub of allSubtopics) {
      const cid = sub.course_id
      if (!subtopicsByCourse[cid]) subtopicsByCourse[cid] = []
      subtopicsByCourse[cid].push(sub)
    }

    // Quiz counts per course
    const quizByCourse: Record<string, { total: number; correct: number }> = {}
    for (const q of quizSubmissions) {
      const cid = q.course_id
      if (!cid) continue
      if (!quizByCourse[cid]) quizByCourse[cid] = { total: 0, correct: 0 }
      quizByCourse[cid].total++
      if (q.is_correct) quizByCourse[cid].correct++
    }

    // Completed subtopics
    const completedSubtopicIds = new Set(
      userProgress.filter(p => p.completed).map(p => p.subtopic_id)
    )

    // Build courses array
    const coursesDetail = courses.map(c => {
      const subs = subtopicsByCourse[c.id] || []
      const quizStats = quizByCourse[c.id] || { total: 0, correct: 0 }
      const completedCount = subs.filter(s => completedSubtopicIds.has(s.id)).length
      return {
        id: c.id,
        title: c.title || 'Untitled Course',
        createdAt: c.created_at,
        subtopicCount: subs.length,
        completedSubtopics: completedCount,
        quizCount: quizStats.total,
        quizCorrect: quizStats.correct,
      }
    })

    // ── Engagement score ──────────────────────────────────────────────
    const totalInteractions =
      courses.length * 3 +
      quizSubmissions.length * 2 +
      journals.length * 2 +
      transcripts.length +
      askQuestions.length * 2 +
      challenges.length * 3 +
      discussions.length * 3 +
      feedbacks.length

    const engagementScore = Math.min(100, Math.round((totalInteractions / 50) * 100))

    // ── Prompt stage heuristic ────────────────────────────────────────
    const interactionCount = askQuestions.length + challenges.length + discussions.length
    let promptStage = 'N/A'
    if (interactionCount >= 15) promptStage = 'REFLECTIVE'
    else if (interactionCount >= 8) promptStage = 'MQP'
    else if (interactionCount >= 3) promptStage = 'SRP'
    else if (interactionCount >= 1) promptStage = 'SCP'

    // ── Course completion rate ────────────────────────────────────────
    const totalSubtopics = allSubtopics.length
    const completedSubtopicsCount = completedSubtopicIds.size
    const courseCompletionRate = totalSubtopics > 0
      ? Math.round((completedSubtopicsCount / totalSubtopics) * 100)
      : 0

    // ── Last activity ─────────────────────────────────────────────────
    const allDates = [
      ...courses.map(c => parseValidDate(c.created_at)),
      ...quizSubmissions.map(q => parseValidDate(q.submitted_at ?? q.created_at)),
      ...journals.map(j => parseValidDate(j.created_at)),
      ...transcripts.map(t => parseValidDate(t.created_at)),
      ...askQuestions.map(a => parseValidDate(a.created_at)),
      ...challenges.map(c => parseValidDate(c.created_at)),
      ...discussions.map(d => parseValidDate(d.updated_at ?? d.created_at)),
      ...feedbacks.map(f => parseValidDate(f.created_at)),
    ].filter((d): d is Date => d !== null)

    const lastActivityDate = allDates.length > 0
      ? new Date(Math.max(...allDates.map((d) => d.getTime())))
      : parseValidDate(user.created_at) ?? new Date()

    // ── Recent activity entries (combined and sorted) ─────────────────
    interface ActivityEntry { id: string; type: string; title: string; detail: string; timestamp: string }
    const recentActivity: ActivityEntry[] = []

    for (const c of courses.slice(0, 5)) {
      recentActivity.push({
        id: c.id, type: 'course',
        title: c.title || 'Untitled Course',
        detail: 'Course generated',
        timestamp: c.created_at,
      })
    }
    for (const q of quizSubmissions.slice(0, 5)) {
      recentActivity.push({
        id: q.id, type: 'quiz',
        title: `Quiz attempt — ${q.is_correct ? 'Correct' : 'Incorrect'}`,
        detail: q.reasoning_note ? q.reasoning_note.slice(0, 120) : '',
        timestamp: q.submitted_at ?? q.created_at,
      })
    }
    for (const j of journals.slice(0, 5)) {
      recentActivity.push({
        id: j.id, type: 'journal',
        title: typeof j.reflection === 'string' ? j.reflection.replace(/^Subtopic:\s*/i, '').slice(0, 80) : 'Journal entry',
        detail: typeof j.content === 'string' ? j.content.slice(0, 120) : '',
        timestamp: j.created_at,
      })
    }
    for (const t of transcripts.slice(0, 5)) {
      recentActivity.push({
        id: t.id, type: 'transcript',
        title: t.title || 'Transcript',
        detail: '',
        timestamp: t.created_at,
      })
    }
    for (const a of askQuestions.slice(0, 5)) {
      recentActivity.push({
        id: a.id, type: 'ask',
        title: 'Question asked',
        detail: typeof a.question === 'string' ? a.question.slice(0, 120) : '',
        timestamp: a.created_at,
      })
    }
    for (const ch of challenges.slice(0, 5)) {
      recentActivity.push({
        id: ch.id, type: 'challenge',
        title: `Challenge — ${ch.challenge_type ?? 'General'}`,
        detail: '',
        timestamp: ch.created_at,
      })
    }
    for (const d of discussions.slice(0, 5)) {
      recentActivity.push({
        id: d.id, type: 'discussion',
        title: `Discussion — ${d.status ?? 'N/A'}`,
        detail: `Phase: ${d.phase ?? 'N/A'}, Goals: ${Array.isArray(d.learning_goals) ? d.learning_goals.length : 0}`,
        timestamp: d.updated_at ?? d.created_at,
      })
    }
    for (const f of feedbacks.slice(0, 5)) {
      recentActivity.push({
        id: f.id, type: 'feedback',
        title: `Feedback — Rating ${f.rating ?? 'N/A'}`,
        detail: typeof f.comment === 'string' ? f.comment.slice(0, 120) : '',
        timestamp: f.created_at,
      })
    }

    // Sort by timestamp descending, take top 30
    recentActivity.sort((a, b) => {
      const aT = parseValidDate(a.timestamp)?.getTime() ?? 0
      const bT = parseValidDate(b.timestamp)?.getTime() ?? 0
      return bT - aT
    })
    const topActivity = recentActivity.slice(0, 30)

    // ── Activity timeline (daily counts for last 30 days) ─────────────
    const activityTimeline: Record<string, Record<string, number>> = {}
    for (const entry of recentActivity) {
      const date = toIsoDateOnly(entry.timestamp)
      if (!activityTimeline[date]) activityTimeline[date] = {}
      activityTimeline[date][entry.type] = (activityTimeline[date][entry.type] || 0) + 1
    }

    const timelineArray = Object.entries(activityTimeline)
      .map(([date, counts]) => ({ date, counts }))
      .sort((a, b) => b.date.localeCompare(a.date))

    // ── Learning profile ──────────────────────────────────────────────
    let learningProfileData = null
    if (learningProfile) {
      const lp = learningProfile
      learningProfileData = {
        displayName: lp.display_name ?? lp.displayName ?? user.name ?? '',
        programmingExperience: lp.programming_experience ?? lp.programmingExperience ?? '',
        learningStyle: lp.learning_style ?? lp.learningStyle ?? '',
        learningGoals: lp.learning_goals ?? lp.learningGoals ?? '',
        challenges: lp.challenges ?? '',
      }
    }

    // ── Build response ────────────────────────────────────────────────
    const response = {
      id: user.id,
      email: user.email,
      name: user.name || 'Unknown',
      role: (user.role || 'user').toUpperCase(),
      createdAt: user.created_at,
      totalCourses: courses.length,
      totalTranscripts: transcripts.length,
      totalQuizzes: quizSubmissions.length,
      totalJournals: journals.length,
      totalChallenges: challenges.length,
      totalAskQuestions: askQuestions.length,
      totalDiscussions: discussions.length,
      totalFeedbacks: feedbacks.length,
      promptStage,
      engagementScore,
      lastActivity: toIsoDateOnly(lastActivityDate),
      courseCompletionRate,
      learningProfile: learningProfileData,
      courses: coursesDetail,
      recentActivity: topActivity,
      activityTimeline: timelineArray,
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('[Student Detail] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to load student detail' },
      { status: 500 }
    )
  }
}
