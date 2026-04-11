// Path: src/app/request-course/step3/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRequestCourse } from '@/context/RequestCourseContext';
import { useAuth } from '@/hooks/useAuth';
import styles from './page.module.scss';

export default function RequestCourseStep3() {
  const router = useRouter();
  const { answers, setPartial } = useRequestCourse();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [problem, setProblem] = useState(answers.problem);
  const [assumption, setAssumption] = useState(answers.assumption);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  const handleGenerate = () => {
    if (!problem.trim() || !assumption.trim()) {
      setError('Mohon isi kedua kolom');
      return;
    }
    if (!user || !user.id || !user.email) {
      setError('Kamu harus masuk untuk membuat kursus');
      return;
    }
    setPartial({ problem, assumption });
    router.push('/request-course/generating');
  };

  if (authLoading) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.loadingSpinner} />
        <p>Memuat...</p>
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <Link href="/request-course/step2" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Kembali
      </Link>

      <div className={styles.card}>
        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          <div className={styles.stepDot} data-done="true">✓</div>
          <div className={styles.stepLine} data-done="true" />
          <div className={styles.stepDot} data-done="true">✓</div>
          <div className={styles.stepLine} data-done="true" />
          <div className={styles.stepDot} data-active="true">3</div>
        </div>

        <div className={styles.cardHeader}>
          <div className={styles.headerIcon}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <circle cx="14" cy="14" r="10" stroke="currentColor" strokeWidth="1.5" />
              <path d="M14 10V15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M11 13L14 15L17 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <circle cx="14" cy="8" r="1" fill="currentColor" />
            </svg>
          </div>
          <h1 className={styles.title}>Konteks & Asumsi</h1>
          <p className={styles.subtitle}>Bantu AI memahami kebutuhanmu di dunia nyata</p>
        </div>

        {error && (
          <div className={styles.error}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
            </svg>
            {error}
          </div>
        )}

        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M2 12.5L6 8.5L9 11.5L14 5.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M10 5.5H14V9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Masalah dunia nyata
            </label>
            <textarea
              className={styles.textarea}
              placeholder="Sebutkan satu masalah nyata yang ingin kamu selesaikan dengan mempelajari ini..."
              value={problem}
              onChange={(e) => setProblem(e.currentTarget.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L10 6H14L11 9L12 13L8 10.5L4 13L5 9L2 6H6L8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              Asumsi awal
            </label>
            <textarea
              className={styles.textarea}
              placeholder="Apa asumsi awalmu tentang materi ini sebelum kamu mulai belajar?"
              value={assumption}
              onChange={(e) => setAssumption(e.currentTarget.value)}
            />
          </div>

          <button className={styles.submitBtn} onClick={handleGenerate}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L11 7H16L12 10L13.5 15L9 12L4.5 15L6 10L2 7H7L9 2Z" stroke="currentColor" strokeWidth="1.3" fill="currentColor" fillOpacity="0.15" strokeLinejoin="round" />
            </svg>
            Buat Kursus
          </button>
        </div>
      </div>
    </div>
  );
}
