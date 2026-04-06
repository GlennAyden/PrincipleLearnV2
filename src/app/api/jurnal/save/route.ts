// "jurnal" uses Indonesian spelling — matches the database table name.
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { withApiLogging } from '@/lib/api-logger';
import { JurnalSchema, parseBody } from '@/lib/schemas';
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
    // Validate request body
    const parsed = parseBody(JurnalSchema, await req.json());
    if (!parsed.success) return parsed.response;
    const data = parsed.data as JurnalSubmission;
    const subtopic = normalizeText(data.subtopic);
    const type = normalizeText(data.type) || 'free_text';
    const moduleIndex = normalizeIndex(data.moduleIndex);
    const subtopicIndex = normalizeIndex(data.subtopicIndex);

    // Find user in database (accept both user id and email)
    const user = await resolveUserByIdentifier(data.userId);
    if (!user) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Find course in database
    const courses = await DatabaseService.getRecords('courses', {
      filter: { id: data.courseId },
      limit: 1
    });

    if (courses.length === 0) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
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

    // Save journal to database
    const jurnalData = {
      user_id: user.id,
      course_id: data.courseId,
      content: normalizedContent,
      type,
      reflection: JSON.stringify(reflectionContext),
    };

    const jurnal = await DatabaseService.insertRecord<{ id: string } & Record<string, unknown>>('jurnal', jurnalData);
    
    console.log(`Journal saved to database:`, {
      id: jurnal.id,
      user: user.id,
      course: data.courseId,
      subtopic,
      type,
      moduleIndex,
      subtopicIndex,
    });

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