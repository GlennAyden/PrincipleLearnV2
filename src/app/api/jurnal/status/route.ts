// "jurnal" uses Indonesian spelling and is the primary read/write path for
// reflection submissions in the learning flow.
import { NextRequest, NextResponse } from 'next/server'
import { withApiLogging } from '@/lib/api-logger'
import { DatabaseService } from '@/lib/database'
import { resolveAuthContext } from '@/lib/auth-helper'
import { assertCourseOwnership, toOwnershipError } from '@/lib/ownership'
import { getStructuredReflectionStatus, normalizeReflectionScope } from '@/lib/reflection-status'
import { normalizeIndex, normalizeText } from '@/lib/reflection-submission'

async function getHandler(req: NextRequest) {
  try {
    const auth = resolveAuthContext(req)
    if (!auth?.userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const params = req.nextUrl.searchParams
    const courseId = normalizeText(params.get('courseId'))
    if (!courseId) {
      return NextResponse.json({ error: 'courseId is required' }, { status: 400 })
    }

    try {
      await assertCourseOwnership(auth.userId, courseId, auth.role)
    } catch (ownershipErr) {
      const asOwnership = toOwnershipError(ownershipErr)
      if (asOwnership) {
        return NextResponse.json({ error: asOwnership.message }, { status: asOwnership.status })
      }
      throw ownershipErr
    }

    const subtopicId = normalizeText(params.get('subtopicId')) || null
    if (subtopicId) {
      const subtopics = await DatabaseService.getRecords<{ id: string }>('subtopics', {
        filter: { id: subtopicId, course_id: courseId },
        limit: 1,
      })

      if (subtopics.length === 0) {
        return NextResponse.json(
          { error: 'Subtopic not found in this course' },
          { status: 400 },
        )
      }
    }

    const scope = normalizeReflectionScope({
      userId: auth.userId,
      courseId,
      subtopicId,
      subtopicLabel: params.get('subtopicLabel') ?? params.get('subtopic') ?? '',
      moduleIndex: normalizeIndex(params.get('moduleIndex')),
      subtopicIndex: normalizeIndex(params.get('subtopicIndex')),
    })

    const status = await getStructuredReflectionStatus(scope)

    return NextResponse.json({
      success: true,
      scope: {
        courseId: scope.courseId,
        subtopicId: scope.subtopicId,
        subtopicLabel: scope.subtopicLabel || null,
        moduleIndex: scope.moduleIndex,
        subtopicIndex: scope.subtopicIndex,
      },
      status: {
        submitted: status.submitted,
        completed: status.completed,
        revisionCount: status.revisionCount,
        latestSubmittedAt: status.latestSubmittedAt,
        sourceKinds: status.sourceKinds,
        hasFeedbackMirror: status.hasFeedbackMirror,
      },
      latest: status.latest,
    })
  } catch (error) {
    console.error('[JurnalStatus] Failed to load reflection status', error)
    return NextResponse.json(
      { error: 'Failed to load reflection status' },
      { status: 500 },
    )
  }
}

export const GET = withApiLogging(getHandler, {
  label: 'jurnal-status',
})

