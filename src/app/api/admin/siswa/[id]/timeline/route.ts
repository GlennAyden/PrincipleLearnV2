// src/app/api/admin/siswa/[id]/timeline/route.ts
// GET /api/admin/siswa/[id]/timeline?range=day|week|all
// Returns chronological activity events for a student for the timeline chart.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { verifyAdminFromCookie } from '@/lib/admin-auth'

export interface TimelineEvent {
  kind: 'session' | 'ask' | 'quiz' | 'challenge' | 'jurnal' | 'artifact'
  at: string          // ISO timestamp
  label: string
  sublabel?: string
  metadata?: Record<string, unknown>
}

type Range = 'day' | 'week' | 'all'

function buildCutoff(range: Range): string | null {
  if (range === 'all') return null
  const now = new Date()
  if (range === 'day') {
    const d = new Date(now)
    d.setHours(0, 0, 0, 0)
    return d.toISOString()
  }
  // week: 7 rolling days
  const w = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return w.toISOString()
}

type SupabaseRow = Record<string, unknown>

async function safeQuery<T extends SupabaseRow>(
  qb: ReturnType<typeof adminDb.from>
): Promise<T[]> {
  try {
    const { data, error } = await qb
    if (error) return []
    return (data ?? []) as T[]
  } catch {
    return []
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const adminCheck = verifyAdminFromCookie(req)
  if (!adminCheck) {
    return NextResponse.json({ error: 'Akses ditolak' }, { status: 401 })
  }

  const { id: userId } = await params
  if (!userId) {
    return NextResponse.json({ error: 'userId diperlukan' }, { status: 400 })
  }

  const range = (req.nextUrl.searchParams.get('range') ?? 'all') as Range
  const cutoff = buildCutoff(range)

  const events: TimelineEvent[] = []

  // ── 1. Learning sessions ───────────────────────────────────────────
  {
    const q = cutoff
      ? adminDb.from('learning_sessions').select('id, started_at, ended_at, duration_seconds, mode').eq('user_id', userId).gte('started_at', cutoff).order('started_at', { ascending: true })
      : adminDb.from('learning_sessions').select('id, started_at, ended_at, duration_seconds, mode').eq('user_id', userId).order('started_at', { ascending: true })
    const rows = await safeQuery<{ id: string; started_at: string; ended_at: string | null; duration_seconds: number | null; mode: string | null }>(q)
    for (const s of rows) {
      const dur = s.duration_seconds != null ? `${Math.round(s.duration_seconds / 60)} mnt` : null
      events.push({
        kind: 'session',
        at: s.started_at,
        label: 'Sesi Belajar',
        sublabel: dur ? `Durasi: ${dur}` : undefined,
        metadata: { id: s.id, mode: s.mode, ended_at: s.ended_at },
      })
    }
  }

  // ── 2. Ask question history ────────────────────────────────────────
  {
    const q = cutoff
      ? adminDb.from('ask_question_history').select('id, question, created_at, course_id').eq('user_id', userId).gte('created_at', cutoff).order('created_at', { ascending: true })
      : adminDb.from('ask_question_history').select('id, question, created_at, course_id').eq('user_id', userId).order('created_at', { ascending: true })
    const rows = await safeQuery<{ id: string; question: string | null; created_at: string; course_id: string | null }>(q)
    for (const a of rows) {
      const q2 = a.question ?? ''
      events.push({
        kind: 'ask',
        at: a.created_at,
        label: 'Tanya AI',
        sublabel: q2.length > 80 ? q2.slice(0, 80) + '...' : q2 || undefined,
        metadata: { id: a.id, course_id: a.course_id },
      })
    }
  }

  // ── 3. Quiz submissions ────────────────────────────────────────────
  {
    const q = cutoff
      ? adminDb.from('quiz_submissions').select('id, created_at, score, course_id').eq('user_id', userId).gte('created_at', cutoff).order('created_at', { ascending: true })
      : adminDb.from('quiz_submissions').select('id, created_at, score, course_id').eq('user_id', userId).order('created_at', { ascending: true })
    const rows = await safeQuery<{ id: string; created_at: string; score: number | null; course_id: string | null }>(q)
    for (const q2 of rows) {
      events.push({
        kind: 'quiz',
        at: q2.created_at,
        label: 'Kuis',
        sublabel: q2.score != null ? `Skor: ${q2.score}` : undefined,
        metadata: { id: q2.id, course_id: q2.course_id, score: q2.score },
      })
    }
  }

  // ── 4. Challenge responses ─────────────────────────────────────────
  {
    const q = cutoff
      ? adminDb.from('challenge_responses').select('id, created_at, course_id, response').eq('user_id', userId).gte('created_at', cutoff).order('created_at', { ascending: true })
      : adminDb.from('challenge_responses').select('id, created_at, course_id, response').eq('user_id', userId).order('created_at', { ascending: true })
    const rows = await safeQuery<{ id: string; created_at: string; course_id: string | null; response: string | null }>(q)
    for (const c of rows) {
      const r = c.response ?? ''
      events.push({
        kind: 'challenge',
        at: c.created_at,
        label: 'Challenge',
        sublabel: r.length > 80 ? r.slice(0, 80) + '...' : r || undefined,
        metadata: { id: c.id, course_id: c.course_id },
      })
    }
  }

  // ── 5. Jurnal (refleksi) ──────────────────────────────────────────
  {
    const q = cutoff
      ? adminDb.from('jurnal').select('id, created_at, content, course_id').eq('user_id', userId).gte('created_at', cutoff).order('created_at', { ascending: true })
      : adminDb.from('jurnal').select('id, created_at, content, course_id').eq('user_id', userId).order('created_at', { ascending: true })
    const rows = await safeQuery<{ id: string; created_at: string; content: string | null; course_id: string | null }>(q)
    for (const j of rows) {
      const c = j.content ?? ''
      events.push({
        kind: 'jurnal',
        at: j.created_at,
        label: 'Jurnal',
        sublabel: c.length > 80 ? c.slice(0, 80) + '...' : c || undefined,
        metadata: { id: j.id, course_id: j.course_id },
      })
    }
  }

  // ── 6. Research artifacts ─────────────────────────────────────────
  {
    const q = cutoff
      ? adminDb.from('research_artifacts').select('id, created_at, artifact_type, component_score, completion_status').eq('user_id', userId).gte('created_at', cutoff).order('created_at', { ascending: true })
      : adminDb.from('research_artifacts').select('id, created_at, artifact_type, component_score, completion_status').eq('user_id', userId).order('created_at', { ascending: true })
    const rows = await safeQuery<{ id: string; created_at: string; artifact_type: string | null; component_score: number | null; completion_status: string | null }>(q)
    for (const a of rows) {
      events.push({
        kind: 'artifact',
        at: a.created_at,
        label: 'Artefak Interaktif',
        sublabel: a.artifact_type ?? undefined,
        metadata: {
          id: a.id,
          artifact_type: a.artifact_type,
          score: a.component_score,
          status: a.completion_status,
        },
      })
    }
  }

  // Sort by timestamp ascending
  events.sort((a, b) => a.at.localeCompare(b.at))

  return NextResponse.json({ events })
}
