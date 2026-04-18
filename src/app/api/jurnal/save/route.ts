// "jurnal" uses Indonesian spelling and is the primary write-path for
// reflection submissions in the learning flow.
import { NextResponse, after } from 'next/server'
import type { NextRequest } from 'next/server'
import { DatabaseService, adminDb } from '@/lib/database'
import { withApiLogging } from '@/lib/api-logger'
import { JurnalSchema, parseBody } from '@/lib/schemas'
import { resolveAuthUserId } from '@/lib/auth-helper'
import { resolveUserByIdentifier } from '@/services/auth.service'
import {
  refreshResearchSessionMetrics,
  resolveResearchLearningSession,
  syncResearchEvidenceItem,
} from '@/services/research-session.service'
import {
  buildReflectionContext,
  isStructuredReflectionComplete,
  normalizeIndex,
  normalizeReflectionRating,
  normalizeReflectionType,
  normalizeText,
  parseStructuredReflectionFields,
  serializeStructuredReflection,
  type ReflectionRecordType,
  type StructuredReflectionFields,
} from '@/lib/reflection-submission'

interface JurnalSubmission {
  userId?: string
  courseId: string
  subtopicId?: string
  subtopicLabel?: string
  subtopic?: string
  moduleIndex?: number | string | null
  subtopicIndex?: number | string | null
  content: string | Record<string, unknown>
  type?: string
  understood?: string
  confused?: string
  strategy?: string
  promptEvolution?: string
  contentRating?: number
  contentFeedback?: string
}

interface FeedbackMirrorRow {
  id: string
  origin_jurnal_id: string | null
  subtopic_id: string | null
  subtopic_label: string | null
  module_index: number | null
  subtopic_index: number | null
  rating: number | null
  comment: string | null
  created_at: string
}

const FEEDBACK_MIRROR_WINDOW_MS = 5 * 60 * 1000

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string' &&
    error.message.length > 0
  ) {
    return error.message
  }

  return fallback
}

function matchesFeedbackScope(
  row: FeedbackMirrorRow,
  scope: {
    subtopicId: string | null
    subtopicLabel: string
    moduleIndex: number | null
    subtopicIndex: number | null
  },
) {
  return (
    (row.subtopic_id ?? null) === scope.subtopicId &&
    normalizeText(row.subtopic_label) === scope.subtopicLabel &&
    (row.module_index ?? null) === scope.moduleIndex &&
    (row.subtopic_index ?? null) === scope.subtopicIndex
  )
}

function isRecentExactMirror(
  row: FeedbackMirrorRow,
  input: {
    subtopicId: string | null
    subtopicLabel: string
    moduleIndex: number | null
    subtopicIndex: number | null
    rating: number | null
    comment: string
  },
) {
  if (!matchesFeedbackScope(row, input)) return false
  if ((row.rating ?? null) !== input.rating) return false
  if (normalizeText(row.comment) !== input.comment) return false

  const createdAtMs = new Date(row.created_at).getTime()
  if (!Number.isFinite(createdAtMs)) return false
  return Date.now() - createdAtMs <= FEEDBACK_MIRROR_WINDOW_MS
}

async function persistFeedbackMirror(input: {
  userId: string
  courseId: string
  originJurnalId: string
  subtopicId: string | null
  subtopicLabel: string
  moduleIndex: number | null
  subtopicIndex: number | null
  structured: StructuredReflectionFields
}) {
  const ratingValue = normalizeReflectionRating(input.structured.contentRating)
  const commentValue = normalizeText(input.structured.contentFeedback)
  const hasMirrorPayload = ratingValue !== null || commentValue.length > 0

  if (!hasMirrorPayload) {
    return { saved: false, action: 'skipped' as const }
  }

  const { data: recentRows, error: recentError } = await adminDb
    .from('feedback')
    .select('id, origin_jurnal_id, subtopic_id, subtopic_label, module_index, subtopic_index, rating, comment, created_at')
    .eq('user_id', input.userId)
    .eq('course_id', input.courseId)
    .order('created_at', { ascending: false })
    .limit(10)

  if (recentError) {
    throw new Error(getErrorMessage(recentError, 'feedback mirror lookup failed'))
  }

  const duplicate = ((recentRows ?? []) as FeedbackMirrorRow[]).find((row) =>
    isRecentExactMirror(row, {
      subtopicId: input.subtopicId,
      subtopicLabel: input.subtopicLabel,
      moduleIndex: input.moduleIndex,
      subtopicIndex: input.subtopicIndex,
      rating: ratingValue,
      comment: commentValue,
    }),
  )

  if (duplicate) {
    if (!duplicate.origin_jurnal_id) {
      const { error: updateError } = await adminDb
        .from('feedback')
        .eq('id', duplicate.id)
        .is('origin_jurnal_id', null)
        .update({ origin_jurnal_id: input.originJurnalId })

      if (updateError) {
        throw new Error(getErrorMessage(updateError, 'feedback mirror origin link failed'))
      }
    }

    return { saved: true, action: 'reused' as const, id: duplicate.id }
  }

  const { data: inserted, error: insertError } = await adminDb
    .from('feedback')
    .insert({
      user_id: input.userId,
      course_id: input.courseId,
      subtopic_id: input.subtopicId,
      module_index: input.moduleIndex,
      subtopic_index: input.subtopicIndex,
      subtopic_label: input.subtopicLabel || null,
      origin_jurnal_id: input.originJurnalId,
      rating: ratingValue,
      comment: commentValue,
    })

  if (insertError) {
    throw new Error(getErrorMessage(insertError, 'feedback mirror insert failed'))
  }

  return { saved: true, action: 'created' as const, id: inserted?.id ?? null }
}

async function postHandler(req: NextRequest) {
  try {
    const headerUserId = resolveAuthUserId(req)
    if (!headerUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 },
      )
    }

    const parsed = parseBody(JurnalSchema, await req.json())
    if (!parsed.success) return parsed.response

    const data = parsed.data as JurnalSubmission
    const subtopicLabel = normalizeText(data.subtopicLabel) || normalizeText(data.subtopic)
    const rawSubtopicId = normalizeText(data.subtopicId)
    const type: ReflectionRecordType = normalizeReflectionType(data.type)
    const moduleIndex = normalizeIndex(data.moduleIndex)
    const subtopicIndex = normalizeIndex(data.subtopicIndex)

    const user = await resolveUserByIdentifier(headerUserId)
    if (!user) {
      return NextResponse.json(
        { error: 'User not found' },
        { status: 404 },
      )
    }

    const courses = await DatabaseService.getRecords('courses', {
      filter: { id: data.courseId, created_by: user.id },
      limit: 1,
    })

    if (courses.length === 0) {
      return NextResponse.json(
        { error: 'Course not found or access denied' },
        { status: 403 },
      )
    }

    let subtopicId: string | null = null
    if (rawSubtopicId) {
      const ownedSubtopics = await DatabaseService.getRecords<{ id: string }>('subtopics', {
        filter: { id: rawSubtopicId, course_id: data.courseId },
        limit: 1,
      })

      if (ownedSubtopics.length === 0) {
        return NextResponse.json(
          { error: 'Subtopic not found in this course' },
          { status: 400 },
        )
      }

      subtopicId = rawSubtopicId
    }

    const structured = type === 'structured_reflection'
      ? parseStructuredReflectionFields(data)
      : null

    if (structured && !isStructuredReflectionComplete(structured)) {
      return NextResponse.json(
        { error: 'Harap isi semua bagian refleksi dan rating sebelum melanjutkan.' },
        { status: 400 },
      )
    }

    const normalizedContent =
      type === 'structured_reflection'
        ? serializeStructuredReflection(structured!)
        : typeof data.content === 'string'
          ? data.content
          : JSON.stringify(data.content)

    const reflectionContext = buildReflectionContext({
      subtopicLabel,
      moduleIndex,
      subtopicIndex,
      subtopicId,
      type,
      structured,
    })
    const researchTimestamp = new Date().toISOString()
    const researchSession = await resolveResearchLearningSession({
      userId: user.id,
      courseId: data.courseId,
      occurredAt: researchTimestamp,
    })

    const jurnalData = {
      user_id: user.id,
      course_id: data.courseId,
      subtopic_id: subtopicId,
      module_index: moduleIndex,
      subtopic_index: subtopicIndex,
      subtopic_label: subtopicLabel || null,
      content: normalizedContent,
      type,
      reflection: JSON.stringify(reflectionContext),
      learning_session_id: researchSession.learningSessionId,
      research_validity_status: 'valid',
      coding_status: type === 'structured_reflection' ? 'auto_coded' : 'uncoded',
      raw_evidence_snapshot: {
        type,
        content: normalizedContent,
        structured,
        reflection_context: reflectionContext,
      },
      data_collection_week: researchSession.dataCollectionWeek,
    }

    const jurnal = await DatabaseService.insertRecord<
      { id: string } & Record<string, unknown>
    >('jurnal', jurnalData)

    console.log('Journal saved to database:', {
      id: jurnal.id,
      user: user.id,
      course: data.courseId,
      subtopicId,
      subtopicLabel,
      type,
      moduleIndex,
      subtopicIndex,
    })

    try {
      await syncResearchEvidenceItem({
        sourceType: 'journal',
        sourceId: jurnal.id,
        sourceTable: 'jurnal',
        userId: user.id,
        courseId: data.courseId,
        learningSessionId: researchSession.learningSessionId,
        rmFocus: 'RM2_RM3',
        evidenceTitle: `Refleksi ${subtopicLabel || type}`,
        evidenceText: normalizedContent,
        evidenceStatus: type === 'structured_reflection' ? 'coded' : 'raw',
        codingStatus: type === 'structured_reflection' ? 'auto_coded' : 'uncoded',
        researchValidityStatus: 'valid',
        dataCollectionWeek: researchSession.dataCollectionWeek,
        evidenceSourceSummary: 'Jurnal/refleksi siswa setelah belajar subtopik.',
        rawEvidenceSnapshot: jurnalData.raw_evidence_snapshot,
        metadata: {
          type,
          subtopic_id: subtopicId,
          subtopic_label: subtopicLabel,
          module_index: moduleIndex,
          subtopic_index: subtopicIndex,
        },
        createdAt: researchTimestamp,
      })
      await refreshResearchSessionMetrics(researchSession.learningSessionId)
    } catch (researchError) {
      console.warn('[Jurnal] Research evidence sync skipped', researchError)
    }

    let feedbackSaved = false
    let feedbackMirrorAction: 'created' | 'reused' | 'skipped' = 'skipped'

    if (type === 'structured_reflection' && structured) {
      try {
        const mirrorResult = await persistFeedbackMirror({
          userId: user.id,
          courseId: data.courseId,
          originJurnalId: jurnal.id,
          subtopicId,
          subtopicLabel,
          moduleIndex,
          subtopicIndex,
          structured,
        })

        feedbackSaved = mirrorResult.saved
        feedbackMirrorAction = mirrorResult.action
      } catch (feedbackError) {
        console.error('[Jurnal] Dual-write feedback insert failed', feedbackError)
        try {
          await adminDb.from('api_logs').insert({
            path: '/api/jurnal/save',
            label: 'feedback-dual-write-failed',
            method: 'POST',
            status_code: 500,
            user_id: user.id,
            error_message: `feedback dual-write failed: ${
              feedbackError instanceof Error ? feedbackError.message : String(feedbackError)
            }`,
            metadata: {
              course_id: data.courseId,
              subtopic_id: subtopicId,
              subtopic_label: subtopicLabel,
            },
            created_at: new Date().toISOString(),
          })
        } catch (logError) {
          console.error('[Jurnal] Failed to log dual-write failure to api_logs:', logError)
        }
      }
    }

    if (type === 'structured_reflection' && structured) {
      after(async () => {
        try {
          const allText = [
            structured.understood,
            structured.confused,
            structured.strategy,
            structured.promptEvolution,
          ].filter(Boolean).join('\n')

          if (allText.length < 20) return

          const { scoreAndSave } = await import('@/services/cognitive-scoring.service')
          await scoreAndSave({
            source: 'journal',
            user_id: user.id,
            course_id: data.courseId,
            source_id: jurnal.id,
            user_text: allText,
            prompt_or_question: 'Refleksi terstruktur (dipahami, membingungkan, strategi, evolusi prompt)',
            reflection_fields: {
              understood: structured.understood,
              confused: structured.confused,
              strategy: structured.strategy,
              promptEvolution: structured.promptEvolution,
            },
          })
        } catch (scoreError) {
          console.warn('[Journal] Cognitive scoring failed:', scoreError)
          try {
            await adminDb.from('api_logs').insert({
              path: '/api/jurnal/save',
              label: 'cognitive-scoring-failed',
              method: 'POST',
              status_code: 500,
              user_id: user.id,
              error_message: `jurnal cognitive scoring failed: ${
                scoreError instanceof Error ? scoreError.message : String(scoreError)
              }`,
              metadata: { jurnal_id: jurnal.id, course_id: data.courseId },
              created_at: new Date().toISOString(),
            })
          } catch (logError) {
            console.error('[Journal] Failed to log scoring error to api_logs:', logError)
          }
        }
      })
    }

    return NextResponse.json({
      success: true,
      id: jurnal.id,
      feedbackSaved,
      feedbackMirrorAction,
    })
  } catch (error: unknown) {
    console.error('Error saving jurnal refleksi:', error)
    return NextResponse.json(
      { error: 'Failed to save jurnal refleksi' },
      { status: 500 },
    )
  }
}

export const POST = withApiLogging(postHandler, {
  label: 'jurnal-save',
})
