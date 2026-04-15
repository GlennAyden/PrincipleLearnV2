// "jurnal" uses Indonesian spelling — matches the database table name.
import { NextResponse, after } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { JurnalSchema, parseBody } from '@/lib/schemas';
import { resolveAuthUserId } from '@/lib/auth-helper';
import { resolveUserByIdentifier } from '@/services/auth.service';

interface JurnalSubmission {
  userId: string;
  courseId: string;
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
    const subtopic = normalizeText(data.subtopic);
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
      subtopic: subtopic || null,
      moduleIndex,
      subtopicIndex,
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

    // Save journal to database — upsert by (user_id, course_id) so that
    // re-submitting a reflection updates the existing row instead of
    // creating duplicate journal records for the same course.
    const jurnalData = {
      user_id: user.id,
      course_id: data.courseId,
      content: normalizedContent,
      type,
      reflection: JSON.stringify(reflectionContext),
    };

    const existingJurnal = await DatabaseService.getRecords<{ id: string }>('jurnal', {
      filter: { user_id: user.id, course_id: data.courseId },
      limit: 1,
    });

    const jurnal = existingJurnal.length > 0
      ? await DatabaseService.updateRecord<{ id: string } & Record<string, unknown>>(
          'jurnal',
          existingJurnal[0].id,
          jurnalData,
        )
      : await DatabaseService.insertRecord<{ id: string } & Record<string, unknown>>('jurnal', jurnalData);
    
    console.log(`Journal saved to database:`, {
      id: jurnal.id,
      user: user.id,
      course: data.courseId,
      subtopic,
      type,
      moduleIndex,
      subtopicIndex,
    });

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
        }
      });
    }

    return NextResponse.json({ success: true, id: jurnal.id });
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