import { NextRequest, NextResponse } from 'next/server';

import { withApiLogging } from '@/lib/api-logger';
import { evaluateModuleDiscussionPrerequisites } from '@/lib/discussion-prerequisites';
import { resolveDiscussionSubtopicId } from '@/lib/discussion/resolveSubtopic';
import { verifyToken } from '@/lib/jwt';
import { assertCourseOwnership, toOwnershipError } from '@/lib/ownership';
import {
  DISCUSSION_TEMPLATE_FAILED_MESSAGE,
  DISCUSSION_TEMPLATE_PREPARATION_FAILED_CODE,
  DISCUSSION_TEMPLATE_PREPARING_CODE,
  DISCUSSION_TEMPLATE_PREPARING_MESSAGE,
  isDiscussionLabel,
  normalizeIdentifier,
  prepareDiscussionTemplateNow,
} from '@/services/discussion/templatePreparation';

async function postHandler(request: NextRequest) {
  try {
    const accessToken = request.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const { courseId, subtopicId: rawSubtopicId, subtopicTitle, moduleTitle } = body || {};

    if (!courseId) {
      return NextResponse.json({ error: 'courseId is required' }, { status: 400 });
    }

    try {
      await assertCourseOwnership(tokenPayload.userId, courseId, tokenPayload.role);
    } catch (ownershipErr) {
      const asOwnership = toOwnershipError(ownershipErr);
      if (asOwnership) {
        return NextResponse.json(
          { error: asOwnership.message },
          { status: asOwnership.status },
        );
      }
      throw ownershipErr;
    }

    const subtopicId = await resolveDiscussionSubtopicId({
      courseId,
      subtopicId: rawSubtopicId,
      subtopicTitle,
    });

    if (!subtopicId) {
      return NextResponse.json(
        {
          code: 'DISCUSSION_CONTEXT_NOT_FOUND',
          error: 'Unable to resolve discussion context for this subtopic',
        },
        { status: 404 },
      );
    }

    const moduleScopeRequested =
      (typeof subtopicTitle === 'string' && isDiscussionLabel(subtopicTitle)) ||
      (typeof moduleTitle === 'string' &&
        typeof subtopicTitle === 'string' &&
        normalizeIdentifier(moduleTitle) === normalizeIdentifier(subtopicTitle));

    if (moduleScopeRequested) {
      const prerequisites = await evaluateModuleDiscussionPrerequisites({
        courseId,
        moduleId: subtopicId,
        userId: tokenPayload.userId,
      });

      if (!prerequisites.ready) {
        return NextResponse.json(
          {
            code: 'PREREQUISITES_INCOMPLETE',
            error: 'Selesaikan materi, kuis, dan refleksi seluruh subtopik modul ini sebelum memulai diskusi.',
            prerequisites,
          },
          { status: 409 },
        );
      }
    }

    const preparation = await prepareDiscussionTemplateNow({
      courseId,
      subtopicId,
      subtopicTitle,
      moduleTitle,
      mode: 'ai_regenerated',
      trigger: 'discussion_prepare_request',
    });

    if (preparation.status === 'ready') {
      return NextResponse.json({
        status: 'ready',
        message: 'Diskusi siap dimulai.',
        preparation,
      });
    }

    if (preparation.status === 'running' || preparation.status === 'queued') {
      const response = NextResponse.json(
        {
          code: DISCUSSION_TEMPLATE_PREPARING_CODE,
          status: 'preparing',
          error: preparation.message || DISCUSSION_TEMPLATE_PREPARING_MESSAGE,
          message: preparation.message || DISCUSSION_TEMPLATE_PREPARING_MESSAGE,
          retryAfterSeconds: preparation.retryAfterSeconds,
          errorCode: preparation.errorCode,
          preparation,
        },
        { status: 202 },
      );
      response.headers.set('Retry-After', String(preparation.retryAfterSeconds || 30));
      return response;
    }

    const response = NextResponse.json(
      {
        code: DISCUSSION_TEMPLATE_PREPARATION_FAILED_CODE,
        status: 'failed',
        error: preparation.message || DISCUSSION_TEMPLATE_FAILED_MESSAGE,
        message: preparation.message || DISCUSSION_TEMPLATE_FAILED_MESSAGE,
        retryAfterSeconds: preparation.retryAfterSeconds,
        retryable: true,
        errorCode: preparation.errorCode,
        failureCount: preparation.failureCount,
        preparation,
      },
      { status: 503 },
    );
    response.headers.set('Retry-After', String(preparation.retryAfterSeconds || 30));
    response.headers.set('x-log-error-message', DISCUSSION_TEMPLATE_PREPARATION_FAILED_CODE);
    return response;
  } catch (error) {
    console.error('[DiscussionPrepare] Failed to prepare discussion template', error);
    const response = NextResponse.json(
      { error: 'Failed to prepare discussion template' },
      { status: 500 },
    );
    response.headers.set(
      'x-log-error-message',
      error instanceof Error ? error.message : String(error),
    );
    return response;
  }
}

export const POST = withApiLogging(postHandler, {
  label: 'discussion.prepare',
});
