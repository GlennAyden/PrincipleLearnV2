export interface QuizAttemptMetricRow {
  id: string
  user_id?: string | null
  quiz_attempt_id?: string | null
  course_id?: string | null
  subtopic_id?: string | null
  leaf_subtopic_id?: string | null
  subtopic_label?: string | null
  attempt_number?: number | null
  created_at?: string | null
  is_correct?: boolean | null
}

export interface QuizAttemptSummary<T extends QuizAttemptMetricRow = QuizAttemptMetricRow> {
  key: string
  representativeId: string
  quizAttemptId: string | null
  userId: string | null
  courseId: string | null
  subtopicId: string | null
  attemptNumber: number | null
  createdAt: string | null
  answerRowCount: number
  correctAnswerCount: number
  score: number
  isCorrect: boolean
  rows: T[]
}

export interface QuizAttemptCounts {
  attemptCount: number
  answerRowCount: number
}

function nonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function createdSecondBucket(value: unknown): string {
  const raw = nonEmptyString(value)
  if (!raw) return 'unknown-time'

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 19)
  }

  return raw.slice(0, 19)
}

function timestampMs(value: unknown): number {
  const raw = nonEmptyString(value)
  if (!raw) return 0
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime()
}

function legacyAttemptKey(row: QuizAttemptMetricRow, fallbackUserId?: string): string {
  const userId = nonEmptyString(row.user_id) ?? nonEmptyString(fallbackUserId) ?? 'unknown-user'
  const courseId = nonEmptyString(row.course_id) ?? 'unknown-course'
  const subtopicId =
    nonEmptyString(row.leaf_subtopic_id) ??
    nonEmptyString(row.subtopic_id) ??
    nonEmptyString(row.subtopic_label) ??
    'unknown-subtopic'
  const attemptNumber = finiteNumber(row.attempt_number)

  return [
    userId,
    courseId,
    subtopicId,
    attemptNumber === null ? 'unknown-attempt' : String(attemptNumber),
    createdSecondBucket(row.created_at),
  ].join('::')
}

export function summarizeQuizAttempts<T extends QuizAttemptMetricRow>(
  rows: T[],
  fallbackUserId?: string,
): QuizAttemptSummary<T>[] {
  const explicitAttemptCounts = new Map<string, number>()
  const legacyAttemptCounts = new Map<string, number>()

  for (const row of rows) {
    const explicitAttemptId = nonEmptyString(row.quiz_attempt_id)
    if (explicitAttemptId) {
      explicitAttemptCounts.set(explicitAttemptId, (explicitAttemptCounts.get(explicitAttemptId) ?? 0) + 1)
    }

    const legacyKey = legacyAttemptKey(row, fallbackUserId)
    legacyAttemptCounts.set(legacyKey, (legacyAttemptCounts.get(legacyKey) ?? 0) + 1)
  }

  const grouped = new Map<string, T[]>()

  for (const row of rows) {
    const explicitAttemptId = nonEmptyString(row.quiz_attempt_id)
    const legacyKey = legacyAttemptKey(row, fallbackUserId)
    const useLegacyKey =
      !explicitAttemptId ||
      ((explicitAttemptCounts.get(explicitAttemptId) ?? 0) === 1 &&
        (legacyAttemptCounts.get(legacyKey) ?? 0) > 1)
    const key = useLegacyKey ? `legacy:${legacyKey}` : `attempt:${explicitAttemptId}`
    const existing = grouped.get(key)

    if (existing) {
      existing.push(row)
    } else {
      grouped.set(key, [row])
    }
  }

  const summaries: QuizAttemptSummary<T>[] = []

  for (const [key, attemptRows] of grouped.entries()) {
    const sortedRows = [...attemptRows].sort((a, b) => timestampMs(b.created_at) - timestampMs(a.created_at))
    const representative = sortedRows[0] ?? attemptRows[0]
    const correctAnswerCount = sortedRows.filter((row) => row.is_correct === true).length
    const answerRowCount = sortedRows.length

    summaries.push({
      key,
      representativeId: representative.id,
      quizAttemptId: nonEmptyString(representative.quiz_attempt_id),
      userId: nonEmptyString(representative.user_id) ?? nonEmptyString(fallbackUserId),
      courseId: nonEmptyString(representative.course_id),
      subtopicId:
        nonEmptyString(representative.leaf_subtopic_id) ??
        nonEmptyString(representative.subtopic_id) ??
        nonEmptyString(representative.subtopic_label),
      attemptNumber: finiteNumber(representative.attempt_number),
      createdAt: nonEmptyString(representative.created_at),
      answerRowCount,
      correctAnswerCount,
      score: answerRowCount > 0 ? Math.round((correctAnswerCount / answerRowCount) * 100) : 0,
      isCorrect: answerRowCount > 0 && correctAnswerCount === answerRowCount,
      rows: sortedRows,
    })
  }

  return summaries.sort((a, b) => timestampMs(b.createdAt) - timestampMs(a.createdAt))
}

export function getQuizAttemptCounts<T extends QuizAttemptMetricRow>(
  rows: T[],
  fallbackUserId?: string,
): QuizAttemptCounts {
  return {
    attemptCount: summarizeQuizAttempts(rows, fallbackUserId).length,
    answerRowCount: rows.length,
  }
}

export function getQuizAttemptCountsByUser<T extends QuizAttemptMetricRow>(rows: T[]): Record<string, QuizAttemptCounts> {
  const rowsByUser: Record<string, T[]> = {}

  for (const row of rows) {
    const userId = nonEmptyString(row.user_id)
    if (!userId) continue
    if (!rowsByUser[userId]) rowsByUser[userId] = []
    rowsByUser[userId].push(row)
  }

  return Object.fromEntries(
    Object.entries(rowsByUser).map(([userId, userRows]) => [userId, getQuizAttemptCounts(userRows, userId)]),
  )
}
