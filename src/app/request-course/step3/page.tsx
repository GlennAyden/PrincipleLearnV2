// Path: src/app/request-course/step3/page.tsx
'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRequestCourse } from '@/context/RequestCourseContext';
import { useAuth } from '@/hooks/useAuth';
import { useLocale } from '@/context/LocaleContext';
import styles from './page.module.scss';

export default function RequestCourseStep3() {
  const router = useRouter();
  const { answers, setPartial } = useRequestCourse();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const { t } = useLocale();

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
      setError(t('request_course_step3_fill_both'));
      return;
    }
    if (!user || !user.id || !user.email) {
      setError(t('request_course_step3_must_login'));
      return;
    }
    // Guard against context loss (e.g. sessionStorage cleared, direct nav).
    // Without these the server returns a 400 that surfaces as a generic
    // error on the loading page; redirect user to step1 instead.
    const validLevels = ['Beginner', 'Intermediate', 'Advanced'];
    if (!answers.topic?.trim() || !answers.goal?.trim() || !validLevels.includes(answers.level)) {
      setError(t('request_course_step3_incomplete'));
      setTimeout(() => router.replace('/request-course/step1'), 1200);
      return;
    }
    setPartial({ problem, assumption });
    router.push('/request-course/generating');
  };

  if (authLoading) {
    return (
      <div className={styles.loadingPage}>
        <div className={styles.loadingSpinner} />
        <p>{t('request_course_step3_loading')}</p>
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
        {t('request_course_step3_back')}
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
          <h1 className={styles.title}>{t('request_course_step3_title')}</h1>
          <p className={styles.subtitle}>{t('request_course_step3_subtitle')}</p>
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
              {t('request_course_step3_problem_label')}
            </label>
            <textarea
              className={styles.textarea}
              placeholder={t('request_course_step3_problem_placeholder')}
              value={problem}
              onChange={(e) => setProblem(e.currentTarget.value)}
            />
          </div>

          <div className={styles.field}>
            <label className={styles.label}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L10 6H14L11 9L12 13L8 10.5L4 13L5 9L2 6H6L8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
              </svg>
              {t('request_course_step3_assumption_label')}
            </label>
            <textarea
              className={styles.textarea}
              placeholder={t('request_course_step3_assumption_placeholder')}
              value={assumption}
              onChange={(e) => setAssumption(e.currentTarget.value)}
            />
          </div>

          <button className={styles.submitBtn} onClick={handleGenerate}>
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2L11 7H16L12 10L13.5 15L9 12L4.5 15L6 10L2 7H7L9 2Z" stroke="currentColor" strokeWidth="1.3" fill="currentColor" fillOpacity="0.15" strokeLinejoin="round" />
            </svg>
            {t('request_course_step3_generate')}
          </button>
        </div>
      </div>
    </div>
  );
}
