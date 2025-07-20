// src/app/request-course/result/page.tsx
'use client';

import { useRouter } from 'next/navigation';
import styles from './page.module.scss';

export default function CourseReadyPage() {
  const router = useRouter();

  return (
    <div className={styles.card}>
      <h2 className={styles.message}>
        Embrace smarter learning to ignite your curiosity, think deeper to forge real understanding, and you’ll master every challenge with confidence.
      </h2>
      <button
        className={styles.button}
        onClick={() => router.push('/dashboard')}
      >
        View Course
      </button>
    </div>
  );
}
