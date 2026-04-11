// src/app/api/admin/siswa/[id]/evolusi/route.ts
// Endpoint: GET /api/admin/siswa/[id]/evolusi
// Returns per-student prompt evolution data for RM2 analysis

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { verifyAdminFromCookie } from '@/lib/admin-auth'

// ─── Types ───────────────────────────────────────────────────────────────────

interface PromptRow {
  id: string
  question: string
  prompt_stage: string | null
  session_number: number | null
  micro_markers: Record<string, unknown> | null
  created_at: string
}

interface SessionRow {
  id: string
  session_number: number
  dominant_stage: string | null
  total_prompts: number | null
  session_start: string | null
  session_end: string | null
}

interface ClassificationRow {
  id: string
  prompt_stage: string | null
  session_number: number | null
  created_at: string
}

// ─── GET Handler ─────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const admin = verifyAdminFromCookie(request)
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { id: userId } = await context.params

    // Validate UUID format
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return NextResponse.json({ error: 'Format ID tidak valid' }, { status: 400 })
    }

    // 1. Fetch prompt history from ask_question_history
    const { data: promptData, error: promptError } = await adminDb
      .from('ask_question_history')
      .select('id, question, prompt_stage, session_number, micro_markers, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (promptError) {
      // Table might not exist yet — return empty data
      if (promptError.code === 'PGRST205' || promptError.code === '42P01') {
        return NextResponse.json({ sessions: [], stageProgression: [], promptHistory: [] })
      }
      console.error('[Evolusi] Error fetching ask_question_history:', promptError)
      return NextResponse.json({ error: 'Gagal memuat riwayat pertanyaan' }, { status: 500 })
    }

    const prompts = (promptData ?? []) as unknown as PromptRow[]

    // 2. Fetch learning sessions
    let sessions: SessionRow[] = []
    const { data: sessionData, error: sessionError } = await adminDb
      .from('learning_sessions')
      .select('id, session_number, dominant_stage, total_prompts, session_start, session_end')
      .eq('user_id', userId)
      .order('session_number', { ascending: true })

    if (!sessionError) {
      sessions = (sessionData ?? []) as unknown as SessionRow[]
    } else if (sessionError.code !== 'PGRST205' && sessionError.code !== '42P01') {
      console.warn('[Evolusi] Error fetching learning_sessions:', sessionError.message)
    }

    // 3. Fetch manual classifications
    let classifications: ClassificationRow[] = []
    const { data: classData, error: classError } = await adminDb
      .from('prompt_classifications')
      .select('id, prompt_stage, session_number, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: true })

    if (!classError) {
      classifications = (classData ?? []) as unknown as ClassificationRow[]
    } else if (classError.code !== 'PGRST205' && classError.code !== '42P01') {
      console.warn('[Evolusi] Error fetching prompt_classifications:', classError.message)
    }

    // 4. Compute stage progression (distribution)
    const stageCounts: Record<string, number> = {}
    let totalClassified = 0

    for (const p of prompts) {
      const stage = p.prompt_stage || 'N/A'
      stageCounts[stage] = (stageCounts[stage] || 0) + 1
      totalClassified++
    }

    // Also include classifications that might not be in ask_question_history
    for (const c of classifications) {
      if (c.prompt_stage) {
        // Only count if we don't already have prompt data for this
        // (classifications may be manual overrides)
        const stage = c.prompt_stage
        if (!stageCounts[stage]) {
          stageCounts[stage] = 0
        }
      }
    }

    const stageProgression = Object.entries(stageCounts)
      .map(([stage, count]) => ({
        stage,
        count,
        percentage: totalClassified > 0 ? Math.round((count / totalClassified) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)

    // 5. Build sessions response
    const sessionsResponse = sessions.map((s) => ({
      session_number: s.session_number,
      dominant_stage: s.dominant_stage || 'N/A',
      total_prompts: s.total_prompts ?? 0,
      started_at: s.session_start,
      ended_at: s.session_end,
    }))

    // If no learning_sessions table data, derive sessions from prompt history
    if (sessionsResponse.length === 0 && prompts.length > 0) {
      const sessionMap = new Map<number, { prompts: PromptRow[]; stages: Record<string, number> }>()

      for (const p of prompts) {
        const sn = p.session_number ?? 1
        if (!sessionMap.has(sn)) {
          sessionMap.set(sn, { prompts: [], stages: {} })
        }
        const entry = sessionMap.get(sn)!
        entry.prompts.push(p)
        const stage = p.prompt_stage || 'N/A'
        entry.stages[stage] = (entry.stages[stage] || 0) + 1
      }

      for (const [sn, entry] of Array.from(sessionMap.entries()).sort((a, b) => a[0] - b[0])) {
        // Find dominant stage
        let dominant = 'N/A'
        let maxCount = 0
        for (const [stage, count] of Object.entries(entry.stages)) {
          if (count > maxCount) {
            dominant = stage
            maxCount = count
          }
        }

        sessionsResponse.push({
          session_number: sn,
          dominant_stage: dominant,
          total_prompts: entry.prompts.length,
          started_at: entry.prompts[0]?.created_at ?? null,
          ended_at: entry.prompts[entry.prompts.length - 1]?.created_at ?? null,
        })
      }
    }

    // 6. Build prompt history response
    const promptHistory = prompts.map((p) => ({
      id: p.id,
      question: p.question,
      prompt_stage: p.prompt_stage || 'N/A',
      session_number: p.session_number,
      micro_markers: p.micro_markers,
      created_at: p.created_at,
    }))

    return NextResponse.json({
      sessions: sessionsResponse,
      stageProgression,
      promptHistory,
    })
  } catch (error: unknown) {
    console.error('[Evolusi] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Terjadi kesalahan saat memuat data evolusi' },
      { status: 500 }
    )
  }
}
