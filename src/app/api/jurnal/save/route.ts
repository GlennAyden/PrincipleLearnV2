// "jurnal" uses Indonesian spelling — matches the database table name.
import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService, adminDb } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { JurnalSchema, parseBody } from '@/lib/schemas';
import { resolveAuthUserId } from '@/lib/auth-helper';
import { resolveUserByIdentifier } from '@/services/auth.service';

interface JurnalSubmission {
  userId: string;
  courseId: string;
  subtopicId?: string;
  subtopicLabel?: string;
  subtopic?: string;
  moduleIndex?: number | string | null;
  subtopicIndex?: number | string | null;
  content: string | Record<string, unknown>;
  type?: string;
  understood?: string;
  confused?: string;
  strategy?: string;
  promptEvolution?: string;
  contentRating?: number;
  contentFeedback?: string;
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeIndex(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.floor(numeric) : null;
}

function parseStructuredContent(data: JurnalSubmission) {
  const asObject =
    typeof data.content === 'object' && data.content !== null
      ? (data.content as Record<string, unknown>)
      : null;

  if (asObject) {
    return {
      understood: normalizeText(asObject.understood),
      confused: normalizeText(asObject.confused),
      strategy: normalizeText(asObject.strategy),
      promptEvolution: normalizeText(asObject.promptEvolution),
      contentRating:
        typeof asObject.contentRating === 'number' && Number.isFinite(asObject.contentRating)
          ? asObject.contentRating
          : null,
      contentFeedback: normalizeText(asObject.contentFeedback),
    };
  }

  if (typeof data.content === 'string') {
    try {
      const parsed = JSON.parse(data.content) as Record<string, unknown>;
      if (parsed && typeof parsed === 'object') {
        return {
          understood: normalizeText(parsed.understood),
          confused: normalizeText(parsed.confused),
          strategy: normalizeText(parsed.strategy),
          promptEvolution: normalizeText(parsed.promptEvolution),
          contentRating:
            typeof parsed.contentRating === 'number' && Number.isFinite(parsed.contentRating)
              ? parsed.contentRating
              : null,
          contentFeedback: normalizeText(parsed.contentFeedback),
        };
      }
    } catch {
      // Non-JSON content is handled as free text below.
    }
  }

  return {
    understood: normalizeText(data.understood),
    confused: normalizeText(data.confused),
    strategy: normalizeText(data.strategy),
    promptEvolution: normalizeText(data.promptEvolution),
    contentRating:
      typeof data.contentRating === 'number' && Number.isFinite(data.contentRating)
        ? data.contentRating
        : null,
    contentFeedback: normalizeText(data.contentFeedback),
  };
}

async function postHandler(req: NextRequest) {
  try {
    // Resolve authenticated user ID — prefers middleware-injected header,
    // falls back to decoding the access_token cookie directly because the
    // header occasionally fails to propagate in Next.js 15 production.
    const headerUserId = resolveAuthUserId(req);
    if (!headerUserId) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Validate request body
    const parsed = parseBody(JurnalSchema, await req.json());
    if (!parsed.success) return parsed.response;
    const data = parsed.data as JurnalSubmission;
    const subtopicLabel = normalizeText(data.subtopicLabel) || normalizeText(data.subtopic);
    const rawSubtopicId = normalizeText(data.subtopicId);
    const type = normalizeText(data.type) || 'free_text';
    const moduleIndex = normalizeIndex(data.moduleIndex);
    const subtopicIndex = normalizeIndex(data.subtopicIndex);

    // Find user in database using authenticated user ID from JWT
    const user = await resolveUserByIdentifier(headerUserId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Find course in database — enforce ownership: only the course owner
    // (created_by) may attach a journal entry to it. This prevents User A
    // from saving a jurnal record against User B's course.
    const courses = await DatabaseService.getRecords('courses', {
      filter: { id: data.courseId, created_by: user.id },
      limit: 1
    });

    if (courses.length === 0) {
      return NextResponse.json(
        { error: 'Course not found or access denied' },
        { status: 403 }
      );
    }

    // Validate that the supplied subtopic_id (the `subtopics` row id for
    // the MODULE) actually belongs to this course. Prevents mis-scoping
    // a jurnal row against another course's module.
    let subtopicId: string | null = null;
    if (rawSubtopicId) {
      const ownedSubtopics = await DatabaseService.getRecords<{ id: string }>('subtopics', {
        filter: { id: rawSubtopicId, course_id: data.courseId },
        limit: 1,
      });
      if (ownedSubtopics.length > 0) {
        subtopicId = rawSubtopicId;
      } else {
        console.warn('[Jurnal] Rejected subtopicId — not found in course', {
          courseId: data.courseId,
          subtopicId: rawSubtopicId,
        });
      }
    }

    const structured = type === 'structured_reflection' ? parseStructuredContent(data) : null;

    const normalizedContent =
      type === 'structured_reflection'
        ? JSON.stringify({
            understood: structured?.understood || '',
            confused: structured?.confused || '',
            strategy: structured?.strategy || '',
            promptEvolution: structured?.promptEvolution || '',
            contentRating: structured?.contentRating,
            contentFeedback: structured?.contentFeedback || '',
          })
        : typeof data.content === 'string'
          ? data.content
          : JSON.stringify(data.content);

    const reflectionContext = {
      subtopic: subtopicLabel || null,
      moduleIndex,
      subtopicIndex,
      subtopicId,
      fields:
        type === 'structured_reflection'
          ? {
              understood: structured?.understood || '',
              confused: structured?.confused || '',
              strategy: structured?.strategy || '',
              promptEvolution: structured?.promptEvolution || '',
              contentRating: structured?.contentRating,
              contentFeedback: structured?.contentFeedback || '',
            }
          : null,
    };

    // INSERT-only semantics: every submission creates a new row so per
    // subtopic reflections are preserved and we keep an audit trail for
    // research. The legacy overwrite-on-upsert path dropped reflections
    // from every prior subtopic because the unique constraint was on
    // (user_id, course_id) only — that constraint has been migrated
    // away and replaced with an (user_id, course_id, subtopic_id,
    // subtopic_label) index for reads.
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
    };

    const jurnal = await DatabaseService.insertRecord<
      { id: string } & Record<string, unknown>
    >('jurnal', jurnalData);

    console.log(`Journal saved to database:`, {
      id: jurnal.id,
      user: user.id,
      course: data.courseId,
      subtopicId,
      subtopicLabel,
      type,
      moduleIndex,
      subtopicIndex,
    });

    // Dual-write: when the reflection carries a rating (content
    // satisfaction) or free-form content feedback, persist it into the
    // `feedback` table as well so research queries have proper columns
    // to filter on (rating, comment, subtopic_id, subtopic_label)
    // instead of having to parse JSON out of jurnal.content. Feedback
    // write is secondary — a failure here is logged to api_logs but
    // does NOT fail the primary jurnal save.
    let feedbackSaved = false;
    if (
      type === 'structured_reflection' &&
      (typeof structured?.contentRating === 'number' ||
        (structured?.contentFeedback && structured.contentFeedback.length > 0))
    ) {
      try {
        const ratingValue =
          typeof structured.contentRating === 'number' &&
          structured.contentRating >= 1 &&
          structured.contentRating <= 5
            ? structured.contentRating
            : null;
        const { error: feedbackError } = await adminDb.from('feedback').insert({
          user_id: user.id,
          course_id: data.courseId,
          subtopic_id: subtopicId,
          module_index: moduleIndex,
          subtopic_index: subtopicIndex,
          subtopic_label: subtopicLabel || null,
          rating: ratingValue,
          comment: structured.contentFeedback || '',
        });
        if (feedbackError) {
          throw new Error(
            (feedbackError as { message?: string })?.message || 'feedback insert error',
          );
        }
        feedbackSaved = true;
      } catch (feedbackError) {
        console.error('[Jurnal] Dual-write feedback insert failed', feedbackError);
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
          });
        } catch (logError) {
          console.error('[Jurnal] Failed to log dual-write failure to api_logs:', logError);
        }
      }
    }

    if (type === 'structured_reflection' && structured) {
      after(async () => {
        try {
          const allText = [
            structured.understood, structured.confused,
            structured.strategy, structured.promptEvolution,
          ].filter(Boolean).join('\n');
          if (allText.length < 20) return;

          const { scoreAndSave } = await import('@/services/cognitive-scoring.service');
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
          });
        } catch (scoreError) {
          console.warn('[Journal] Cognitive scoring failed:', scoreError);
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
            });
          } catch (logError) {
            console.error('[Journal] Failed to log scoring error to api_logs:', logError);
          }
        }
      });
    }

    return NextResponse.json({ success: true, id: jurnal.id, feedbackSaved });
  } catch (error: unknown) {
    console.error('Error saving jurnal refleksi:', error);
    return NextResponse.json(
      { error: 'Failed to save jurnal refleksi' },
      { status: 500 }
    );
  }
} 

export const POST = withApiLogging(postHandler, {
  label: 'jurnal-save',
});