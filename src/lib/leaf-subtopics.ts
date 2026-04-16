import { adminDb as defaultAdminDb } from '@/lib/database';

type AdminDbLike = typeof defaultAdminDb;

export interface LeafSubtopicScope {
  courseId: string;
  moduleId?: string | null;
  moduleTitle?: string | null;
  subtopicTitle?: string | null;
  moduleIndex?: number | null;
  subtopicIndex?: number | null;
}

export function normalizeLeafSubtopicTitle(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export async function ensureLeafSubtopic(
  scope: LeafSubtopicScope,
  adminDb: AdminDbLike = defaultAdminDb,
): Promise<string | null> {
  const moduleId = scope.moduleId?.trim();
  const subtopicTitle = scope.subtopicTitle?.trim();

  if (!scope.courseId || !moduleId || !subtopicTitle) {
    return null;
  }

  try {
    const { data, error } = await adminDb.rpc('ensure_leaf_subtopic', {
      p_course_id: scope.courseId,
      p_module_id: moduleId,
      p_module_title: scope.moduleTitle?.trim() || null,
      p_subtopic_title: subtopicTitle,
      p_module_index: typeof scope.moduleIndex === 'number' ? scope.moduleIndex : null,
      p_subtopic_index: typeof scope.subtopicIndex === 'number' ? scope.subtopicIndex : null,
    });

    if (error) {
      console.warn('[leaf-subtopics] ensure_leaf_subtopic RPC failed', error);
      return null;
    }

    return typeof data === 'string' ? data : null;
  } catch (error) {
    console.warn('[leaf-subtopics] ensure_leaf_subtopic threw', error);
    return null;
  }
}

export async function findLeafSubtopicId(
  scope: LeafSubtopicScope,
  adminDb: AdminDbLike = defaultAdminDb,
): Promise<string | null> {
  const moduleId = scope.moduleId?.trim();
  const normalizedTitle = normalizeLeafSubtopicTitle(scope.subtopicTitle);

  if (!scope.courseId || !moduleId || !normalizedTitle) {
    return null;
  }

  try {
    const { data, error } = await adminDb
      .from('leaf_subtopics')
      .select('id')
      .eq('course_id', scope.courseId)
      .eq('module_id', moduleId)
      .eq('normalized_title', normalizedTitle)
      .maybeSingle();

    if (error) {
      console.warn('[leaf-subtopics] leaf_subtopics lookup failed', error);
      return null;
    }

    return (data as { id?: string } | null)?.id ?? null;
  } catch (error) {
    console.warn('[leaf-subtopics] leaf_subtopics lookup threw', error);
    return null;
  }
}
