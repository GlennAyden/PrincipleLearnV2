import { NextRequest, NextResponse } from 'next/server'
import { withApiLogging } from '@/lib/api-logger'
import { resolveAuthContext } from '@/lib/auth-helper'
import { assertCourseOwnership, toOwnershipError } from '@/lib/ownership'
import { buildLearningProgressStatus } from '@/lib/learning-progress'
import { normalizeText } from '@/lib/reflection-submission'

async function getHandler(req: NextRequest) {
  try {
    const auth = resolveAuthContext(req)
    if (!auth?.userId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const courseId = normalizeText(req.nextUrl.searchParams.get('courseId'))
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

    const progress = await buildLearningProgressStatus({
      courseId,
      userId: auth.userId,
    })

    return NextResponse.json({ success: true, ...progress })
  } catch (error) {
    console.error('[LearningProgress] Failed to build status', error)
    const message = error instanceof Error ? error.message : 'Failed to load learning progress'
    return NextResponse.json(
      { error: message },
      { status: message === 'Course not found' ? 404 : 500 },
    )
  }
}

export const GET = withApiLogging(getHandler, {
  label: 'learning-progress',
})

