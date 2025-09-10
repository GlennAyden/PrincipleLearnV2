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
  /** Course outline untuk mendapatkan module berikutnya */
  courseOutline?: Array<{ module: string; subtopics: Array<string | { title: string }> }>;
}

export default function NextSubtopics({
  items = [],
  moduleIndex,
  courseOutline = [],
}: NextSubtopicsProps) {
  const router = useRouter();
  const { courseId } = useParams<{ courseId: string }>();
  const searchParams = useSearchParams();
  // Ambil subtopicIndex dari query param "subIdx"
  const raw = searchParams.get('subIdx');
  const currentSubIdx = raw !== null && !isNaN(Number(raw)) ? Number(raw) : 0;

  // Build next subtopics: remaining in current module + first few from next module
  const nextItems: Array<{ idx: number; moduleIdx: number; title: string }> = [];

  // 1. Add remaining subtopics from current module
  if (items.length > 0) {
    for (let i = currentSubIdx + 1; i < items.length; i++) {
      const item = items[i];
      nextItems.push({
        idx: i,
        moduleIdx: moduleIndex,
        title: typeof item === 'string' ? item : item.title,
      });
    }
  }

  // 2. Add first few subtopics from next module (if exists)
  const nextModule = courseOutline[moduleIndex + 1];
  if (nextModule && nextModule.subtopics.length > 0) {
    // Add up to 3 subtopics from next module
    const maxFromNextModule = Math.min(3, nextModule.subtopics.length);
    for (let i = 0; i < maxFromNextModule; i++) {
      const item = nextModule.subtopics[i];
      nextItems.push({
        idx: i,
        moduleIdx: moduleIndex + 1,
        title: typeof item === 'string' ? item : item.title,
      });
    }
  }

  if (!nextItems.length) {
    return (
      <div className={styles.wrapper}>
        <h3 className={styles.heading}>🎉 Selamat!</h3>
        <p className={styles.completionMessage}>
          Anda telah menyelesaikan semua materi dalam kursus ini!
        </p>
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.heading}>Next Subtopics</h3>
      <ul className={styles.list}>
        {nextItems.map(({ idx, moduleIdx, title }, listIndex) => (
          <li key={`${moduleIdx}-${idx}`} className={styles.item}>
            <button
              className={styles.button}
              onClick={() =>
                // Arahkan ke halaman pertama (pageIdx=0) subtopic yang dipilih,
                // sambil melewatkan moduleIndex dan subIdx sebagai query.
                router.push(
                  `/course/${courseId}/subtopic/${moduleIdx}/0?module=${moduleIdx}&subIdx=${idx}`
                )
              }
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
