export type ReflectionRecordType = 'free_text' | 'structured_reflection'

export interface StructuredReflectionFields {
  understood: string
  confused: string
  strategy: string
  promptEvolution: string
  contentRating: number | null
  contentFeedback: string
}

export interface ReflectionSubmissionLike {
  content: string | Record<string, unknown>
  understood?: string
  confused?: string
  strategy?: string
  promptEvolution?: string
  contentRating?: number | null
  contentFeedback?: string
}

export function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

export function normalizeIndex(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value)
  const numeric = Number(value)
  return Number.isFinite(numeric) ? Math.floor(numeric) : null
}

export function normalizeReflectionRating(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return null
  if (numeric < 1 || numeric > 5) return null
  return numeric
}

export function normalizeReflectionType(value: unknown): ReflectionRecordType {
  return value === 'structured_reflection' ? 'structured_reflection' : 'free_text'
}

function parseObjectFields(record: Record<string, unknown>): StructuredReflectionFields {
  return {
    understood: normalizeText(record.understood),
    confused: normalizeText(record.confused),
    strategy: normalizeText(record.strategy),
    promptEvolution: normalizeText(record.promptEvolution),
    contentRating: normalizeReflectionRating(record.contentRating),
    contentFeedback: normalizeText(record.contentFeedback),
  }
}

export function parseStructuredReflectionFields(
  data: ReflectionSubmissionLike,
): StructuredReflectionFields {
  const asObject =
    typeof data.content === 'object' && data.content !== null
      ? (data.content as Record<string, unknown>)
      : null

  if (asObject) return parseObjectFields(asObject)

  if (typeof data.content === 'string') {
    try {
      const parsed = JSON.parse(data.content) as Record<string, unknown>
      if (parsed && typeof parsed === 'object') {
        return parseObjectFields(parsed)
      }
    } catch {
      // Non-JSON content falls back to top-level fields.
    }
  }

  return {
    understood: normalizeText(data.understood),
    confused: normalizeText(data.confused),
    strategy: normalizeText(data.strategy),
    promptEvolution: normalizeText(data.promptEvolution),
    contentRating: normalizeReflectionRating(data.contentRating),
    contentFeedback: normalizeText(data.contentFeedback),
  }
}

export function hasStructuredReflectionContent(fields: StructuredReflectionFields) {
  return Boolean(
    fields.understood ||
      fields.confused ||
      fields.strategy ||
      fields.promptEvolution ||
      fields.contentFeedback ||
      fields.contentRating !== null,
  )
}

export function isStructuredReflectionComplete(fields: StructuredReflectionFields) {
  return Boolean(
    fields.understood &&
      fields.confused &&
      fields.strategy &&
      fields.promptEvolution &&
      fields.contentRating !== null,
  )
}

export function serializeStructuredReflection(fields: StructuredReflectionFields) {
  return JSON.stringify({
    understood: fields.understood,
    confused: fields.confused,
    strategy: fields.strategy,
    promptEvolution: fields.promptEvolution,
    contentRating: fields.contentRating,
    contentFeedback: fields.contentFeedback,
  })
}

export function buildReflectionContext(params: {
  subtopicLabel: string
  subtopicId: string | null
  moduleIndex: number | null
  subtopicIndex: number | null
  type: ReflectionRecordType
  structured: StructuredReflectionFields | null
}) {
  return {
    subtopic: params.subtopicLabel || null,
    moduleIndex: params.moduleIndex,
    subtopicIndex: params.subtopicIndex,
    subtopicId: params.subtopicId,
    fields:
      params.type === 'structured_reflection' && params.structured
        ? {
            understood: params.structured.understood,
            confused: params.structured.confused,
            strategy: params.structured.strategy,
            promptEvolution: params.structured.promptEvolution,
            contentRating: params.structured.contentRating,
            contentFeedback: params.structured.contentFeedback,
          }
        : null,
  }
}
