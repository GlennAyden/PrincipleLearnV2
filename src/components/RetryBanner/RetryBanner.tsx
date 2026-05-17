'use client';
// src/components/RetryBanner/RetryBanner.tsx
//
// A4 — Displays a yellow warning banner when some leaf_subtopics for a course
// have generation_status='pending_retry' or 'failed'.
// Clicking "Coba Lagi" calls POST /api/courses/[id]/retry-failed and polls
// until done.

import { useState, useEffect } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useLocale } from '@/context/LocaleContext';
import styles from './RetryBanner.module.scss';

interface RetryBannerProps {
  courseId: string;
}

interface FailedLeafSummary {
  count: number;
}

export default function RetryBanner({ courseId }: RetryBannerProps) {
  const { t } = useLocale();

  const [summary, setSummary] = useState<FailedLeafSummary | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [feedback, setFeedback] = useState<'idle' | 'success' | 'error'>('idle');
  const [dismissed, setDismissed] = useState(false);

  // Check for failed leaves on mount
  useEffect(() => {
    let cancelled = false;
    async function checkFailed() {
      try {
        const res = await apiFetch(`/api/courses/${courseId}/failed-leaves`);
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled && data.count > 0) {
          setSummary({ count: data.count });
        }
      } catch {
        // Silently ignore — banner is non-critical UX
      }
    }
    checkFailed();
    return () => { cancelled = true; };
  }, [courseId]);

  const handleRetry = async () => {
    setIsRetrying(true);
    setFeedback('idle');
    try {
      const res = await apiFetch(`/api/courses/${courseId}/retry-failed`, {
        method: 'POST',
      });
      if (res.ok) {
        setFeedback('success');
        setSummary(null);
      } else {
        setFeedback('error');
      }
    } catch {
      setFeedback('error');
    } finally {
      setIsRetrying(false);
    }
  };

  if (dismissed || summary === null) return null;

  return (
    <div className={styles.banner} role="alert">
      <div className={styles.left}>
        <svg className={styles.icon} width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M9 2L16.5 15H1.5L9 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
          <path d="M9 7V10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          <circle cx="9" cy="13" r="0.75" fill="currentColor"/>
        </svg>
        <span>
          <strong>{summary.count}</strong> {t('course_retry_banner_message')}
          {feedback === 'success' && (
            <span className={styles.feedbackSuccess}> {t('course_retry_banner_success')}</span>
          )}
          {feedback === 'error' && (
            <span className={styles.feedbackError}> {t('course_retry_banner_error')}</span>
          )}
        </span>
      </div>
      <div className={styles.right}>
        {feedback !== 'success' && (
          <button
            className={styles.retryBtn}
            onClick={handleRetry}
            disabled={isRetrying}
          >
            {isRetrying ? (
              <>
                <span className={styles.spinner} />
                {t('course_retry_banner_retrying')}
              </>
            ) : t('course_retry_banner_cta')}
          </button>
        )}
        <button
          className={styles.dismissBtn}
          onClick={() => setDismissed(true)}
          aria-label="Tutup"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M3 3L11 11M11 3L3 11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
      </div>
    </div>
  );
}
