import { adminDb } from '@/lib/database'
import {
  isStructuredReflectionComplete,
  normalizeIndex,
  normalizeReflectionRating,
  normalizeText,
  parseStructuredReflectionFields,
  type StructuredReflectionFields,
} from '@/lib/reflection-submission'

export interface ReflectionScopeInput {
  userId: string
  courseId: string
  subtopicId?: string | null
  subtopicLabel?: string | null
  moduleIndex?: number | string | null
  subtopicIndex?: number | string | null
}

export interface ReflectionScope {
  userId: string
  courseId: string
  subtopicId: string | null
  subtopicLabel: string
  moduleIndex: number | null
  subtopicIndex: number | null
}

interface JournalReflectionRow {
  id: string
  content: string | Record<string, unknown> | null
  type: string | null
  subtopic_id: string | null
  subtopic_label: string | null
  module_index: number | null
  subtopic_index: number | null
  created_at: string
}

interface FeedbackReflectionRow {
  id: string
  origin_jurnal_id: string | null
  rating: number | null
  comment: string | null
  subtopic_id: string | null
  subtopic_label: string | null
  module_index: number | null
  subtopic_index: number | null
  created_at: string
}

export interface LatestReflectionSnapshot {
  id: string
  journalId: string | null
  feedbackId: string | null
  type: 'structured_reflection' | 'feedback'
  createdAt: string
  fields: StructuredReflectionFields
}

export interface StructuredReflectionStatus {
  submitted: boolean
  completed: boolean
  revisionCount: number
  latestSubmittedAt: string | null
  sourceKinds: Array<'jurnal' | 'feedback'>
  hasFeedbackMirror: boolean
  latest: LatestReflectionSnapshot | null
}

export function normalizeReflectionScope(input: ReflectionScopeInput): ReflectionScope {
  return {
    userId: input.userId,
    courseId: input.courseId,
    subtopicId: normalizeText(input.subtopicId) || null,
    subtopicLabel: normalizeText(input.subtopicLabel),
    moduleIndex: normalizeIndex(input.moduleIndex),
    subtopicIndex: normalizeIndex(input.subtopicIndex),
  }
}

function normalizeString(value: string | null | undefined) {
  return normalizeText(value).toLowerCase().replace(/\s+/g, ' ')
}

export function reflectionRowMatchesScope(
  row: {
    subtopic_id?: string | null
    subtopic_label?: string | null
    module_index?: number | null
    subtopic_index?: number | null
  },
  scope: Pick<ReflectionScope, 'subtopicId' | 'subtopicLabel' | 'moduleIndex' | 'subtopicIndex'>,
) {
  if (scope.subtopicId && (row.subtopic_id ?? null) !== scope.subtopicId) return false
  if (
    scope.subtopicLabel &&
    normalizeString(row.subtopic_label) !== normalizeString(scope.subtopicLabel)
  ) {
    return false
  }
  if (scope.moduleIndex !== null && row.module_index !== null && row.module_index !== scope.moduleIndex) {
    return false
  }
  if (
    scope.subtopicIndex !== null &&
    row.subtopic_index !== null &&
    row.subtopic_index !== scope.subtopicIndex
  ) {
    return false
  }
  return true
}

function fieldsFromJournal(row: JournalReflectionRow): StructuredReflectionFields {
  return parseStructuredReflectionFields({
    content: row.content ?? '',
  })
}

function fieldsFromFeedback(row: FeedbackReflectionRow): StructuredReflectionFields {
  return {
    understood: '',
    confused: '',
    strategy: '',
    promptEvolution: '',
    contentRating: normalizeReflectionRating(row.rating),
    contentFeedback: normalizeText(row.comment),
  }
}

export async function getStructuredReflectionStatus(
  input: ReflectionScopeInput,
): Promise<StructuredReflectionStatus> {
  const scope = normalizeReflectionScope(input)

  let journalQuery = adminDb
    .from('jurnal')
    .select('id, content, type, subtopic_id, subtopic_label, module_index, subtopic_index, created_at')
    .eq('user_id', scope.userId)
    .eq('course_id', scope.courseId)
    .eq('type', 'structured_reflection')

  if (scope.subtopicId) {
    journalQuery = journalQuery.eq('subtopic_id', scope.subtopicId)
  }
  if (scope.subtopicLabel) {
    journalQuery = journalQuery.eq('subtopic_label', scope.subtopicLabel)
  }
  if (scope.moduleIndex !== null) {
    journalQuery = journalQuery.eq('module_index', scope.moduleIndex)
  }
  if (scope.subtopicIndex !== null) {
    journalQuery = journalQuery.eq('subtopic_index', scope.subtopicIndex)
  }

  const { data: journalRows, error: journalError } = await journalQuery
    .order('created_at', { ascending: false })
    .limit(50)

  if (journalError) {
    throw new Error(`Failed to load reflection status: ${journalError.message}`)
  }

  let feedbackQuery = adminDb
    .from('feedback')
    .select('id, origin_jurnal_id, rating, comment, subtopic_id, subtopic_label, module_index, subtopic_index, created_at')
    .eq('user_id', scope.userId)
    .eq('course_id', scope.courseId)

  if (scope.subtopicId) {
    feedbackQuery = feedbackQuery.eq('subtopic_id', scope.subtopicId)
  }
  if (scope.subtopicLabel) {
    feedbackQuery = feedbackQuery.eq('subtopic_label', scope.subtopicLabel)
  }
  if (scope.moduleIndex !== null) {
    feedbackQuery = feedbackQuery.eq('module_index', scope.moduleIndex)
  }
  if (scope.subtopicIndex !== null) {
    feedbackQuery = feedbackQuery.eq('subtopic_index', scope.subtopicIndex)
  }

  const { data: feedbackRows, error: feedbackError } = await feedbackQuery
    .order('created_at', { ascending: false })
    .limit(50)

  if (feedbackError) {
    throw new Error(`Failed to load feedback status: ${feedbackError.message}`)
  }

  const journals = ((journalRows ?? []) as JournalReflectionRow[]).filter((row) =>
    reflectionRowMatchesScope(row, scope),
  )
  const feedback = ((feedbackRows ?? []) as FeedbackReflectionRow[]).filter((row) =>
    reflectionRowMatchesScope(row, scope),
  )

  const latestJournal = journals[0] ?? null
  const latestFeedback = feedback[0] ?? null
  const hasFeedbackMirror = latestJournal
    ? feedback.some((row) => row.origin_jurnal_id === latestJournal.id)
    : feedback.length > 0

  const latest: LatestReflectionSnapshot | null = latestJournal
    ? {
        id: latestJournal.id,
        journalId: latestJournal.id,
        feedbackId: feedback.find((row) => row.origin_jurnal_id === latestJournal.id)?.id ?? null,
        type: 'structured_reflection',
        createdAt: latestJournal.created_at,
        fields: fieldsFromJournal(latestJournal),
      }
    : latestFeedback
      ? {
          id: latestFeedback.id,
          journalId: null,
          feedbackId: latestFeedback.id,
          type: 'feedback',
          createdAt: latestFeedback.created_at,
          fields: fieldsFromFeedback(latestFeedback),
        }
      : null

  const sourceKinds: Array<'jurnal' | 'feedback'> = []
  if (journals.length > 0) sourceKinds.push('jurnal')
  if (feedback.length > 0) sourceKinds.push('feedback')

  return {
    submitted: Boolean(latest),
    completed: latest ? isStructuredReflectionComplete(latest.fields) : false,
    revisionCount: journals.length,
    latestSubmittedAt: latest?.createdAt ?? null,
    sourceKinds,
    hasFeedbackMirror,
    latest,
  }
}

