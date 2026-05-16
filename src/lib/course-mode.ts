import { adminDb } from '@/lib/database';

export type LearningMode = 'general' | 'research';

export const LEARNING_MODE_VALUES = ['general', 'research'] as const;

export function isLearningMode(value: unknown): value is LearningMode {
  return value === 'general' || value === 'research';
}

export function coerceLearningMode(value: unknown, fallback: LearningMode = 'general'): LearningMode {
  return isLearningMode(value) ? value : fallback;
}

/**
 * Resolve the `mode` of a course (general|research). Falls back to 'general' on
 * miss/error so existing courses without the column still behave like Mode Umum.
 * Cheap single SELECT — call sites should run this once per request, not per
 * write, and pass the resolved value through to any dependent inserts.
 */
export async function getCourseMode(courseId: string | null | undefined): Promise<LearningMode> {
  if (!courseId || typeof courseId !== 'string') return 'general';

  try {
    const { data } = await adminDb
      .from('courses')
      .select('mode')
      .eq('id', courseId)
      .maybeSingle();

    const row = data as { mode?: unknown } | null;
    return coerceLearningMode(row?.mode);
  } catch (error) {
    console.warn('[course-mode] Failed to resolve course mode, defaulting to general', error);
    return 'general';
  }
}
