type ReflectionSourceKind = 'jurnal' | 'feedback'

export interface ReflectionJournalRow {
  id: string
  user_id: string
  course_id: string
  content: string
  reflection?: string | null
  type?: string | null
  subtopic_id?: string | null
  subtopic_label?: string | null
  module_index?: number | null
  subtopic_index?: number | null
  created_at: string
  updated_at?: string | null
}

export interface ReflectionFeedbackRow {
  id: string
  user_id: string | null
  course_id: string | null
  subtopic_id: string | null
  subtopic_label: string | null
  module_index: number | null
  subtopic_index: number | null
  rating: number | null
  comment: string | null
  created_at: string
}

export interface ReflectionUserRow {
  id: string
  email: string | null
}

export interface ReflectionCourseRow {
  id: string
  title: string | null
}

export interface ReflectionSubtopicRow {
  id: string
  title: string | null
}

export interface ReflectionFilters {
  userId?: string | null
  courseId?: string | null
  topic?: string | null
  dateFrom?: string | null
  dateTo?: string | null
}

export interface ReflectionActivityItem {
  id: string
  journalId: string | null
  feedbackId: string | null
  timestamp: string
  rawTimestamp: string
  topic: string
  courseTitle: string
  courseId: string
  userEmail: string
  userId: string
  moduleIndex: number | null
  subtopicIndex: number | null
  subtopicId: string | null
  subtopicLabel: string | null
  type: string
  understood: string
  confused: string
  strategy: string
  promptEvolution: string
  contentRating: number | null
  contentFeedback: string
  rating: number | null
  comment: string
  content: string
  sourceKinds: ReflectionSourceKind[]
  hasJournal: boolean
  hasFeedback: boolean
}

type ReflectionJournalInternal = ReflectionJournalRow & {
  sourceKind: 'jurnal'
  rawTimestamp: number
  displayTimestamp: string
  userEmail: string
  courseTitle: string
  topic: string
  subtopicLabel: string
  subtopicId: string | null
  moduleIndex: number | null
  subtopicIndex: number | null
  structured: ReflectionStructuredContent
}

type ReflectionFeedbackInternal = ReflectionFeedbackRow & {
  sourceKind: 'feedback'
  rawTimestamp: number
  displayTimestamp: string
  userEmail: string
  courseTitle: string
  topic: string
  subtopicLabel: string
  subtopicId: string | null
  moduleIndex: number | null
  subtopicIndex: number | null
}

interface ReflectionStructuredContent {
  understood: string
  confused: string
  strategy: string
  promptEvolution: string
  contentRating: number | null
  contentFeedback: string
}

const REFLECTION_PAIR_WINDOW_MS = 5 * 60 * 1000

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  const parsed = Number(value)
  return Number.isFinite(parsed) ? Math.floor(parsed) : null
}

function normalizeRating(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  if (value < 1 || value > 5) return null
  return value
}

function normalizeTimestamp(value: string | null | undefined) {
  const parsed = value ? new Date(value).getTime() : Number.NaN
  return Number.isFinite(parsed) ? parsed : 0
}

function toDisplayTimestamp(value: number) {
  return new Date(value).toLocaleString('id-ID')
}

function normalizeScopePart(value: string | null | undefined) {
  return normalizeText(value).toLowerCase()
}

function scopeKeyFromParts(parts: Array<string | null | undefined>) {
  return parts.map((part) => normalizeScopePart(part)).join('::')
}

function parseReflectionContext(reflection?: string | null): Partial<ReflectionStructuredContent & {
  subtopic: string | null
  moduleIndex: number | null
  subtopicIndex: number | null
  subtopicId: string | null
}> {
  if (!reflection) return {}

  try {
    const parsed = JSON.parse(reflection)
    if (!parsed || typeof parsed !== 'object') return {}

    const record = parsed as Record<string, unknown>
    const fields = record.fields && typeof record.fields === 'object' ? (record.fields as Record<string, unknown>) : null

    return {
      subtopic: normalizeText(record.subtopic),
      moduleIndex: normalizeNumber(record.moduleIndex),
      subtopicIndex: normalizeNumber(record.subtopicIndex),
      subtopicId: normalizeText(record.subtopicId) || null,
      understood: normalizeText(fields?.understood),
      confused: normalizeText(fields?.confused),
      strategy: normalizeText(fields?.strategy),
      promptEvolution: normalizeText(fields?.promptEvolution),
      contentRating: normalizeRating(fields?.contentRating),
      contentFeedback: normalizeText(fields?.contentFeedback),
    }
  } catch {
    const legacyMatch = reflection.match(/^Subtopic:\s*(.+)$/i)
    if (!legacyMatch) return {}
    return {
      subtopic: normalizeText(legacyMatch[1]),
      moduleIndex: null,
      subtopicIndex: null,
      subtopicId: null,
    }
  }
}

function parseStructuredContent(content?: string | null): ReflectionStructuredContent {
  if (!content) {
    return {
      understood: '',
      confused: '',
      strategy: '',
      promptEvolution: '',
      contentRating: null,
      contentFeedback: '',
    }
  }

  try {
    const parsed = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object') {
      return {
        understood: '',
        confused: '',
        strategy: '',
        promptEvolution: '',
        contentRating: null,
        contentFeedback: '',
      }
    }

    const record = parsed as Record<string, unknown>
    return {
      understood: normalizeText(record.understood),
      confused: normalizeText(record.confused),
      strategy: normalizeText(record.strategy),
      promptEvolution: normalizeText(record.promptEvolution),
      contentRating: normalizeRating(record.contentRating),
      contentFeedback: normalizeText(record.contentFeedback),
    }
  } catch {
    return {
      understood: '',
      confused: '',
      strategy: '',
      promptEvolution: '',
      contentRating: null,
      contentFeedback: '',
    }
  }
}

function getTopicLabel(
  subtopicLabel: string | null,
  subtopicTitle: string | null,
  courseTitle: string | null,
) {
  return normalizeText(subtopicLabel) || normalizeText(subtopicTitle) || normalizeText(courseTitle) || 'Tanpa Kursus'
}

function buildJournalInternal(
  row: ReflectionJournalRow,
  context: {
    userEmail: string
    courseTitle: string
    subtopicTitle: string | null
  },
): ReflectionJournalInternal {
  const reflectionContext = parseReflectionContext(row.reflection)
  const structured = parseStructuredContent(row.content)
  const understood =
    normalizeText(structured.understood) || normalizeText(reflectionContext.understood)
  const confused =
    normalizeText(structured.confused) || normalizeText(reflectionContext.confused)
  const strategy =
    normalizeText(structured.strategy) || normalizeText(reflectionContext.strategy)
  const promptEvolution =
    normalizeText(structured.promptEvolution) || normalizeText(reflectionContext.promptEvolution)
  const contentRating =
    typeof structured.contentRating === 'number'
      ? structured.contentRating
      : typeof reflectionContext.contentRating === 'number'
        ? reflectionContext.contentRating
        : null
  const contentFeedback =
    normalizeText(structured.contentFeedback) || normalizeText(reflectionContext.contentFeedback)

  const createdAtMs = normalizeTimestamp(row.created_at)
  const subtopicLabel =
    normalizeText(row.subtopic_label) ||
    normalizeText(reflectionContext.subtopic) ||
    normalizeText(context.subtopicTitle)

  return {
    ...row,
    sourceKind: 'jurnal',
    rawTimestamp: createdAtMs,
    displayTimestamp: toDisplayTimestamp(createdAtMs),
    userEmail: context.userEmail,
    courseTitle: context.courseTitle,
    topic: getTopicLabel(subtopicLabel, context.subtopicTitle, context.courseTitle),
    subtopicLabel,
    subtopicId: normalizeText(row.subtopic_id) || reflectionContext.subtopicId || null,
    moduleIndex:
      typeof row.module_index === 'number'
        ? row.module_index
        : typeof reflectionContext.moduleIndex === 'number'
          ? reflectionContext.moduleIndex
          : null,
    subtopicIndex:
      typeof row.subtopic_index === 'number'
        ? row.subtopic_index
        : typeof reflectionContext.subtopicIndex === 'number'
          ? reflectionContext.subtopicIndex
          : null,
    structured: {
      understood,
      confused,
      strategy,
      promptEvolution,
      contentRating,
      contentFeedback,
    },
  }
}

function buildFeedbackInternal(
  row: ReflectionFeedbackRow,
  context: {
    userEmail: string
    courseTitle: string
    subtopicTitle: string | null
  },
): ReflectionFeedbackInternal {
  const createdAtMs = normalizeTimestamp(row.created_at)
  const subtopicLabel =
    normalizeText(row.subtopic_label) || normalizeText(context.subtopicTitle)

  return {
    ...row,
    sourceKind: 'feedback',
    rawTimestamp: createdAtMs,
    displayTimestamp: toDisplayTimestamp(createdAtMs),
    userEmail: context.userEmail,
    courseTitle: context.courseTitle,
    topic: getTopicLabel(subtopicLabel, context.subtopicTitle, context.courseTitle),
    subtopicLabel,
    subtopicId: normalizeText(row.subtopic_id) || null,
    moduleIndex: row.module_index ?? null,
    subtopicIndex: row.subtopic_index ?? null,
    rating: normalizeRating(row.rating),
  }
}

function buildActivityId(journalId: string | null, feedbackId: string | null) {
  if (journalId && feedbackId) return `reflection:${journalId}:${feedbackId}`
  if (journalId) return `reflection:${journalId}`
  if (feedbackId) return `reflection:feedback:${feedbackId}`
  return `reflection:unknown`
}

function combineSources(
  journal: ReflectionJournalInternal | null,
  feedback: ReflectionFeedbackInternal | null,
): ReflectionActivityItem {
  const sourceKinds: ReflectionSourceKind[] = []
  if (journal) sourceKinds.push('jurnal')
  if (feedback) sourceKinds.push('feedback')

  const createdAtMs = journal?.rawTimestamp ?? feedback?.rawTimestamp ?? 0
  const baseText = journal?.content ?? feedback?.comment ?? ''
  const mergedRating =
    feedback?.rating ?? journal?.structured.contentRating ?? null
  const mergedComment =
    feedback?.comment ?? journal?.structured.contentFeedback ?? ''
  const mergedType =
    journal?.type ??
    (feedback ? 'structured_reflection' : 'free_text')

  return {
    id: buildActivityId(journal?.id ?? null, feedback?.id ?? null),
    journalId: journal?.id ?? null,
    feedbackId: feedback?.id ?? null,
    timestamp: toDisplayTimestamp(createdAtMs),
    rawTimestamp: new Date(createdAtMs).toISOString(),
    topic: journal?.topic ?? feedback?.topic ?? 'Tanpa Kursus',
    courseTitle: journal?.courseTitle ?? feedback?.courseTitle ?? 'Tanpa Kursus',
    courseId: journal?.course_id ?? feedback?.course_id ?? '',
    userEmail: journal?.userEmail ?? feedback?.userEmail ?? 'Unknown User',
    userId: journal?.user_id ?? feedback?.user_id ?? '',
    moduleIndex: journal?.moduleIndex ?? feedback?.moduleIndex ?? null,
    subtopicIndex: journal?.subtopicIndex ?? feedback?.subtopicIndex ?? null,
    subtopicId: journal?.subtopicId ?? feedback?.subtopicId ?? null,
    subtopicLabel: journal?.subtopicLabel ?? feedback?.subtopicLabel ?? null,
    type: mergedType,
    understood: journal?.structured.understood ?? '',
    confused: journal?.structured.confused ?? '',
    strategy: journal?.structured.strategy ?? '',
    promptEvolution: journal?.structured.promptEvolution ?? '',
    contentRating: journal?.structured.contentRating ?? feedback?.rating ?? null,
    contentFeedback: journal?.structured.contentFeedback ?? feedback?.comment ?? '',
    rating: mergedRating,
    comment: mergedComment,
    content: baseText,
    sourceKinds,
    hasJournal: Boolean(journal),
    hasFeedback: Boolean(feedback),
  }
}

function pairReflectionSources(
  journals: ReflectionJournalInternal[],
  feedbacks: ReflectionFeedbackInternal[],
): ReflectionActivityItem[] {
  const journalByScope = new Map<string, ReflectionJournalInternal[]>()
  const feedbackByScope = new Map<string, ReflectionFeedbackInternal[]>()

  for (const journal of journals) {
    const key = scopeKeyFromParts([
      journal.user_id,
      journal.course_id,
      journal.subtopicId ?? journal.subtopicLabel ?? journal.topic,
      String(journal.moduleIndex ?? ''),
      String(journal.subtopicIndex ?? ''),
    ])
    const bucket = journalByScope.get(key) ?? []
    bucket.push(journal)
    journalByScope.set(key, bucket)
  }

  for (const feedback of feedbacks) {
    const key = scopeKeyFromParts([
      feedback.user_id ?? '',
      feedback.course_id ?? '',
      feedback.subtopicId ?? feedback.subtopicLabel ?? feedback.topic,
      String(feedback.moduleIndex ?? ''),
      String(feedback.subtopicIndex ?? ''),
    ])
    const bucket = feedbackByScope.get(key) ?? []
    bucket.push(feedback)
    feedbackByScope.set(key, bucket)
  }

  const result: ReflectionActivityItem[] = []
  const scopes = new Set([...journalByScope.keys(), ...feedbackByScope.keys()])

  for (const scope of scopes) {
    const scopeJournals = [...(journalByScope.get(scope) ?? [])].sort((a, b) => a.rawTimestamp - b.rawTimestamp)
    const scopeFeedbacks = [...(feedbackByScope.get(scope) ?? [])].sort((a, b) => a.rawTimestamp - b.rawTimestamp)
    const usedFeedbackIds = new Set<string>()

    for (const journal of scopeJournals) {
      let matchedFeedback: ReflectionFeedbackInternal | null = null
      let matchedDelta = Number.POSITIVE_INFINITY

      for (const feedback of scopeFeedbacks) {
        if (usedFeedbackIds.has(feedback.id)) continue
        const delta = Math.abs(feedback.rawTimestamp - journal.rawTimestamp)
        if (delta > REFLECTION_PAIR_WINDOW_MS) continue
        if (delta < matchedDelta) {
          matchedFeedback = feedback
          matchedDelta = delta
        }
      }

      if (matchedFeedback) {
        usedFeedbackIds.add(matchedFeedback.id)
      }

      result.push(combineSources(journal, matchedFeedback))
    }

    for (const feedback of scopeFeedbacks) {
      if (usedFeedbackIds.has(feedback.id)) continue
      result.push(combineSources(null, feedback))
    }
  }

  result.sort((a, b) => {
    const diff = normalizeTimestamp(b.rawTimestamp) - normalizeTimestamp(a.rawTimestamp)
    if (diff !== 0) return diff
    return b.id.localeCompare(a.id)
  })

  return result
}

export function buildReflectionActivities(input: {
  journals: ReflectionJournalRow[]
  feedbacks: ReflectionFeedbackRow[]
  users: ReflectionUserRow[]
  courses: ReflectionCourseRow[]
  subtopics: ReflectionSubtopicRow[]
}): ReflectionActivityItem[] {
  const userMap = new Map(input.users.map((user) => [user.id, user]))
  const courseMap = new Map(input.courses.map((course) => [course.id, course]))
  const subtopicMap = new Map(input.subtopics.map((subtopic) => [subtopic.id, subtopic]))

  const journals = input.journals
    .filter((row) => Boolean(row.user_id) && Boolean(row.course_id))
    .map((row) => {
      const user = userMap.get(row.user_id)
      const course = courseMap.get(row.course_id)
      const subtopic = row.subtopic_id ? subtopicMap.get(row.subtopic_id) ?? null : null
      return buildJournalInternal(row, {
        userEmail: normalizeText(user?.email) || 'Unknown User',
        courseTitle: normalizeText(course?.title) || 'Tanpa Kursus',
        subtopicTitle: subtopic?.title ?? null,
      })
    })

  const feedbacks = input.feedbacks
    .filter((row): row is ReflectionFeedbackRow & { user_id: string; course_id: string } => {
      return Boolean(row.user_id) && Boolean(row.course_id)
    })
    .map((row) => {
      const user = userMap.get(row.user_id)
      const course = courseMap.get(row.course_id)
      const subtopic = row.subtopic_id ? subtopicMap.get(row.subtopic_id) ?? null : null
      return buildFeedbackInternal(row, {
        userEmail: normalizeText(user?.email) || 'Unknown User',
        courseTitle: normalizeText(course?.title) || 'Tanpa Kursus',
        subtopicTitle: subtopic?.title ?? null,
      })
    })

  return pairReflectionSources(journals, feedbacks)
}

export function filterReflectionActivities(
  activities: ReflectionActivityItem[],
  filters: ReflectionFilters,
) {
  const fromMs = filters.dateFrom ? new Date(filters.dateFrom).getTime() : null
  const toMs = filters.dateTo ? new Date(filters.dateTo) : null
  const startOfDay = fromMs !== null && Number.isFinite(fromMs) ? new Date(fromMs) : null
  const endOfDay = toMs && !Number.isNaN(toMs.getTime()) ? new Date(toMs) : null

  if (startOfDay) startOfDay.setHours(0, 0, 0, 0)
  if (endOfDay) endOfDay.setHours(23, 59, 59, 999)

  return activities.filter((activity) => {
    if (filters.userId && activity.userId !== filters.userId) return false
    if (filters.courseId && activity.courseId !== filters.courseId) return false
    if (filters.topic) {
      const normalizedTopic = filters.topic.toLowerCase()
      const topicText = `${activity.topic} ${activity.courseTitle} ${activity.subtopicLabel ?? ''}`.toLowerCase()
      if (!topicText.includes(normalizedTopic)) return false
    }

    const createdAt = new Date(activity.rawTimestamp)
    if (startOfDay && createdAt < startOfDay) return false
    if (endOfDay && createdAt > endOfDay) return false
    return true
  })
}
