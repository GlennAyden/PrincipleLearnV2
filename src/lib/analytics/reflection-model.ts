export interface ReflectionStructuredFields {
  understood: string
  confused: string
  strategy: string
  promptEvolution: string
  contentRating: number | null
  contentFeedback: string
}

export interface ReflectionJournalRow {
  id: string
  user_id: string
  course_id?: string | null
  subtopic_id?: string | null
  subtopic_label?: string | null
  module_index?: number | null
  subtopic_index?: number | null
  type?: string | null
  content: unknown
  reflection?: unknown
  created_at: string
}

export interface ReflectionFeedbackRow {
  id: string
  user_id: string
  course_id?: string | null
  subtopic_id?: string | null
  subtopic_label?: string | null
  module_index?: number | null
  subtopic_index?: number | null
  rating?: number | null
  comment?: string | null
  created_at: string
}

export interface UnifiedReflectionEvent {
  scopeKey: string
  userId: string
  courseId: string | null
  subtopicId: string | null
  subtopicLabel: string | null
  moduleIndex: number | null
  subtopicIndex: number | null
  journalId: string | null
  feedbackId: string | null
  journalType: string | null
  source: 'jurnal' | 'feedback'
  hasJournal: boolean
  hasFeedback: boolean
  structured: ReflectionStructuredFields | null
  rating: number | null
  comment: string
  createdAt: string
}

export interface UnifiedReflectionModel {
  events: UnifiedReflectionEvent[]
  byUser: Map<string, UnifiedReflectionEvent[]>
  totalReflections: number
  structuredReflections: number
  ratedReflections: number
  avgRating: number
  ctIndicators: number
}

interface JournalCandidate extends UnifiedReflectionEvent {
  createdAtMs: number
}

interface FeedbackCandidate extends UnifiedReflectionEvent {
  createdAtMs: number
}

const PAIR_WINDOW_MS = 5 * 60 * 1000

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value >= 1 && value <= 5 ? value : null
  }

  return null
}

function parseJsonObject(value: unknown): Record<string, unknown> | null {
  if (!value) return null

  if (typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>
  }

  if (typeof value !== 'string') return null

  try {
    const parsed = JSON.parse(value) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
  } catch {
    return null
  }

  return null
}

function pickStructuredFields(...sources: Array<Record<string, unknown> | null>): ReflectionStructuredFields | null {
  const merged: ReflectionStructuredFields = {
    understood: '',
    confused: '',
    strategy: '',
    promptEvolution: '',
    contentRating: null,
    contentFeedback: '',
  }

  let hasValue = false

  for (const source of sources) {
    if (!source) continue

    const understood = normalizeText(source.understood)
    const confused = normalizeText(source.confused)
    const strategy = normalizeText(source.strategy)
    const promptEvolution = normalizeText(source.promptEvolution)
    const contentFeedback = normalizeText(source.contentFeedback)
    const contentRating = normalizeNumber(source.contentRating)

    if (understood) {
      merged.understood = understood
      hasValue = true
    }
    if (confused) {
      merged.confused = confused
      hasValue = true
    }
    if (strategy) {
      merged.strategy = strategy
      hasValue = true
    }
    if (promptEvolution) {
      merged.promptEvolution = promptEvolution
      hasValue = true
    }
    if (contentFeedback) {
      merged.contentFeedback = contentFeedback
      hasValue = true
    }
    if (contentRating !== null) {
      merged.contentRating = contentRating
      hasValue = true
    }
  }

  return hasValue ? merged : null
}

function extractJournalStructuredFields(row: ReflectionJournalRow): ReflectionStructuredFields | null {
  const content = parseJsonObject(row.content)
  const reflection = parseJsonObject(row.reflection)
  const structuredFromReflection = reflection?.fields && typeof reflection.fields === 'object'
    ? parseJsonObject(reflection.fields)
    : null

  const directStructured = content && (
    content.understood !== undefined ||
    content.confused !== undefined ||
    content.strategy !== undefined ||
    content.promptEvolution !== undefined ||
    content.contentRating !== undefined ||
    content.contentFeedback !== undefined
  )
    ? content
    : null

  return pickStructuredFields(directStructured, structuredFromReflection)
}

function buildScopeKey(row: {
  userId: string
  courseId?: string | null
  subtopicId?: string | null
  subtopicLabel?: string | null
  moduleIndex?: number | null
  subtopicIndex?: number | null
}): string {
  return [
    row.userId,
    row.courseId ?? '',
    row.subtopicId ?? '',
    row.subtopicLabel ?? '',
    row.moduleIndex ?? '',
    row.subtopicIndex ?? '',
  ].join('|')
}

function toEventTimeMs(createdAt: string): number {
  const timestamp = new Date(createdAt).getTime()
  return Number.isFinite(timestamp) ? timestamp : 0
}

function hasMeaningfulScope(event: Pick<UnifiedReflectionEvent, 'courseId' | 'subtopicId' | 'subtopicLabel' | 'moduleIndex' | 'subtopicIndex'>): boolean {
  return Boolean(
    event.courseId ||
    event.subtopicId ||
    event.subtopicLabel ||
    event.moduleIndex !== null ||
    event.subtopicIndex !== null
  )
}

function createJournalCandidate(row: ReflectionJournalRow): JournalCandidate {
  const structured = row.type === 'structured_reflection' ? extractJournalStructuredFields(row) : extractJournalStructuredFields(row)
  const content = parseJsonObject(row.content)

  const reflectionContext = parseJsonObject(row.reflection)
  const contextFields = reflectionContext?.fields && typeof reflectionContext.fields === 'object'
    ? parseJsonObject(reflectionContext.fields)
    : null

  const rating = normalizeNumber(
    structured?.contentRating ??
      content?.contentRating ??
      contextFields?.contentRating
  )

  const comment = normalizeText(
    structured?.contentFeedback ??
      content?.contentFeedback ??
      contextFields?.contentFeedback
  )

  const courseId = typeof row.course_id === 'string' && row.course_id.trim() ? row.course_id : null
  const subtopicId = typeof row.subtopic_id === 'string' && row.subtopic_id.trim() ? row.subtopic_id : null
  const subtopicLabel = typeof row.subtopic_label === 'string' && row.subtopic_label.trim()
    ? row.subtopic_label
    : null
  const moduleIndex = typeof row.module_index === 'number' && Number.isFinite(row.module_index) ? row.module_index : null
  const subtopicIndex = typeof row.subtopic_index === 'number' && Number.isFinite(row.subtopic_index) ? row.subtopic_index : null

  return {
    scopeKey: buildScopeKey({
      userId: row.user_id,
      courseId,
      subtopicId,
      subtopicLabel,
      moduleIndex,
      subtopicIndex,
    }),
    userId: row.user_id,
    courseId,
    subtopicId,
    subtopicLabel,
    moduleIndex,
    subtopicIndex,
    journalId: row.id,
    feedbackId: null,
    journalType: row.type ?? null,
    source: 'jurnal',
    hasJournal: true,
    hasFeedback: false,
    structured,
    rating,
    comment,
    createdAt: row.created_at,
    createdAtMs: toEventTimeMs(row.created_at),
  }
}

function createFeedbackCandidate(row: ReflectionFeedbackRow): FeedbackCandidate {
  const courseId = typeof row.course_id === 'string' && row.course_id.trim() ? row.course_id : null
  const subtopicId = typeof row.subtopic_id === 'string' && row.subtopic_id.trim() ? row.subtopic_id : null
  const subtopicLabel = typeof row.subtopic_label === 'string' && row.subtopic_label.trim()
    ? row.subtopic_label
    : null
  const moduleIndex = typeof row.module_index === 'number' && Number.isFinite(row.module_index) ? row.module_index : null
  const subtopicIndex = typeof row.subtopic_index === 'number' && Number.isFinite(row.subtopic_index) ? row.subtopic_index : null

  return {
    scopeKey: buildScopeKey({
      userId: row.user_id,
      courseId,
      subtopicId,
      subtopicLabel,
      moduleIndex,
      subtopicIndex,
    }),
    userId: row.user_id,
    courseId,
    subtopicId,
    subtopicLabel,
    moduleIndex,
    subtopicIndex,
    journalId: null,
    feedbackId: row.id,
    journalType: null,
    source: 'feedback',
    hasJournal: false,
    hasFeedback: true,
    structured: null,
    rating: normalizeNumber(row.rating),
    comment: normalizeText(row.comment),
    createdAt: row.created_at,
    createdAtMs: toEventTimeMs(row.created_at),
  }
}

function mergeEvents(journal: JournalCandidate, feedback?: FeedbackCandidate): UnifiedReflectionEvent {
  const hasFeedback = Boolean(feedback) || journal.rating !== null || journal.comment.trim().length > 0

  return {
    scopeKey: journal.scopeKey,
    userId: journal.userId,
    courseId: journal.courseId,
    subtopicId: journal.subtopicId,
    subtopicLabel: journal.subtopicLabel,
    moduleIndex: journal.moduleIndex,
    subtopicIndex: journal.subtopicIndex,
    journalId: journal.journalId,
    feedbackId: feedback?.feedbackId ?? null,
    journalType: journal.journalType,
    source: 'jurnal',
    hasJournal: true,
    hasFeedback,
    structured: journal.structured,
    rating: feedback?.rating ?? journal.rating,
    comment: feedback?.comment || journal.comment,
    createdAt: journal.createdAt,
  }
}

function mergeStandaloneFeedback(feedback: FeedbackCandidate): UnifiedReflectionEvent {
  return {
    scopeKey: feedback.scopeKey,
    userId: feedback.userId,
    courseId: feedback.courseId,
    subtopicId: feedback.subtopicId,
    subtopicLabel: feedback.subtopicLabel,
    moduleIndex: feedback.moduleIndex,
    subtopicIndex: feedback.subtopicIndex,
    journalId: null,
    feedbackId: feedback.feedbackId,
    journalType: null,
    source: 'feedback',
    hasJournal: false,
    hasFeedback: true,
    structured: null,
    rating: feedback.rating,
    comment: feedback.comment,
    createdAt: feedback.createdAt,
  }
}

export function buildUnifiedReflectionModel(
  journals: ReflectionJournalRow[],
  feedbacks: ReflectionFeedbackRow[],
): UnifiedReflectionModel {
  const journalCandidates = journals.map(createJournalCandidate)
  const feedbackCandidates = feedbacks.map(createFeedbackCandidate)
  const matchedJournalIds = new Set<string>()
  const events: UnifiedReflectionEvent[] = []

  const journalBuckets = new Map<string, JournalCandidate[]>()
  for (const journal of journalCandidates) {
    if (!hasMeaningfulScope(journal)) continue
    const bucket = journalBuckets.get(journal.scopeKey) || []
    bucket.push(journal)
    journalBuckets.set(journal.scopeKey, bucket)
  }
  for (const bucket of journalBuckets.values()) {
    bucket.sort((a, b) => a.createdAtMs - b.createdAtMs)
  }

  const sortedFeedbacks = [...feedbackCandidates].sort((a, b) => a.createdAtMs - b.createdAtMs)

  for (const feedback of sortedFeedbacks) {
    if (!hasMeaningfulScope(feedback)) {
      events.push(mergeStandaloneFeedback(feedback))
      continue
    }

    const bucket = journalBuckets.get(feedback.scopeKey)
    if (!bucket || bucket.length === 0) {
      events.push(mergeStandaloneFeedback(feedback))
      continue
    }

    let matchedIndex = -1
    let smallestDelta = Number.POSITIVE_INFINITY

    for (let index = bucket.length - 1; index >= 0; index -= 1) {
      const journal = bucket[index]
      if (matchedJournalIds.has(journal.journalId || '')) continue

      const delta = feedback.createdAtMs - journal.createdAtMs
      if (Math.abs(delta) > PAIR_WINDOW_MS) continue

      if (delta >= 0) {
        matchedIndex = index
        break
      }

      if (Math.abs(delta) < smallestDelta) {
        smallestDelta = Math.abs(delta)
        matchedIndex = index
      }
    }

    if (matchedIndex >= 0) {
      const journal = bucket[matchedIndex]
      if (journal.journalId) {
        matchedJournalIds.add(journal.journalId)
      }
      events.push(mergeEvents(journal, feedback))
      continue
    }

    events.push(mergeStandaloneFeedback(feedback))
  }

  for (const journal of journalCandidates) {
    if (!journal.journalId || matchedJournalIds.has(journal.journalId)) continue
    events.push(mergeEvents(journal))
  }

  events.sort((a, b) => toEventTimeMs(b.createdAt) - toEventTimeMs(a.createdAt))

  const byUser = new Map<string, UnifiedReflectionEvent[]>()
  for (const event of events) {
    const bucket = byUser.get(event.userId) || []
    bucket.push(event)
    byUser.set(event.userId, bucket)
  }

  const ratedEvents = events.filter((event) => typeof event.rating === 'number')
  const ratingSum = ratedEvents.reduce((sum, event) => sum + (event.rating || 0), 0)
  const structuredReflections = events.filter((event) => Boolean(event.structured))
  const ctIndicators = structuredReflections.reduce((sum, event) => {
    const fields = event.structured
    if (!fields) return sum
    return sum +
      (fields.understood ? 1 : 0) +
      (fields.confused ? 1 : 0) +
      (fields.strategy ? 1 : 0) +
      (fields.promptEvolution ? 1 : 0)
  }, 0)

  return {
    events,
    byUser,
    totalReflections: events.length,
    structuredReflections: structuredReflections.length,
    ratedReflections: events.filter((event) => event.rating !== null || event.comment.trim().length > 0).length,
    avgRating: ratedEvents.length > 0 ? Math.round((ratingSum / ratedEvents.length) * 10) / 10 : 0,
    ctIndicators,
  }
}

export function getUnifiedReflectionActivityType(event: UnifiedReflectionEvent): 'journal' | 'feedback' {
  return event.hasJournal ? 'journal' : 'feedback'
}

export function getUnifiedReflectionActivityDetail(event: UnifiedReflectionEvent): string {
  const comment = event.comment.trim()
  const ratingText = typeof event.rating === 'number' ? `Rating ${event.rating}/5` : ''

  if (event.structured) {
    const parts = [ratingText || 'Refleksi terstruktur']
    if (comment) {
      parts.push(comment.substring(0, 80))
    }
    return parts.join(' • ')
  }

  if (ratingText && comment) {
    return `${ratingText} • ${comment.substring(0, 80)}`
  }

  if (ratingText) {
    return ratingText
  }

  return comment.substring(0, 80) || 'Feedback submitted'
}
