// src/app/api/admin/live/metrics/route.ts
// Live metrics endpoint for the /admin/live real-time monitor screen.
// No assertResearchModeOnly — admin needs this in both modes for live demo.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET!

interface ApiLogRow {
  path: string | null
  status_code: number | null
  user_email: string | null
  label: string | null
  created_at: string | null
  metadata: Record<string, unknown> | null
}

interface LearningSessionRow {
  id: string
  user_id: string
  started_at: string
  ended_at: string | null
}

interface PromptClassRow {
  prompt_stage: string
  created_at: string
}

function verifyAdmin(request: NextRequest): boolean {
  const token = request.cookies.get('access_token')?.value
  if (!token) return false
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { role?: string }
    return payload.role?.toLowerCase() === 'admin'
  } catch {
    return false
  }
}

export async function GET(request: NextRequest) {
  if (!verifyAdmin(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()

  // --- Active sessions: learning_sessions started < 30 min ago, not ended ---
  const session30MinAgo = new Date(now.getTime() - 30 * 60 * 1000)
  const { data: sessionData } = await adminDb
    .from('learning_sessions')
    .select('id, user_id, started_at, ended_at')
    .gte('started_at', session30MinAgo.toISOString())
    .is('ended_at', null)
    .limit(500)

  const sessions = (Array.isArray(sessionData) ? sessionData : []) as LearningSessionRow[]
  const activeSessions = sessions.length
  const activeUserIds = new Set(sessions.map(s => s.user_id))
  const activeUsers = activeUserIds.size

  // --- api_logs: fetch last 200 rows from today for tokens + events ---
  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)

  const { data: logsData } = await adminDb
    .from('api_logs')
    .select('path, status_code, user_email, label, created_at, metadata')
    .gte('created_at', todayStart.toISOString())
    .order('created_at', { ascending: false })
    .limit(200)

  const logs = (Array.isArray(logsData) ? logsData : []) as ApiLogRow[]

  // Token estimation: sum metadata.tokens when present, else estimate 800 per AI call
  const AI_PATHS = ['/api/ask-question', '/api/challenge-thinking', '/api/generate-course', '/api/generate-subtopic', '/api/generate-examples']
  let tokensToday: number | null = null
  let hasTokenData = false

  for (const log of logs) {
    const isAiCall = AI_PATHS.some(p => (log.path || '').startsWith(p))
    if (!isAiCall) continue
    const tokens = log.metadata?.tokens
    if (typeof tokens === 'number') {
      tokensToday = (tokensToday ?? 0) + tokens
      hasTokenData = true
    } else {
      // Estimate: 800 avg tokens per AI call
      tokensToday = (tokensToday ?? 0) + 800
    }
  }

  // --- Bloom/Prompt stage distribution — last 24h from prompt_classifications ---
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000)
  const { data: classData } = await adminDb
    .from('prompt_classifications')
    .select('prompt_stage, created_at')
    .gte('created_at', yesterday.toISOString())
    .limit(1000)

  const classifications = (Array.isArray(classData) ? classData : []) as PromptClassRow[]

  // Map prompt stages to Bloom taxonomy labels used in E4
  const bloomMap: Record<string, string> = {
    SCP: 'apply',
    SRP: 'analyze',
    MQP: 'evaluate',
    REFLECTIVE: 'create',
  }

  const bloomDistribution: { apply: number; analyze: number; evaluate: number; create: number } = {
    apply: 0, analyze: 0, evaluate: 0, create: 0,
  }

  for (const c of classifications) {
    const bloom = bloomMap[c.prompt_stage] as keyof typeof bloomDistribution
    if (bloom) bloomDistribution[bloom]++
  }

  // --- Latest events: last 10 api_logs rows (all-time, most recent) ---
  const { data: eventsData } = await adminDb
    .from('api_logs')
    .select('path, status_code, user_email, label, created_at')
    .order('created_at', { ascending: false })
    .limit(10)

  interface EventRow {
    path: string | null
    status_code: number | null
    user_email: string | null
    label: string | null
    created_at: string | null
  }

  const latestEvents = ((Array.isArray(eventsData) ? eventsData : []) as EventRow[]).map(row => ({
    label: row.label || row.path || '—',
    user_email: row.user_email || 'anonim',
    status_code: row.status_code,
    created_at: row.created_at || '',
  }))

  return NextResponse.json({
    activeSessions,
    activeUsers,
    tokensToday: hasTokenData || tokensToday !== null ? tokensToday : null,
    bloomDistribution,
    latestEvents,
    generatedAt: now.toISOString(),
  })
}
