// src/lib/quiz-sync.ts
// Shared helpers for syncing quiz questions into the `quiz` table.
//
// Two modes:
// - syncQuizQuestions: insert-first, delete-later (the default for
//   generate-subtopic). BUT skips the delete if there are existing
//   `quiz_submissions` rows referencing the subtopic's quiz — doing so
//   would orphan historical FKs and break the admin display.
// - appendNewQuizQuestions: always insert, never delete. Used by the
//   Reshuffle feature so previous attempts remain auditable.

import { adminDb as defaultAdminDb } from '@/lib/database';

export interface QuizItem {
  question?: string;
  options?: unknown[];
  correctIndex?: number;
}

type AdminDbLike = typeof defaultAdminDb;

export interface SyncQuizParams {
  adminDb: AdminDbLike;
  courseId?: string;
  moduleTitle?: string;
  subtopicTitle?: string;
  quizItems?: QuizItem[];
  subtopicId?: string;
  subtopicData?: { id?: string; title?: string; content?: string | null };
}

export interface SyncQuizResult {
  resolvedSubtopicId: string | null;
  subtopicLabel: string;
  insertedCount: number;
  skippedDelete: boolean;
}

// subtopic_label = per-subtopic scoping key stored on every quiz row.
// The `subtopics` table is keyed per MODULE, so without this label every
// sibling subtopic inside the same module collides on the same subtopic_id.
export function normalizeSubtopicLabel(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.trim();
}

/**
 * Canonical cache key for `subtopic_cache` rows. We lowercase + collapse
 * whitespace so trivial drift (casing, double spaces) across the various
 * writers and readers (generate-subtopic, quiz/submit lazy-seed, completion
 * tracker) hit the same row. Every caller constructing a cache key MUST go
 * through this helper — a hand-rolled template string will reintroduce the
 * 2026-04 cache-miss regression where the seed would silently no-op.
 */
export function normalizeCacheKeyPart(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function buildSubtopicCacheKey(
  courseId: string,
  moduleTitle: string,
  subtopicTitle: string,
): string {
  return `${courseId}-${normalizeCacheKeyPart(moduleTitle)}-${normalizeCacheKeyPart(subtopicTitle)}`;
}

async function resolveSubtopic(
  adminDb: AdminDbLike,
  courseId: string,
  moduleTitle: string | undefined,
  subtopicTitle: string | undefined,
  subtopicData: SyncQuizParams['subtopicData'],
): Promise<{ id?: string; title?: string } | null> {
  if (subtopicData?.id) return subtopicData;

  // Use ilike + trim so whitespace/casing drift between the outline
  // cached on the client and the persisted `subtopics.title` value does
  // not cause a silent miss (which would leave the `quiz` table empty).
  const trimmedModuleTitle = moduleTitle?.trim() ?? '';
  const trimmedSubtopicTitle = subtopicTitle?.trim() ?? '';

  try {
    if (trimmedModuleTitle) {
      const { data: directMatch } = await adminDb
        .from('subtopics')
        .select('id, title')
        .eq('course_id', courseId)
        .ilike('title', trimmedModuleTitle)
        .maybeSingle();
      if (directMatch) return directMatch;
    }

    if (trimmedSubtopicTitle) {
      const { data: fallbackSubtopic } = await adminDb
        .from('subtopics')
        .select('id, title')
        .eq('course_id', courseId)
        .ilike('title', trimmedSubtopicTitle)
        .maybeSingle();
      if (fallbackSubtopic) return fallbackSubtopic;
    }

    if (trimmedModuleTitle) {
      const { data: allSubtopics } = await adminDb
        .from('subtopics')
        .select('id, title, content')
        .eq('course_id', courseId);

      if (allSubtopics) {
        const normalizedTarget = trimmedModuleTitle.toLowerCase();
        for (const sub of allSubtopics as Array<{ id: string; title: string; content: string | null }>) {
          try {
            const parsed = sub?.content ? JSON.parse(sub.content) : null;
            const parsedModule = typeof parsed?.module === 'string' ? parsed.module.trim().toLowerCase() : '';
            if (parsedModule && parsedModule === normalizedTarget) {
              return sub;
            }
          } catch {
            // Skip unparseable entries
          }
        }
      }
    }
  } catch (lookupError) {
    console.error('[quiz-sync] Subtopic lookup failed', {
      error: lookupError,
      courseId,
      moduleTitle,
      subtopicTitle,
    });
  }

  return null;
}

function buildQuizInserts(
  quizItems: QuizItem[],
  courseId: string,
  resolvedSubtopicId: string,
  subtopicLabel: string,
): Array<Record<string, unknown>> {
  return quizItems
    .map((q, index) => {
      if (!q || typeof q !== 'object') return null;

      const rawQuestion =
        typeof q.question === 'string' && q.question.trim().length > 0
          ? q.question.trim()
          : `Quiz ${index + 1}: Pertanyaan opsional`;

      const optionsArray = Array.isArray(q.options)
        ? q.options
            .map((opt: unknown) => (typeof opt === 'string' ? opt.trim() : `${opt}`))
            .filter(Boolean)
        : [];

      if (optionsArray.length < 4) {
        while (optionsArray.length < 4) {
          optionsArray.push(`Opsi ${optionsArray.length + 1}`);
        }
      } else if (optionsArray.length > 4) {
        optionsArray.length = 4;
      }

      const candidateIndex = typeof q.correctIndex === 'number' ? q.correctIndex : 0;
      const boundedIndex =
        candidateIndex >= 0 && candidateIndex < optionsArray.length ? candidateIndex : 0;
      const correctAnswer = optionsArray[boundedIndex] ?? optionsArray[0] ?? '';

      return {
        course_id: courseId,
        subtopic_id: resolvedSubtopicId,
        subtopic_label: subtopicLabel,
        question: rawQuestion,
        options: optionsArray,
        correct_answer: correctAnswer,
        explanation: correctAnswer ? `The correct answer is: ${correctAnswer}` : null,
        created_at: new Date().toISOString(),
      };
    })
    .filter((item): item is NonNullable<typeof item> => item !== null);
}

/**
 * Insert new quiz questions for a subtopic and delete old ones, UNLESS
 * the old ones are still referenced by `quiz_submissions` rows — in that
 * case, old rows are preserved for audit/admin display.
 */
export async function syncQuizQuestions(params: SyncQuizParams): Promise<SyncQuizResult | null> {
  const { adminDb, courseId, moduleTitle, subtopicTitle, quizItems, subtopicId, subtopicData } = params;

  if (!adminDb || !courseId || !Array.isArray(quizItems) || quizItems.length === 0) {
    return null;
  }

  const resolvedSubtopic = await resolveSubtopic(adminDb, courseId, moduleTitle, subtopicTitle, subtopicData);
  const resolvedSubtopicId = subtopicId ?? resolvedSubtopic?.id;
  const subtopicLabel = normalizeSubtopicLabel(subtopicTitle);

  if (!resolvedSubtopicId) {
    console.error('[quiz-sync] Unable to resolve subtopic for quiz persistence', {
      courseId,
      moduleTitle,
      subtopicTitle,
      subtopicIdProvided: !!subtopicId,
      resolveSubtopicReturned: !!resolvedSubtopic,
    });
    return null;
  }

  // The subtopics table is keyed per MODULE — without a non-empty label,
  // sibling subtopics inside the same module collide on the same
  // (subtopic_id, '') scope key, so the subsequent insert/delete logic
  // would clobber quiz rows across siblings. Refuse to proceed rather
  // than risk data loss or cross-subtopic leakage.
  if (!subtopicLabel) {
    console.error('[quiz-sync] Missing subtopic label — refusing to sync to avoid sibling collision', {
      courseId,
      moduleTitle,
      subtopicTitle,
      resolvedSubtopicId,
    });
    return null;
  }

  const quizInserts = buildQuizInserts(quizItems, courseId, resolvedSubtopicId, subtopicLabel);
  if (quizInserts.length === 0) {
    console.error('[quiz-sync] Sync skipped — sanitized quiz data is empty', {
      quizItemsCount: Array.isArray(quizItems) ? quizItems.length : 'not-array',
      courseId,
      subtopicId: resolvedSubtopicId,
      subtopicLabel,
    });
    return { resolvedSubtopicId, subtopicLabel, insertedCount: 0, skippedDelete: true };
  }

  // Check if any quiz_submissions reference existing quiz rows for THIS
  // specific (subtopic_id, subtopic_label) pair. Scoping by subtopic_label is
  // critical: sibling subtopics inside the same module share subtopic_id, so
  // an un-scoped check would incorrectly preserve OR delete their rows.
  let hasExistingSubmissions = false;
  try {
    const oldQuizQuery = adminDb
      .from('quiz')
      .select('id')
      .eq('course_id', courseId)
      .eq('subtopic_id', resolvedSubtopicId);
    const { data: oldQuizIds } = subtopicLabel
      ? await oldQuizQuery.eq('subtopic_label', subtopicLabel)
      : await oldQuizQuery.is('subtopic_label', null);

    if (Array.isArray(oldQuizIds) && oldQuizIds.length > 0) {
      const ids = (oldQuizIds as Array<{ id: string }>).map((q) => q.id);
      const { data: refSubs } = await adminDb
        .from('quiz_submissions')
        .select('id')
        .in('quiz_id', ids)
        .limit(1);
      hasExistingSubmissions = Array.isArray(refSubs) && refSubs.length > 0;
    }
  } catch (checkError) {
    console.error('[quiz-sync] Failed to probe submission references, defaulting to preserve-history', {
      error: checkError,
      courseId,
      subtopicId: resolvedSubtopicId,
      subtopicLabel,
    });
    hasExistingSubmissions = true;
  }

  const syncMarkedAt = new Date().toISOString();
  const { error: insertError } = await adminDb.from('quiz').insert(quizInserts);

  if (insertError) {
    console.error('[quiz-sync] Insert failed — leaving old quiz intact', {
      insertError,
      insertCount: quizInserts.length,
      courseId,
      subtopicId: resolvedSubtopicId,
      subtopicLabel,
      samplePayload: quizInserts[0],
    });
    return { resolvedSubtopicId, subtopicLabel, insertedCount: 0, skippedDelete: true };
  }

  if (hasExistingSubmissions) {
    console.log('[quiz-sync] Preserved old quiz rows (existing submissions reference them)', {
      courseId,
      subtopicId: resolvedSubtopicId,
      subtopicLabel,
    });
    return { resolvedSubtopicId, subtopicLabel, insertedCount: quizInserts.length, skippedDelete: true };
  }

  // Scoped cleanup: only remove stale rows that belong to THIS subtopic_label.
  // Rows from sibling subtopics (same module, different label) stay intact.
  try {
    const deleteQuery = adminDb
      .from('quiz')
      .eq('course_id', courseId)
      .eq('subtopic_id', resolvedSubtopicId)
      .lt('created_at', syncMarkedAt);
    const { error: deleteError } = subtopicLabel
      ? await deleteQuery.eq('subtopic_label', subtopicLabel).delete()
      : await deleteQuery.is('subtopic_label', null).delete();

    if (deleteError) {
      console.warn('[quiz-sync] Failed to clean old quiz entries after insert', deleteError);
    }
  } catch (cleanupError) {
    console.warn('[quiz-sync] Cleanup threw unexpectedly', cleanupError);
  }

  console.log('[quiz-sync] Quiz questions synced to database', {
    courseId,
    subtopicId: resolvedSubtopicId,
    subtopicLabel,
    count: quizInserts.length,
  });

  return { resolvedSubtopicId, subtopicLabel, insertedCount: quizInserts.length, skippedDelete: false };
}

/**
 * Append new quiz questions WITHOUT deleting old ones. Used by the
 * Reshuffle feature. Old `quiz` rows remain referenced by historical
 * `quiz_submissions` so the admin display stays intact.
 */
export async function appendNewQuizQuestions(
  params: SyncQuizParams,
): Promise<SyncQuizResult | null> {
  const { adminDb, courseId, moduleTitle, subtopicTitle, quizItems, subtopicId, subtopicData } = params;

  if (!adminDb || !courseId || !Array.isArray(quizItems) || quizItems.length === 0) {
    return null;
  }

  const resolvedSubtopic = await resolveSubtopic(adminDb, courseId, moduleTitle, subtopicTitle, subtopicData);
  const resolvedSubtopicId = subtopicId ?? resolvedSubtopic?.id;
  const subtopicLabel = normalizeSubtopicLabel(subtopicTitle);

  if (!resolvedSubtopicId) {
    console.warn('[quiz-sync] Unable to resolve subtopic for append', {
      courseId,
      moduleTitle,
      subtopicTitle,
    });
    return null;
  }

  const quizInserts = buildQuizInserts(quizItems, courseId, resolvedSubtopicId, subtopicLabel);
  if (quizInserts.length === 0) {
    return { resolvedSubtopicId, subtopicLabel, insertedCount: 0, skippedDelete: true };
  }

  const { error: insertError } = await adminDb.from('quiz').insert(quizInserts);
  if (insertError) {
    console.warn('[quiz-sync] Append insert failed', insertError);
    return { resolvedSubtopicId, subtopicLabel, insertedCount: 0, skippedDelete: true };
  }

  console.log('[quiz-sync] New quiz questions appended (history preserved)', {
    courseId,
    subtopicId: resolvedSubtopicId,
    subtopicLabel,
    count: quizInserts.length,
  });

  return { resolvedSubtopicId, subtopicLabel, insertedCount: quizInserts.length, skippedDelete: true };
}
