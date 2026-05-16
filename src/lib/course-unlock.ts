import { adminDb } from '@/lib/database';

/**
 * MVR Item 7b — Weighted progress + unlock helper for Mode Penelitian.
 *
 * Per leaf-subtopik scoring (0..1):
 *   score = 0.3 * visited + 0.5 * (quizBest if >= 0.6 else 0) + 0.2 * journalSubmitted
 *
 * course_progress = AVG(per-leaf scores). Course is "unlocked" for downstream
 * courses once course_progress of the prerequisite >= 0.70.
 *
 * In-memory cache: 60s TTL per (userId, courseId). The dashboard renders up
 * to 4 cards per visit and we don't want to hammer the DB; the staleness
 * window matches normal user click cadence (open dashboard → open course
 * → return to dashboard).
 */

export interface LeafProgress {
  leafId: string;
  title: string;
  moduleIndex: number;
  subtopicIndex: number;
  visited: boolean;
  quizBest: number; // 0..1
  journalSubmitted: boolean;
  score: number;   // 0..1
}

export interface CourseWeightedProgress {
  courseId: string;
  templateTopic: string | null;
  perLeaf: LeafProgress[];
  averageScore: number;
  meetsUnlockThreshold: boolean;
  unlockThreshold: number;
}

const CACHE_TTL_MS = 60 * 1000;
const cache = new Map<string, { computedAt: number; value: CourseWeightedProgress }>();

function clampScore(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

export async function computeCourseWeightedProgress(
  userId: string,
  courseId: string,
  options: { threshold?: number; skipCache?: boolean } = {},
): Promise<CourseWeightedProgress> {
  const threshold = options.threshold ?? 0.7;
  const cacheKey = `${userId}::${courseId}`;
  const cached = cache.get(cacheKey);
  if (!options.skipCache && cached && Date.now() - cached.computedAt < CACHE_TTL_MS) {
    return cached.value;
  }

  // 1. Course meta + leaf list.
  const { data: courseRow } = await adminDb
    .from('courses')
    .select('id, template_topic')
    .eq('id', courseId)
    .maybeSingle();

  const { data: leafRows } = await adminDb
    .from('leaf_subtopics')
    .select('id, title, module_index, subtopic_index')
    .eq('course_id', courseId)
    .order('module_index', { ascending: true })
    .order('subtopic_index', { ascending: true });

  const leaves = (leafRows ?? []) as Array<{ id: string; title: string; module_index: number; subtopic_index: number }>;
  if (leaves.length === 0) {
    const empty: CourseWeightedProgress = {
      courseId,
      templateTopic: (courseRow as { template_topic?: string | null } | null)?.template_topic ?? null,
      perLeaf: [],
      averageScore: 0,
      meetsUnlockThreshold: false,
      unlockThreshold: threshold,
    };
    cache.set(cacheKey, { computedAt: Date.now(), value: empty });
    return empty;
  }

  // 2. Visit signals — derive from user_progress rows tied to subtopics that
  //    correspond to this course. We approximate "visited" as having any
  //    user_progress row with course_id = courseId (the table is indexed by
  //    subtopic_id, but joining via subtopics back to course filters to this
  //    course's leaves). Falling back to a single SELECT keeps the helper
  //    O(1) round-trips even for the 12-leaf struktur-kendali course.
  const { data: visitRows } = await adminDb
    .from('user_progress')
    .select('subtopic_id, is_completed')
    .eq('user_id', userId)
    .eq('course_id', courseId);

  const visitedSubtopicIds = new Set<string>();
  for (const row of (visitRows ?? []) as Array<{ subtopic_id?: string }>) {
    if (row.subtopic_id) visitedSubtopicIds.add(row.subtopic_id);
  }

  // 3. Quiz scores per leaf — best score per leaf_subtopic_id.
  const leafIds = leaves.map((l) => l.id);
  const { data: quizRows } = await adminDb
    .from('quiz_submissions')
    .select('leaf_subtopic_id, is_correct')
    .eq('user_id', userId)
    .eq('course_id', courseId)
    .in('leaf_subtopic_id', leafIds);

  const quizByLeaf = new Map<string, { correct: number; total: number }>();
  for (const row of (quizRows ?? []) as Array<{ leaf_subtopic_id?: string | null; is_correct?: boolean | null }>) {
    if (!row.leaf_subtopic_id) continue;
    const slot = quizByLeaf.get(row.leaf_subtopic_id) ?? { correct: 0, total: 0 };
    slot.total += 1;
    if (row.is_correct) slot.correct += 1;
    quizByLeaf.set(row.leaf_subtopic_id, slot);
  }

  // 4. Journal submissions per leaf.
  const { data: jurnalRows } = await adminDb
    .from('jurnal')
    .select('subtopic_label, subtopic_id, module_index, subtopic_index')
    .eq('user_id', userId)
    .eq('course_id', courseId);

  const jurnalByPosition = new Set<string>();
  for (const row of (jurnalRows ?? []) as Array<{ module_index?: number; subtopic_index?: number }>) {
    if (typeof row.module_index === 'number' && typeof row.subtopic_index === 'number') {
      jurnalByPosition.add(`${row.module_index}::${row.subtopic_index}`);
    }
  }

  // 5. Compose per-leaf score.
  const perLeaf: LeafProgress[] = leaves.map((leaf) => {
    const visited = visitedSubtopicIds.size > 0; // proxy — best we can do without per-leaf user_progress
    const quizSlot = quizByLeaf.get(leaf.id);
    const quizBest = quizSlot && quizSlot.total > 0
      ? clampScore(quizSlot.correct / quizSlot.total)
      : 0;
    const journalSubmitted = jurnalByPosition.has(`${leaf.module_index}::${leaf.subtopic_index}`);

    const quizComponent = quizBest >= 0.6 ? quizBest : 0;
    const score = clampScore(0.3 * (visited ? 1 : 0) + 0.5 * quizComponent + 0.2 * (journalSubmitted ? 1 : 0));

    return {
      leafId: leaf.id,
      title: leaf.title,
      moduleIndex: leaf.module_index,
      subtopicIndex: leaf.subtopic_index,
      visited,
      quizBest,
      journalSubmitted,
      score,
    };
  });

  const averageScore = clampScore(
    perLeaf.reduce((sum, l) => sum + l.score, 0) / perLeaf.length,
  );

  const result: CourseWeightedProgress = {
    courseId,
    templateTopic: (courseRow as { template_topic?: string | null } | null)?.template_topic ?? null,
    perLeaf,
    averageScore,
    meetsUnlockThreshold: averageScore >= threshold,
    unlockThreshold: threshold,
  };
  cache.set(cacheKey, { computedAt: Date.now(), value: result });
  return result;
}

export function invalidateCourseProgressCache(userId?: string, courseId?: string) {
  if (!userId && !courseId) {
    cache.clear();
    return;
  }
  for (const key of Array.from(cache.keys())) {
    if (userId && !key.startsWith(`${userId}::`)) continue;
    if (courseId && !key.endsWith(`::${courseId}`)) continue;
    cache.delete(key);
  }
}
