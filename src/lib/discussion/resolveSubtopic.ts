import { adminDb } from '@/lib/database';

interface ResolveParams {
  courseId?: string | null;
  subtopicId?: string | null;
  subtopicTitle?: string | null;
}

export async function resolveDiscussionSubtopicId({
  courseId,
  subtopicId,
  subtopicTitle,
}: ResolveParams): Promise<string | null> {
  if (subtopicId) {
    return subtopicId;
  }

  if (!courseId || !subtopicTitle) {
    return null;
  }

  try {
    const { data: templateMatch, error: templateError } = await adminDb
      .from('discussion_templates')
      .select('subtopic_id')
      .eq('course_id', courseId)
      .contains('source', { subtopicTitle })
      .order('version', { ascending: false })
      .limit(1);

    if (!templateError && templateMatch?.[0]?.subtopic_id) {
      return templateMatch[0].subtopic_id as string;
    }

    const { data: subtopicMatch, error: subtopicError } = await adminDb
      .from('subtopics')
      .select('id')
      .eq('course_id', courseId)
      .ilike('title', subtopicTitle)
      .limit(1);

    if (!subtopicError && subtopicMatch?.[0]?.id) {
      return subtopicMatch[0].id as string;
    }
  } catch (error) {
    console.warn('[Discussion] Failed to resolve subtopic id', error);
  }

  return null;
}
