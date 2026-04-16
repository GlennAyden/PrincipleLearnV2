import { normalizeText, parseStructuredReflectionFields } from '@/lib/reflection-submission'

export interface AdminReflectionJournalRow {
  id: string
  content: unknown
  reflection?: string
  type?: string
  subtopic_label?: string
  created_at: string
}

export interface AdminReflectionFeedbackRow {
  id: string
  rating?: number
  comment?: string
  created_at: string
}

export interface AdminReflectionSummary {
  id: string
  title: string
  snippet: string | null
  rating: number | null
  createdAt: string
  source: 'jurnal' | 'feedback'
}

export function countUnifiedReflections(journalCount: number, feedbackCount: number): number {
  return Math.max(journalCount, feedbackCount)
}

export function buildRecentReflection(
  recentJournal: AdminReflectionJournalRow | null,
  recentFeedback: AdminReflectionFeedbackRow | null
): AdminReflectionSummary | null {
  if (recentJournal) {
    const reflectionContext = parseObjectLike(recentJournal.reflection)
    const journalFields = parseStructuredReflectionFields({
      content: recentJournal.content as string | Record<string, unknown>,
    })
    const snippet =
      journalFields.understood ||
      journalFields.confused ||
      journalFields.strategy ||
      journalFields.promptEvolution ||
      journalFields.contentFeedback ||
      normalizeText(recentJournal.content).slice(0, 160)

    const title =
      normalizeText(reflectionContext?.subtopic) ||
      normalizeText(recentJournal.subtopic_label) ||
      'Refleksi terbaru'

    return {
      id: recentJournal.id,
      title,
      snippet: snippet || null,
      rating: journalFields.contentRating,
      createdAt: recentJournal.created_at,
      source: 'jurnal',
    }
  }

  if (recentFeedback) {
    return {
      id: recentFeedback.id,
      title: 'Refleksi terbaru',
      snippet: normalizeText(recentFeedback.comment) || null,
      rating: recentFeedback.rating ?? null,
      createdAt: recentFeedback.created_at,
      source: 'feedback',
    }
  }

  return null
}

function parseObjectLike(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}
