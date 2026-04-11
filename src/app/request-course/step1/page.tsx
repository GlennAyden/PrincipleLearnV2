// Path: src/app/request-course/step1/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRequestCourse } from '@/context/RequestCourseContext';
import { useAuth } from '@/hooks/useAuth';
import styles from './page.module.scss';

export default function Step1() {
  const router = useRouter();
  const { answers, setPartial } = useRequestCourse();
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const [topic, setTopic] = useState(answers.topic);
  const [goal, setGoal]   = useState(answers.goal);
  const [err, setErr]     = useState('');

  // Auth guard: redirect to login if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  const continueToStep2 = () => {
    if (!topic.trim() || !goal.trim()) {
      setErr('Mohon isi kedua kolom');
      return;
    }
    setPartial({ topic, goal });
    router.push('/request-course/step2');
  };

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <Link href="/dashboard" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Dasbor
      </Link>

      <div className={styles.card}>
        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          <div className={styles.stepDot} data-active="true">1</div>
          <div className={styles.stepLine} />
          <div className={styles.stepDot}>2</div>
          <div className={styles.stepLine} />
          <div className={styles.stepDot}>3</div>
        </div>

        <div className={styles.cardHeader}>
          <div className={styles.headerIcon}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M4 6C4 4.9 4.9 4 6 4H12C13.1 4 14 4.9 14 6V22C14 23.1 13.1 24 12 24H6C4.9 24 4 23.1 4 22V6Z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M14 6C14 4.9 14.9 4 16 4H22C23.1 4 24 4.9 24 6V14C24 15.1 23.1 16 22 16H16C14.9 16 14 15.1 14 14V6Z" stroke="currentColor" strokeWidth="1.5" />
              <path d="M7 9H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M7 13H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </div>
          <h1 className={styles.title}>Apa yang ingin kamu pelajari?</h1>
          <p className={styles.subtitle}>Beritahu kami topik dan tujuan belajarmu</p>
        </div>

        {err && (
          <div className={styles.error}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
            </svg>
            {err}
          </div>
        )}

        <div className={styles.form}>
          <div className={styles.field}>
            <label className={styles.label}>Topik</label>
            <div className={styles.inputWrap}>
              <div className={styles.inputIcon}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M3 3.75C3 2.925 3.675 2.25 4.5 2.25H9L10.5 3.75H13.5C14.325 3.75 15 4.425 15 5.25V13.5C15 14.325 14.325 15 13.5 15H4.5C3.675 15 3 14.325 3 13.5V3.75Z" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <input
                className={styles.input}
                type="text"
                placeholder="contoh: Machine Learning, Pengembangan Web, Data Science..."
                value={topic}
                onChange={e => setTopic(e.target.value)}
              />
            </div>
          </div>

          <div className={styles.field}>
            <label className={styles.label}>Tujuan Belajar</label>
            <div className={styles.inputWrap}>
              <div className={styles.textareaIcon}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.3" />
                  <circle cx="9" cy="9" r="1" fill="currentColor" />
                </svg>
              </div>
              <textarea
                className={styles.textarea}
                placeholder="Apa yang ingin kamu capai dengan mempelajari topik ini?"
                value={goal}
                onChange={e => setGoal(e.target.value)}
              />
            </div>
          </div>

          <button className={styles.submitBtn} onClick={continueToStep2}>
            Lanjut
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
