// src/components/NextSubtopics/NextSubtopics.tsx
'use client';

import React, { useState, useRef } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import styles from './NextSubtopics.module.scss';
import type { LearningProgressModule } from '@/hooks/useLearningProgress';

export interface NextSubtopicsProps {
  /** List subtopic titles or objects with title */
  items?: Array<string | { title: string; type?: string; isDiscussion?: boolean }>;
  /** Index modul saat ini */
  moduleIndex: number;
  /** ID modul (subtopic record) untuk query params diskusi */
  moduleId?: string;
  /** Judul modul untuk konteks navigasi diskusi */
  moduleTitle?: string;
  /** Server-side unlock status for this module. */
  progressModule?: LearningProgressModule | null;
}

export default function NextSubtopics({
  items = [],
  moduleIndex,
  moduleId,
  moduleTitle,
  progressModule,
}: NextSubtopicsProps) {
  const router = useRouter();
  const { courseId } = useParams<{ courseId: string }>();
  const searchParams = useSearchParams();
  const [activeLockedKey, setActiveLockedKey] = useState<string | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ambil subtopicIndex dari query param "subIdx"
  const raw = searchParams.get('subIdx');
  const currentSubIdx = raw !== null && !isNaN(Number(raw)) ? Number(raw) : 0;

  // Build next subtopics: remaining items in the current module only
  const nextItems: Array<{
    idx: number;
    moduleIdx: number;
    title: string;
    isDiscussion: boolean;
  }> = [];

  // Add remaining subtopics from current module
  if (items.length > 0) {
    for (let i = currentSubIdx + 1; i < items.length; i++) {
      const item = items[i];
      const title = typeof item === 'string' ? item : item.title;
      const isDiscussion =
        typeof item === 'object' &&
        (item?.type === 'discussion' || item?.isDiscussion === true || title?.toLowerCase().includes('diskusi penutup'));

      nextItems.push({
        idx: i,
        moduleIdx: moduleIndex,
        title,
        isDiscussion,
      });
    }
  }

  if (!nextItems.length) {
    return (
      <div className={styles.wrapper}>
        <h3 className={styles.heading}>🎉 Selamat!</h3>
        <p className={styles.completionMessage}>
          Anda telah menyelesaikan semua subtopik dalam modul ini!
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.heading}>Subtopik Selanjutnya</h3>
      <ul className={styles.list}>
        {nextItems.map(({ idx, moduleIdx, title, isDiscussion }) => {
          const status = isDiscussion
            ? progressModule?.discussion
            : progressModule?.subtopics.find((item) => item.subtopicIndex === idx);
          const locked = status ? !status.unlocked : false;
          const reason =
            status?.reason ??
            'Selesaikan langkah sebelumnya terlebih dahulu.';

          return (
            <li key={`${moduleIdx}-${idx}`} className={styles.item}>
              <button
                className={`${styles.button} ${locked ? styles.lockedButton : ''}`}
                aria-disabled={locked}
                onClick={() => {
                  if (locked) {
                    const key = `${moduleIdx}-${idx}`;
                    setActiveLockedKey(key);
                    if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current);
                    dismissTimerRef.current = setTimeout(() => setActiveLockedKey(null), 4500);
                    return;
                  }

                  if (isDiscussion) {
                    const params = new URLSearchParams({
                      module: String(moduleIdx),
                      subIdx: String(idx),
                      scope: 'module',
                    });
                    if (moduleId) {
                      params.set('moduleId', moduleId);
                    }
                    const label = moduleTitle || title;
                    if (label) {
                      params.set('title', label);
                    }
                    router.push(`/course/${courseId}/discussion/${moduleIdx}?${params.toString()}`);
                  } else {
                    router.push(
                      `/course/${courseId}/subtopic/${moduleIdx}/0?module=${moduleIdx}&subIdx=${idx}`
                    );
                  }
                }}
              >
                {isDiscussion && (
                  <span className={styles.moduleLabel}>
                    Diskusi Wajib:
                  </span>
                )}
                {moduleIdx !== moduleIndex && (
                  <span className={styles.moduleLabel}>
                    Modul {moduleIdx + 1}:
                  </span>
                )}
                {title}
              </button>
              {locked && activeLockedKey === `${moduleIdx}-${idx}` && (
                <div
                  className={styles.lockedWarning}
                  role="alert"
                  aria-live="polite"
                >
                  <span className={styles.lockedWarningIcon} aria-hidden="true">⚠️</span>
                  <span>{reason}</span>
                  <button
                    type="button"
                    className={styles.lockedWarningClose}
                    aria-label="Tutup pesan"
                    onClick={(e) => { e.stopPropagation(); setActiveLockedKey(null); }}
                  >✕</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
