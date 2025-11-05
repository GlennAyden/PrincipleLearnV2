// src/components/NextSubtopics/NextSubtopics.tsx
'use client';

import React from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import styles from './NextSubtopics.module.scss';

export interface NextSubtopicsProps {
  /** List subtopic titles or objects with title */
  items?: Array<string | { title: string }>;
  /** Index modul saat ini */
  moduleIndex: number;
  /** ID modul (subtopic record) untuk query params diskusi */
  moduleId?: string;
  /** Judul modul untuk konteks navigasi diskusi */
  moduleTitle?: string;
}

export default function NextSubtopics({
  items = [],
  moduleIndex,
  moduleId,
  moduleTitle,
}: NextSubtopicsProps) {
  const router = useRouter();
  const { courseId } = useParams<{ courseId: string }>();
  const searchParams = useSearchParams();
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
      <h3 className={styles.heading}>Next Subtopics</h3>
      <ul className={styles.list}>
        {nextItems.map(({ idx, moduleIdx, title, isDiscussion }) => (
          <li key={`${moduleIdx}-${idx}`} className={styles.item}>
            <button
              className={styles.button}
              onClick={() => {
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
              {moduleIdx !== moduleIndex && (
                <span className={styles.moduleLabel}>
                  Module {moduleIdx + 1}:
                </span>
              )}
              {title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
