// src/app/api/admin/siswa/[id]/evolusi/route.ts
// Endpoint: GET /api/admin/siswa/[id]/evolusi
// Returns per-student prompt evolution data for RM2 analysis

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { verifyAdminFromCookie } from '@/lib/admin-auth'
import { getWeekBucket, normalizeMicroMarkers } from '@/lib/research-normalizers'

interface PromptRow {
  id: string
  question: string | null
  answer?: string | null
  course_id?: string | null
  learning_session_id?: string | null
  prompt_stage?: string | null
  stage_confidence?: number | string | null
  session_number?: number | null
  micro_markers?: unknown
  coding_status?: string | null
  research_validity_status?: string | null
  researcher_notes?: string | null
  raw_evidence_snapshot?: Record<string, unknown> | null
  data_collection_week?: string | null
  is_follow_up?: boolean | null
  created_at: string
}

interface SessionRow {
  id: string
  session_number: number
  dominant_stage: string | null
  total_prompts: number | null
  session_start: string | null
  session_end: string | null
  data_collection_week?: string | null
  readiness_status?: string | null
  readiness_score?: number | null
}

interface ClassificationRow {
  id: string
  prompt_id?: string | null
  prompt_source?: string | null
  prompt_stage: string | null
  micro_markers?: unknown
  learning_session_id: string | null
  confidence_level?: number | string | null
  coding_notes?: string | null
  created_at: string
}

interface ResearchEvidenceRow {
  id: string
  source_id?: string | null
  prompt_id?: string | null
  source_type?: string | null
  prompt_source?: string | null
  evidence_text?: string | null
  evidence_excerpt?: string | null
  summary_excerpt?: string | null
  coding_status?: string | null
  research_validity_status?: string | null
  validity_status?: string | null
  researcher_notes?: string | null
  raw_evidence_snapshot?: Record<string, unknown> | null
  data_collection_week?: string | null
  prompt_stage?: string | null
  metadata?: Record<string, unknown> | null
  created_at?: string | null
}

const MISSING_TABLE_CODES = new Set(['PGRST205', '42P01'])
const MISSING_COLUMN_CODES = new Set(['42703', 'PGRST204'])
type QueryBuilder = ReturnType<typeof adminDb.from>

function getErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : null
}

function isMissingTableError(error: unknown): boolean {
  const code = getErrorCode(error)
  return code ? MISSING_TABLE_CODES.has(code) : false
}

function isMissingColumnError(error: unknown): boolean {
  const code = getErrorCode(error)
  return code ? MISSING_COLUMN_CODES.has(code) : false
}

function isSchemaGapError(error: unknown): boolean {
  return isMissingTableError(error) || isMissingColumnError(error)
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) {
      return value.trim()
    }
  }
  return null
}

function firstNumber(...values: unknown[]): number | null {
  for (const value of values) {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value
    }
    if (typeof value === 'string' && value.trim()) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) {
        return parsed
      }
    }
  }
  return null
}

function firstBoolean(...values: unknown[]): boolean | null {
  for (const value of values) {
    if (typeof value === 'boolean') {
      return value
    }
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase()
      if (normalized === 'true') return true
      if (normalized === 'false') return false
    }
  }
  return null
}

function firstObject(...values: unknown[]): Record<string, unknown> | null {
  for (const value of values) {
    if (!value) continue
    if (typeof value === 'object' && !Array.isArray(value)) {
      return value as Record<string, unknown>
    }
    if (typeof value === 'string') {
      try {
        const parsed = JSON.parse(value) as unknown
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          return parsed as Record<string, unknown>
        }
      } catch {
        // Ignore non-JSON strings.
      }
    }
  }
  return null
}

function summarizeSnapshot(value: unknown): string | null {
  const record = firstObject(value)
  if (!record) return null

  return firstString(
    record.evidence_excerpt,
    record.summary_excerpt,
    record.evidence_text,
    record.prompt_text,
    record.question,
    record.answer,
    record.ai_response,
    record.response
  )
}

function getEvidenceSourceId(row: ResearchEvidenceRow): string | null {
  const directId = firstString(row.source_id, row.prompt_id)
  if (directId) return directId

  const metadata = firstObject(row.metadata)
  return firstString(metadata?.source_id, metadata?.prompt_id)
}

async function selectRowsWithFallback<T>(
  tableName: string,
  selectOptions: string[],
  configure: (query: QueryBuilder) => QueryBuilder
): Promise<{ data: T[]; error: unknown | null }> {
  for (const selectFields of selectOptions) {
    const { data, error } = await configure(adminDb.from(tableName).select(selectFields))

    if (!error) {
      return { data: (data ?? []) as T[], error: null }
    }

    if (isMissingTableError(error)) {
      return { data: [], error }
    }

    if (!isMissingColumnError(error)) {
      return { data: [], error }
    }
  }

  return { data: [], error: null }
}

async function fetchEvidenceByPromptIds(promptIds: string[]): Promise<Map<string, ResearchEvidenceRow[]>> {
  if (promptIds.length === 0) {
    return new Map()
  }

  const attempts: Array<() => QueryBuilder> = [
    () =>
      adminDb
        .from('research_evidence_items')
        .select('*')
        .eq('source_type', 'ask_question')
        .in('source_id', promptIds)
        .order('created_at', { ascending: true }),
    () =>
      adminDb
        .from('research_evidence_items')
        .select('*')
        .in('source_id', promptIds)
        .order('created_at', { ascending: true }),
    () =>
      adminDb
        .from('research_evidence_items')
        .select('*')
        .eq('prompt_source', 'ask_question')
        .in('prompt_id', promptIds)
        .order('created_at', { ascending: true }),
    () =>
      adminDb
        .from('research_evidence_items')
        .select('*')
        .in('prompt_id', promptIds)
        .order('created_at', { ascending: true }),
  ]

  for (const attempt of attempts) {
    const { data, error } = await attempt()

    if (error) {
      if (isMissingTableError(error)) {
        return new Map()
      }
      if (isSchemaGapError(error)) {
        continue
      }
      console.warn('[Evolusi] Error fetching research evidence:', error)
      return new Map()
    }

    const rows = (Array.isArray(data) ? data : []) as ResearchEvidenceRow[]
    const evidenceMap = new Map<string, ResearchEvidenceRow[]>()

    for (const row of rows) {
      const sourceId = getEvidenceSourceId(row)
      if (!sourceId || !promptIds.includes(sourceId)) {
        continue
      }

      if (!evidenceMap.has(sourceId)) {
        evidenceMap.set(sourceId, [])
      }

      evidenceMap.get(sourceId)?.push(row)
    }

    return evidenceMap
  }

  return new Map()
}

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

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
      return NextResponse.json({ error: 'Format ID tidak valid' }, { status: 400 })
    }

    const promptResult = await selectRowsWithFallback<PromptRow>(
      'ask_question_history',
      [
        'id, question, answer, course_id, learning_session_id, prompt_stage, stage_confidence, session_number, micro_markers, coding_status, research_validity_status, researcher_notes, raw_evidence_snapshot, data_collection_week, is_follow_up, created_at',
        'id, question, answer, course_id, learning_session_id, prompt_stage, stage_confidence, session_number, micro_markers, data_collection_week, is_follow_up, created_at',
        'id, question, answer, prompt_stage, session_number, micro_markers, created_at',
        'id, question, prompt_stage, session_number, micro_markers, created_at',
      ],
      (query) => query.eq('user_id', userId).order('created_at', { ascending: true })
    )

    if (promptResult.error) {
      if (isMissingTableError(promptResult.error)) {
        return NextResponse.json({ sessions: [], stageProgression: [], promptHistory: [] })
      }

      console.error('[Evolusi] Error fetching ask_question_history:', promptResult.error)
      return NextResponse.json({ error: 'Gagal memuat riwayat pertanyaan' }, { status: 500 })
    }

    const prompts = promptResult.data
    const promptIds = prompts.map((prompt) => prompt.id)
    const studyStart = prompts[0]?.created_at ? new Date(prompts[0].created_at) : null

    const [sessionResult, classificationResult, evidenceByPromptId] = await Promise.all([
      selectRowsWithFallback<SessionRow>(
        'learning_sessions',
        [
          'id, session_number, dominant_stage, total_prompts, session_start, session_end, data_collection_week, readiness_status, readiness_score',
          'id, session_number, dominant_stage, total_prompts, session_start, session_end',
        ],
        (query) => query.eq('user_id', userId).order('session_number', { ascending: true })
      ),
      selectRowsWithFallback<ClassificationRow>(
        'prompt_classifications',
        [
          'id, prompt_id, prompt_source, prompt_stage, micro_markers, learning_session_id, confidence_level, coding_notes, created_at',
          'id, prompt_id, prompt_stage, micro_markers, learning_session_id, created_at',
          'id, prompt_stage, learning_session_id, created_at',
        ],
        (query) => query.eq('user_id', userId).order('created_at', { ascending: true })
      ),
      fetchEvidenceByPromptIds(promptIds),
    ])

    let sessions = sessionResult.data
    if (sessionResult.error && !isSchemaGapError(sessionResult.error)) {
      console.warn('[Evolusi] Error fetching learning_sessions:', sessionResult.error)
      sessions = []
    }

    let classifications = classificationResult.data
    if (classificationResult.error && !isSchemaGapError(classificationResult.error)) {
      console.warn('[Evolusi] Error fetching prompt_classifications:', classificationResult.error)
      classifications = []
    }

    const relevantClassifications = classifications.filter(
      (classification) => !classification.prompt_source || classification.prompt_source === 'ask_question'
    )

    const sessionById = new Map(sessions.map((session) => [session.id, session]))
    const classificationsByPromptId = new Map<string, ClassificationRow[]>()
    const classificationsBySessionId = new Map<string, ClassificationRow[]>()

    for (const classification of relevantClassifications) {
      if (classification.prompt_id) {
        if (!classificationsByPromptId.has(classification.prompt_id)) {
          classificationsByPromptId.set(classification.prompt_id, [])
        }
        classificationsByPromptId.get(classification.prompt_id)?.push(classification)
      }

      if (classification.learning_session_id) {
        if (!classificationsBySessionId.has(classification.learning_session_id)) {
          classificationsBySessionId.set(classification.learning_session_id, [])
        }
        classificationsBySessionId.get(classification.learning_session_id)?.push(classification)
      }
    }

    const promptHistory = prompts.map((prompt) => {
      const promptEvidence = evidenceByPromptId.get(prompt.id) ?? []
      const promptClassifications =
        classificationsByPromptId.get(prompt.id) ??
        (prompt.learning_session_id ? classificationsBySessionId.get(prompt.learning_session_id) ?? [] : [])
      const manualClassification = promptClassifications[0] ?? null
      const resolvedStage = firstString(manualClassification?.prompt_stage, prompt.prompt_stage) ?? 'N/A'
      const promptSessionId = prompt.learning_session_id ?? manualClassification?.learning_session_id ?? null
      const linkedSession = promptSessionId ? sessionById.get(promptSessionId) ?? null : null
      const resolvedMicroMarkers = normalizeMicroMarkers(manualClassification?.micro_markers ?? prompt.micro_markers)
      const evidenceExcerpt =
        firstString(
          ...promptEvidence.map((item) =>
            firstString(item.evidence_excerpt, item.summary_excerpt, item.evidence_text, summarizeSnapshot(item.raw_evidence_snapshot))
          )
        ) ??
        summarizeSnapshot(prompt.raw_evidence_snapshot) ??
        firstString(prompt.answer)

      return {
        id: prompt.id,
        question: prompt.question ?? '',
        answer: prompt.answer ?? null,
        prompt_stage: prompt.prompt_stage ?? 'N/A',
        resolved_prompt_stage: resolvedStage,
        manual_prompt_stage: manualClassification?.prompt_stage ?? null,
        stage_confidence: firstNumber(prompt.stage_confidence, manualClassification?.confidence_level),
        session_number: prompt.session_number ?? linkedSession?.session_number ?? null,
        learning_session_id: promptSessionId,
        micro_markers: normalizeMicroMarkers(prompt.micro_markers),
        resolved_micro_markers: resolvedMicroMarkers,
        manual_micro_markers: normalizeMicroMarkers(manualClassification?.micro_markers),
        coding_status:
          firstString(prompt.coding_status) ??
          firstString(...promptEvidence.map((item) => item.coding_status)) ??
          null,
        research_validity_status:
          firstString(prompt.research_validity_status) ??
          firstString(...promptEvidence.map((item) => item.research_validity_status ?? item.validity_status)) ??
          null,
        researcher_notes:
          firstString(prompt.researcher_notes, manualClassification?.coding_notes) ??
          firstString(...promptEvidence.map((item) => item.researcher_notes)) ??
          null,
        raw_evidence_snapshot:
          firstObject(prompt.raw_evidence_snapshot) ??
          firstObject(...promptEvidence.map((item) => item.raw_evidence_snapshot), ...promptEvidence.map((item) => item.metadata)),
        data_collection_week:
          firstString(prompt.data_collection_week, linkedSession?.data_collection_week) ??
          firstString(...promptEvidence.map((item) => item.data_collection_week)) ??
          (studyStart ? getWeekBucket(prompt.created_at, studyStart) : null),
        is_follow_up: firstBoolean(prompt.is_follow_up),
        course_id: prompt.course_id ?? null,
        created_at: prompt.created_at,
        evidence_excerpt: evidenceExcerpt ?? null,
        evidence_count: promptEvidence.length,
        evidence_records: promptEvidence.map((item) => ({
          id: item.id,
          source_id: getEvidenceSourceId(item),
          source_type: firstString(item.source_type, item.prompt_source),
          prompt_stage: firstString(item.prompt_stage),
          coding_status: firstString(item.coding_status),
          research_validity_status: firstString(item.research_validity_status, item.validity_status),
          researcher_notes: firstString(item.researcher_notes),
          data_collection_week: firstString(item.data_collection_week),
          evidence_excerpt:
            firstString(item.evidence_excerpt, item.summary_excerpt, item.evidence_text) ??
            summarizeSnapshot(item.raw_evidence_snapshot),
          raw_evidence_snapshot: firstObject(item.raw_evidence_snapshot, item.metadata),
          created_at: firstString(item.created_at),
        })),
        manual_classification: manualClassification
          ? {
              id: manualClassification.id,
              prompt_stage: manualClassification.prompt_stage,
              learning_session_id: manualClassification.learning_session_id,
              confidence_level: firstNumber(manualClassification.confidence_level),
              micro_markers: normalizeMicroMarkers(manualClassification.micro_markers),
              coding_notes: manualClassification.coding_notes ?? null,
              created_at: manualClassification.created_at,
            }
          : null,
      }
    })

    const countedPromptIds = new Set(promptHistory.map((item) => item.id))
    const stageCounts: Record<string, number> = {}
    let totalClassified = 0

    for (const prompt of promptHistory) {
      const stage = prompt.resolved_prompt_stage || 'N/A'
      stageCounts[stage] = (stageCounts[stage] || 0) + 1
      totalClassified++
    }

    for (const classification of relevantClassifications) {
      if (classification.prompt_id && countedPromptIds.has(classification.prompt_id)) {
        continue
      }

      if (!classification.prompt_stage) {
        continue
      }

      stageCounts[classification.prompt_stage] = (stageCounts[classification.prompt_stage] || 0) + 1
      totalClassified++
    }

    const stageProgression = Object.entries(stageCounts)
      .map(([stage, count]) => ({
        stage,
        count,
        percentage: totalClassified > 0 ? Math.round((count / totalClassified) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)

    const sessionsResponse = sessions.map((session) => {
      const relatedPrompts = promptHistory.filter(
        (prompt) =>
          prompt.learning_session_id === session.id ||
          (prompt.session_number !== null && prompt.session_number === session.session_number)
      )

      return {
        id: session.id,
        session_number: session.session_number,
        dominant_stage: session.dominant_stage || 'N/A',
        total_prompts: session.total_prompts ?? relatedPrompts.length,
        started_at: session.session_start,
        ended_at: session.session_end,
        data_collection_week: session.data_collection_week ?? relatedPrompts[0]?.data_collection_week ?? null,
        readiness_status: session.readiness_status ?? null,
        readiness_score: firstNumber(session.readiness_score),
        evidence_count: relatedPrompts.reduce((total, prompt) => total + prompt.evidence_count, 0),
        coded_prompts: relatedPrompts.filter((prompt) => Boolean(prompt.coding_status)).length,
        valid_prompts: relatedPrompts.filter((prompt) => Boolean(prompt.research_validity_status)).length,
      }
    })

    if (sessionsResponse.length === 0 && promptHistory.length > 0) {
      const derivedSessions = new Map<number, typeof promptHistory>()

      for (const prompt of promptHistory) {
        const sessionNumber = prompt.session_number ?? 1
        if (!derivedSessions.has(sessionNumber)) {
          derivedSessions.set(sessionNumber, [])
        }
        derivedSessions.get(sessionNumber)?.push(prompt)
      }

      for (const [sessionNumber, sessionPrompts] of Array.from(derivedSessions.entries()).sort((a, b) => a[0] - b[0])) {
        const stageDistribution: Record<string, number> = {}

        for (const prompt of sessionPrompts) {
          const stage = prompt.resolved_prompt_stage || 'N/A'
          stageDistribution[stage] = (stageDistribution[stage] || 0) + 1
        }

        const dominantStage =
          Object.entries(stageDistribution).sort((a, b) => b[1] - a[1])[0]?.[0] ??
          sessionPrompts[0]?.resolved_prompt_stage ??
          'N/A'

        sessionsResponse.push({
          id: sessionPrompts[0]?.learning_session_id ?? `derived-${sessionNumber}`,
          session_number: sessionNumber,
          dominant_stage: dominantStage,
          total_prompts: sessionPrompts.length,
          started_at: sessionPrompts[0]?.created_at ?? null,
          ended_at: sessionPrompts[sessionPrompts.length - 1]?.created_at ?? null,
          data_collection_week: sessionPrompts[0]?.data_collection_week ?? null,
          readiness_status: null,
          readiness_score: null,
          evidence_count: sessionPrompts.reduce((total, prompt) => total + prompt.evidence_count, 0),
          coded_prompts: sessionPrompts.filter((prompt) => Boolean(prompt.coding_status)).length,
          valid_prompts: sessionPrompts.filter((prompt) => Boolean(prompt.research_validity_status)).length,
        })
      }
    }

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
