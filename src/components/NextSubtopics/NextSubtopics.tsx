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
}

export default function NextSubtopics({
  items = [],
  moduleIndex,
}: NextSubtopicsProps) {
  const router = useRouter();
  const { courseId } = useParams<{ courseId: string }>();
  const searchParams = useSearchParams();
  // Ambil subtopicIndex dari query param "subIdx"
  const raw = searchParams.get('subIdx');
  const currentSubIdx = raw !== null && !isNaN(Number(raw)) ? Number(raw) : 0;

  if (!items.length) {
    return null;
  }

  // Build list subtopics dan exclude yang sedang aktif
  const nextItems = items
    .map((item, idx) => ({
      idx,
      title: typeof item === 'string' ? item : item.title,
    }))
    .filter(({ idx }) => idx !== currentSubIdx);

  if (!nextItems.length) {
    return null;
  }

  return (
    <div className={styles.wrapper}>
      <h3 className={styles.heading}>Next Subtopics</h3>
      <ul className={styles.list}>
        {nextItems.map(({ idx, title }) => (
          <li key={idx} className={styles.item}>
            <button
              className={styles.button}
              onClick={() =>
                // Arahkan ke halaman pertama (pageIdx=0) subtopic yang dipilih,
                // sambil melewatkan moduleIndex dan subIdx sebagai query.
                router.push(
                  `/course/${courseId}/subtopic/${moduleIndex}/0?module=${moduleIndex}&subIdx=${idx}`
                )
              }
            >
              {title}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
