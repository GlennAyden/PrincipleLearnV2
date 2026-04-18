import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { FeedbackSchema, parseBody } from '@/lib/schemas';
import { resolveAuthUserId } from '@/lib/auth-helper';
import { resolveUserByIdentifier } from '@/services/auth.service';
import {
  refreshResearchSessionMetrics,
  resolveResearchLearningSession,
  syncResearchEvidenceItem,
} from '@/services/research-session.service';

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function parseIndex(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function parseRating(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  if (numeric < 1 || numeric > 5) return null;
  return numeric;
}

async function postHandler(req: NextRequest) {
  try {
    // Resolve authenticated user ID — prefers middleware-injected header,
    // falls back to decoding the access_token cookie directly because the
    // header occasionally fails to propagate in Next.js 15 production.
    const headerUserId = resolveAuthUserId(req);
    if (!headerUserId) {
      return NextResponse.json(
        { error: 'Autentikasi diperlukan' },
        { status: 401 }
      );
    }

    // Validate request body
    const parsed = parseBody(FeedbackSchema, await req.json());
    if (!parsed.success) return parsed.response;
    const {
      subtopicId, subtopic, moduleIndex, subtopicIndex,
      comment, rating, courseId,
    } = parsed.data;

    const normalizedComment = normalizeText(comment);
    const normalizedUserId = normalizeText(headerUserId);
    const normalizedCourseId = normalizeText(courseId);
    const normalizedSubtopicId = normalizeText(subtopicId);
    const normalizedSubtopicLabel = normalizeText(subtopic);
    const normalizedModuleIndex = parseIndex(moduleIndex);
    const normalizedSubtopicIndex = parseIndex(subtopicIndex);
    const normalizedRating = parseRating(rating);
    const hasRating = typeof normalizedRating === 'number';

    // Save feedback to database
    try {
      // Find user in database (accept both user id and email)
      const user = await resolveUserByIdentifier(normalizedUserId);

      if (!user) {
        return NextResponse.json(
          { error: `User not found for identifier: ${normalizedUserId}` },
          { status: 404 }
        );
      }

      // Find course in database
      const courses = await DatabaseService.getRecords('courses', {
        filter: { id: normalizedCourseId, created_by: user.id },
        limit: 1
      });
      
      if (courses.length === 0) {
        return NextResponse.json(
          { error: 'Course not found or access denied' },
          { status: 403 }
        );
      }

      let subtopicTitle: string | null = null;
      let scopedSubtopicId: string | null = null;
      if (normalizedSubtopicId) {
        try {
          const subtopics = await DatabaseService.getRecords<{ id: string; title: string }>('subtopics', {
            filter: { id: normalizedSubtopicId, course_id: normalizedCourseId },
            limit: 1,
          });
          scopedSubtopicId = subtopics[0]?.id ?? null;
          subtopicTitle = subtopics[0]?.title ?? null;
        } catch (subtopicError) {
          console.error('Error fetching subtopic for feedback context:', subtopicError);
        }
      }

      if (normalizedSubtopicId && !scopedSubtopicId) {
        return NextResponse.json(
          { error: 'Subtopic not found in this course' },
          { status: 400 }
        );
      }

      if (!subtopicTitle && normalizedSubtopicLabel) {
        subtopicTitle = normalizedSubtopicLabel;
      }

      // Save as feedback in database
      const feedbackData = {
        user_id: user.id,
        course_id: normalizedCourseId,
        subtopic_id: scopedSubtopicId,
        module_index: normalizedModuleIndex,
        subtopic_index: normalizedSubtopicIndex,
        subtopic_label: subtopicTitle,
        rating: hasRating ? normalizedRating : null,
        comment: normalizedComment,
      };
      
      interface FeedbackRecord {
        id: string;
        user_id: string;
        course_id: string;
        subtopic_id: string | null;
        module_index: number | null;
        subtopic_index: number | null;
        subtopic_label: string | null;
        rating: number | null;
        comment: string;
      }
      const savedFeedback = await DatabaseService.insertRecord<FeedbackRecord>('feedback', feedbackData);
      console.log('Feedback saved to database:', {
        id: savedFeedback.id,
        user: normalizedUserId,
        course: normalizedCourseId,
        moduleIndex: normalizedModuleIndex,
        subtopicIndex: normalizedSubtopicIndex,
        rating: normalizedRating,
      });

      try {
        const researchTimestamp = new Date().toISOString();
        const researchSession = await resolveResearchLearningSession({
          userId: user.id,
          courseId: normalizedCourseId,
          occurredAt: researchTimestamp,
        });
        await syncResearchEvidenceItem({
          sourceType: 'journal',
          sourceId: savedFeedback.id,
          sourceTable: 'feedback',
          userId: user.id,
          courseId: normalizedCourseId,
          learningSessionId: researchSession.learningSessionId,
          rmFocus: 'RM2_RM3',
          evidenceTitle: `Feedback ${subtopicTitle || normalizedSubtopicLabel || 'subtopik'}`,
          evidenceText: normalizedComment || `Rating: ${normalizedRating ?? '-'}`,
          evidenceStatus: normalizedComment ? 'raw' : 'needs_review',
          codingStatus: 'uncoded',
          researchValidityStatus: normalizedComment ? 'valid' : 'low_information',
          dataCollectionWeek: researchSession.dataCollectionWeek,
          evidenceSourceSummary: 'Komentar/rating siswa setelah belajar subtopik.',
          rawEvidenceSnapshot: {
            rating: normalizedRating,
            comment: normalizedComment,
            subtopic_id: scopedSubtopicId,
            subtopic_label: subtopicTitle,
            module_index: normalizedModuleIndex,
            subtopic_index: normalizedSubtopicIndex,
          },
          metadata: {
            mapped_source_type: 'journal',
            original_source_type: 'feedback',
          },
          createdAt: researchTimestamp,
        });
        await refreshResearchSessionMetrics(researchSession.learningSessionId);
      } catch (researchError) {
        console.warn('[Feedback] Research evidence sync skipped', researchError);
      }
    } catch (error) {
      console.error('Error saving feedback to database:', error);
      return NextResponse.json(
        { error: 'Gagal menyimpan umpan balik' },
        { status: 500 }
      );
    }

    // Kirim kembali respons ke client
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    console.error('Error saving feedback:', error);
    return NextResponse.json(
      { error: 'Gagal menyimpan umpan balik' },
      { status: 500 }
    );
  }
}

export const POST = withApiLogging(postHandler, {
  label: 'feedback',
});
