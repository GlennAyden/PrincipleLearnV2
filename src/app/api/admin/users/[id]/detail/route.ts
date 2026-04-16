// src/app/api/admin/users/[id]/detail/route.ts
// Comprehensive student detail API - courses, activity, learning profile

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { verifyToken } from '@/lib/jwt'
import { computeEngagementScore } from '@/lib/engagement'
import { buildRecentReflection, countUnifiedReflections } from '@/lib/admin-reflection-summary'
import { normalizeText } from '@/lib/reflection-submission'

// Row interfaces
interface UserDetailRow {
  id: string
  email: string
  name?: string
  role: string
  created_at: string
  updated_at?: string
}

interface CourseDetailRow {
  id: string
  title: string
  created_at: string
}

interface QuizDetailRow {
  id: string
  quiz_id: string
  course_id: string
  subtopic_id: string
  answer: string
  is_correct: boolean
  reasoning_note?: string
  created_at: string
}

interface JournalDetailRow {
  id: string
  content: unknown
  reflection?: string
  course_id: string
  created_at: string
  subtopic_label?: string
}

interface TranscriptDetailRow {
  id: string
  content?: string
  created_at: string
}

interface AskDetailRow {
  id: string
  question: string
  course_id: string
  subtopic_label: string
  created_at: string
}

interface ChallengeDetailRow {
  id: string
  question?: string
  module_index?: number
  course_id: string
  created_at: string
}

interface DiscussionDetailRow {
  id: string
  status: string
  phase?: string
  learning_goals: unknown
  updated_at: string
  created_at: string
}

interface FeedbackDetailRow {
  id: string
  rating?: number
  comment?: string
  created_at: string
}

interface ProgressDetailRow {
  id: string
  subtopic_id: string
  is_completed: boolean
  created_at: string
}

interface SubtopicDetailRow {
  id: string
  course_id: string
  title: string
  order_index?: number
}

interface LearningProfileRow {
  display_name?: string
  displayName?: string
  programming_experience?: string
  programmingExperience?: string
  learning_style?: string
  learningStyle?: string
  learning_goals?: string
  learningGoals?: string
  challenges?: string
  [key: string]: unknown
}

function requireAdmin(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  const payload = token ? verifyToken(token) : null
  if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') return null
  return payload
}

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

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const admin = requireAdmin(request)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { id: userId } = await context.params
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    const { data: userRecord, error: userError } = await adminDb
      .from('users')
      .select('id, email, name, role, created_at, updated_at, deleted_at')
      .eq('id', userId)
      .is('deleted_at', null)
      .maybeSingle()

    if (userError || !userRecord) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const user = userRecord as unknown as UserDetailRow

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
        'courses',
        []
      ),
      safeQuery<QuizDetailRow[]>(
        adminDb.from('quiz_submissions').select('id, quiz_id, course_id, subtopic_id, answer, is_correct, reasoning_note, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        'quiz_submissions',
        []
      ),
      safeQuery<JournalDetailRow[]>(
        adminDb.from('jurnal').select('id, content, reflection, course_id, created_at, subtopic_label').eq('user_id', userId).order('created_at', { ascending: false }),
        'journals',
        []
      ),
      safeQuery<TranscriptDetailRow[]>(
        adminDb.from('transcript').select('id, content, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        'transcripts',
        []
      ),
      safeQuery<AskDetailRow[]>(
        adminDb.from('ask_question_history').select('id, question, course_id, subtopic_label, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        'ask_questions',
        []
      ),
      safeQuery<ChallengeDetailRow[]>(
        adminDb.from('challenge_responses').select('id, question, module_index, course_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        'challenges',
        []
      ),
      safeQuery<DiscussionDetailRow[]>(
        adminDb.from('discussion_sessions').select('id, status, phase, learning_goals, updated_at, created_at').eq('user_id', userId).order('updated_at', { ascending: false }),
        'discussions',
        []
      ),
      safeQuery<FeedbackDetailRow[]>(
        adminDb.from('feedback').select('id, rating, comment, created_at').eq('user_id', userId).order('created_at', { ascending: false }),
        'feedbacks',
        []
      ),
      safeQuery<ProgressDetailRow[]>(
        adminDb.from('user_progress').select('id, subtopic_id, is_completed, created_at').eq('user_id', userId),
        'user_progress',
        []
      ),
      safeQuery<LearningProfileRow | null>(
        adminDb.from('learning_profiles').select('*').eq('user_id', userId).maybeSingle(),
        'learning_profile',
        null
      ),
    ])

    const courseIds = courses.map((course) => course.id)
    let allSubtopics: SubtopicDetailRow[] = []
    if (courseIds.length > 0) {
      for (const courseId of courseIds) {
        const subtopics = await safeQuery<SubtopicDetailRow[]>(
          adminDb.from('subtopics').select('id, course_id, title, order_index').eq('course_id', courseId),
          `subtopics for ${courseId}`,
          []
        )
        allSubtopics = allSubtopics.concat(subtopics)
      }
    }

    const subtopicsByCourse: Record<string, SubtopicDetailRow[]> = {}
    for (const subtopic of allSubtopics) {
      if (!subtopicsByCourse[subtopic.course_id]) {
        subtopicsByCourse[subtopic.course_id] = []
      }
      subtopicsByCourse[subtopic.course_id].push(subtopic)
    }

    const quizByCourse: Record<string, { total: number; correct: number }> = {}
    for (const quiz of quizSubmissions) {
      if (!quiz.course_id) continue
      if (!quizByCourse[quiz.course_id]) {
        quizByCourse[quiz.course_id] = { total: 0, correct: 0 }
      }
      quizByCourse[quiz.course_id].total += 1
      if (quiz.is_correct) {
        quizByCourse[quiz.course_id].correct += 1
      }
    }

    const completedSubtopicIds = new Set(
      userProgress.filter((progress) => progress.is_completed).map((progress) => progress.subtopic_id)
    )

    const coursesDetail = courses.map((course) => {
      const subtopics = subtopicsByCourse[course.id] || []
      const quizStats = quizByCourse[course.id] || { total: 0, correct: 0 }
      const completedCount = subtopics.filter((subtopic) => completedSubtopicIds.has(subtopic.id)).length

      return {
        id: course.id,
        title: course.title || 'Untitled Course',
        createdAt: course.created_at,
        subtopicCount: subtopics.length,
        completedSubtopics: completedCount,
        quizCount: quizStats.total,
        quizCorrect: quizStats.correct,
      }
    })

    const reflectionCount = countUnifiedReflections(journals.length, feedbacks.length)

    const engagementScore = computeEngagementScore({
      courses: courses.length,
      quizzes: quizSubmissions.length,
      journals: reflectionCount,
      transcripts: transcripts.length,
      askQuestions: askQuestions.length,
      challenges: challenges.length,
      discussions: discussions.length,
      feedbacks: feedbacks.length,
    })

    const interactionCount = askQuestions.length + challenges.length + discussions.length
    let promptStage = 'N/A'
    if (interactionCount >= 15) promptStage = 'REFLECTIVE'
    else if (interactionCount >= 8) promptStage = 'MQP'
    else if (interactionCount >= 3) promptStage = 'SRP'
    else if (interactionCount >= 1) promptStage = 'SCP'

    const totalSubtopics = allSubtopics.length
    const completedSubtopicsCount = completedSubtopicIds.size
    const courseCompletionRate = totalSubtopics > 0
      ? Math.round((completedSubtopicsCount / totalSubtopics) * 100)
      : 0

    const allDates = [
      ...courses.map((course) => parseValidDate(course.created_at)),
      ...quizSubmissions.map((quiz) => parseValidDate(quiz.created_at)),
      ...journals.map((journal) => parseValidDate(journal.created_at)),
      ...transcripts.map((transcript) => parseValidDate(transcript.created_at)),
      ...askQuestions.map((ask) => parseValidDate(ask.created_at)),
      ...challenges.map((challenge) => parseValidDate(challenge.created_at)),
      ...discussions.map((discussion) => parseValidDate(discussion.updated_at ?? discussion.created_at)),
      ...feedbacks.map((feedback) => parseValidDate(feedback.created_at)),
    ].filter((date): date is Date => date !== null)

    const lastActivityDate = allDates.length > 0
      ? new Date(Math.max(...allDates.map((date) => date.getTime())))
      : parseValidDate(user.created_at) ?? new Date()

    interface ActivityEntry {
      id: string
      type: 'course' | 'quiz' | 'reflection' | 'transcript' | 'ask' | 'challenge' | 'discussion'
      title: string
      detail: string
      timestamp: string
    }

    const recentActivity: ActivityEntry[] = []

    for (const course of courses.slice(0, 5)) {
      recentActivity.push({
        id: course.id,
        type: 'course',
        title: course.title || 'Untitled Course',
        detail: 'Course generated',
        timestamp: course.created_at,
      })
    }

    for (const quiz of quizSubmissions.slice(0, 5)) {
      recentActivity.push({
        id: quiz.id,
        type: 'quiz',
        title: `Quiz attempt - ${quiz.is_correct ? 'Correct' : 'Incorrect'}`,
        detail: quiz.reasoning_note ? quiz.reasoning_note.slice(0, 120) : '',
        timestamp: quiz.created_at,
      })
    }

    const reflectionEntries = journals.length > 0
      ? journals.slice(0, 5).map((journal) => ({
          id: journal.id,
          type: 'reflection' as const,
          title: normalizeText(journal.reflection) || normalizeText(journal.subtopic_label) || 'Refleksi terbaru',
          detail: typeof journal.content === 'string' ? journal.content.slice(0, 120) : '',
          timestamp: journal.created_at,
        }))
      : feedbacks.slice(0, 5).map((feedback) => ({
          id: feedback.id,
          type: 'reflection' as const,
          title: `Refleksi - Rating ${feedback.rating ?? 'N/A'}`,
          detail: typeof feedback.comment === 'string' ? feedback.comment.slice(0, 120) : '',
          timestamp: feedback.created_at,
        }))

    recentActivity.push(...reflectionEntries)

    for (const transcript of transcripts.slice(0, 5)) {
      recentActivity.push({
        id: transcript.id,
        type: 'transcript',
        title: transcript.content ? (typeof transcript.content === 'string' ? transcript.content.slice(0, 80) : 'Transcript') : 'Transcript',
        detail: '',
        timestamp: transcript.created_at,
      })
    }

    for (const ask of askQuestions.slice(0, 5)) {
      recentActivity.push({
        id: ask.id,
        type: 'ask',
        title: 'Question asked',
        detail: typeof ask.question === 'string' ? ask.question.slice(0, 120) : '',
        timestamp: ask.created_at,
      })
    }

    for (const challenge of challenges.slice(0, 5)) {
      recentActivity.push({
        id: challenge.id,
        type: 'challenge',
        title: `Challenge - Module ${challenge.module_index ?? 'N/A'}`,
        detail: '',
        timestamp: challenge.created_at,
      })
    }

    for (const discussion of discussions.slice(0, 5)) {
      recentActivity.push({
        id: discussion.id,
        type: 'discussion',
        title: `Discussion - ${discussion.status ?? 'N/A'}`,
        detail: `Phase: ${discussion.phase ?? 'N/A'}, Goals: ${Array.isArray(discussion.learning_goals) ? discussion.learning_goals.length : 0}`,
        timestamp: discussion.updated_at ?? discussion.created_at,
      })
    }

    recentActivity.sort((a, b) => {
      const aTime = parseValidDate(a.timestamp)?.getTime() ?? 0
      const bTime = parseValidDate(b.timestamp)?.getTime() ?? 0
      return bTime - aTime
    })
    const topActivity = recentActivity.slice(0, 30)

    const activityTimeline: Record<string, Record<string, number>> = {}
    for (const entry of recentActivity) {
      const date = toIsoDateOnly(entry.timestamp)
      if (!activityTimeline[date]) activityTimeline[date] = {}
      activityTimeline[date][entry.type] = (activityTimeline[date][entry.type] || 0) + 1
    }

    const timelineArray = Object.entries(activityTimeline)
      .map(([date, counts]) => ({ date, counts }))
      .sort((a, b) => b.date.localeCompare(a.date))

    let learningProfileData = null
    if (learningProfile) {
      const profile = learningProfile
      learningProfileData = {
        displayName: profile.display_name ?? profile.displayName ?? user.name ?? '',
        programmingExperience: profile.programming_experience ?? profile.programmingExperience ?? '',
        learningStyle: profile.learning_style ?? profile.learningStyle ?? '',
        learningGoals: profile.learning_goals ?? profile.learningGoals ?? '',
        challenges: profile.challenges ?? '',
      }
    }

    const recentReflection = buildRecentReflection(journals[0] ?? null, feedbacks[0] ?? null)

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
      totalReflections: reflectionCount,
      totalChallenges: challenges.length,
      totalAskQuestions: askQuestions.length,
      totalDiscussions: discussions.length,
      totalFeedbacks: feedbacks.length,
      recentReflection,
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
