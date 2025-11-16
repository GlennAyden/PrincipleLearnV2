import { NextRequest, NextResponse } from 'next/server'
import { DatabaseService } from '@/lib/database'
import { ensureDiscussionSessionSeeded } from '@/lib/activitySeed'

type DiscussionSessionRow = {
  id: string
  user_id: string
  course_id: string
  subtopic_id: string
  status: string
  phase: string
  learning_goals: any
  created_at: string
  updated_at: string
}

type DiscussionMessageRow = {
  id: string
  session_id: string
  role: 'agent' | 'student' | 'system'
  content: string
  step_key: string | null
  metadata: any
  created_at: string
}

type GoalState = {
  id: string
  description: string
  covered: boolean
  thinkingSkill?: {
    domain?: string
    indicator?: string
    indicatorDescription?: string
  } | null
}

type UserRow = { id: string; email: string | null }
type CourseRow = { id: string; title: string | null }
type SubtopicRow = { id: string; title: string | null }

export async function GET(req: NextRequest) {
  try {
    await ensureDiscussionSessionSeeded();
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const date = searchParams.get('date')
    const courseId = searchParams.get('course')
    const topicFilter = searchParams.get('topic')

    let sessions: DiscussionSessionRow[] = []
    try {
      sessions = await DatabaseService.getRecords<DiscussionSessionRow>('discussion_sessions', {
        orderBy: { column: 'created_at', ascending: false },
      })
    } catch (error) {
      console.error('[Activity][Discussion] Failed to fetch discussion sessions:', error)
      return NextResponse.json([], { status: 200 })
    }

    if (userId) {
      sessions = sessions.filter((session) => session.user_id === userId)
    }
    if (courseId) {
      sessions = sessions.filter((session) => session.course_id === courseId)
    }
    if (date) {
      const target = new Date(date)
      const start = new Date(target)
      start.setHours(0, 0, 0, 0)
      const end = new Date(target)
      end.setHours(23, 59, 59, 999)
      sessions = sessions.filter((session) => {
        const createdAt = new Date(session.created_at)
        return createdAt >= start && createdAt <= end
      })
    }

    const userCache = new Map<string, UserRow | null>()
    const courseCache = new Map<string, CourseRow | null>()
    const subtopicCache = new Map<string, SubtopicRow | null>()

    const payload = []
    for (const session of sessions) {
      const [user, course, subtopic] = await Promise.all([
        fetchCached(userCache, session.user_id, 'users'),
        fetchCached(courseCache, session.course_id, 'courses'),
        fetchCached(subtopicCache, session.subtopic_id, 'subtopics'),
      ])

      const topicTitle = subtopic?.title ?? 'Tanpa Subtopik'
      if (topicFilter && !topicTitle.toLowerCase().includes(topicFilter.toLowerCase())) {
        continue
      }

      const messages = await DatabaseService.getRecords<DiscussionMessageRow>('discussion_messages', {
        filter: { session_id: session.id },
        orderBy: { column: 'created_at', ascending: true },
      })

      const goals = normalizeGoals(session.learning_goals)
      const goalMap = new Map(goals.map((goal) => [goal.id, goal]))

      const exchanges = buildExchanges(messages, goalMap)

      payload.push({
        id: session.id,
        timestamp: new Date(session.created_at).toLocaleString('id-ID'),
        status: session.status,
        phase: session.phase,
        userEmail: user?.email ?? 'Unknown User',
        userId: session.user_id,
        courseTitle: course?.title ?? 'Tanpa Kursus',
        subtopicTitle: topicTitle,
        goals,
        exchanges,
      })
    }

    return NextResponse.json(payload)
  } catch (error) {
    console.error('[Activity][Discussion] Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to fetch discussion logs' }, { status: 500 })
  }
}

function normalizeGoals(rawGoals: any): GoalState[] {
  if (!Array.isArray(rawGoals)) return []
  return rawGoals
    .filter(Boolean)
    .map((goal: any) => ({
      id: goal?.id ?? '',
      description: goal?.description ?? '',
      covered: Boolean(goal?.covered),
      thinkingSkill: goal?.thinkingSkill ?? goal?.thinking_skill ?? null,
    }))
    .filter((goal: GoalState) => goal.id)
}

function buildExchanges(messages: DiscussionMessageRow[], goalMap: Map<string, GoalState>) {
  const exchanges: Array<{
    stepKey: string | null
    prompt: string
    response?: string
    coachFeedback?: string
    thinkingSkills: GoalState[]
  }> = []

  let currentPrompt: DiscussionMessageRow | null = null

  for (const msg of messages) {
    if (msg.role === 'agent') {
      const metaType = msg.metadata?.type
      if (metaType === 'coach_feedback' && exchanges.length > 0) {
        exchanges[exchanges.length - 1].coachFeedback = msg.content
        continue
      }
      if (metaType === 'closing') {
        currentPrompt = null
        continue
      }
      currentPrompt = msg
    }

    if (msg.role === 'student') {
      const evaluation = msg.metadata?.evaluation ?? {}
      const coveredGoals: string[] = Array.isArray(evaluation.coveredGoals) ? evaluation.coveredGoals : []
      const thinkingSkills = coveredGoals
        .map((goalId) => goalMap.get(goalId))
        .filter((goal): goal is GoalState => Boolean(goal))

      exchanges.push({
        stepKey: msg.step_key ?? currentPrompt?.step_key ?? msg.id,
        prompt: currentPrompt?.content ?? 'Pertanyaan diskusi',
        response: msg.content,
        thinkingSkills,
      })
    }
  }

  return exchanges
}

async function fetchCached<T extends { id: string }>(
  cache: Map<string, T | null>,
  id: string | null,
  table: string
): Promise<T | null> {
  if (!id) return null
  if (cache.has(id)) return cache.get(id) ?? null
  try {
    const [record] = await DatabaseService.getRecords<T>(table, {
      filter: { id },
      limit: 1,
    })
    cache.set(id, record ?? null)
    return record ?? null
  } catch (error) {
    console.error(`[Activity][Discussion] Failed to fetch ${table} record ${id}:`, error)
    cache.set(id, null)
    return null
  }
}
