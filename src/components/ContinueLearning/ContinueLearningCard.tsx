'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import { useLocale } from '@/context/LocaleContext';
import styles from './ContinueLearningCard.module.scss';

interface ContinueLearningData {
  courseId: string;
  courseName: string;
  subtopicId: string | null;
  lastLeafTitle: string | null;
  lastAccessedAt: string;
  continueUrl: string;
}

// Bilingual strings (not in global dict so we keep this component self-contained)
const TEXT = {
  id: {
    heading: 'Lanjutkan belajar',
    sub: 'Kamu belum menyelesaikan topik ini',
    btn: '▶ Lanjutkan',
  },
  en: {
    heading: 'Continue learning',
    sub: 'You have unfinished content here',
    btn: '▶ Continue',
  },
} as const;

export default function ContinueLearningCard() {
  const router = useRouter();
  const { locale } = useLocale();
  const [data, setData] = useState<ContinueLearningData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const fetchedRef = useRef(false);

  useEffect(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;

    apiFetch('/api/user/continue')
      .then((res) => res.json())
      .then((json: { data?: ContinueLearningData | null }) => {
        setData(json.data ?? null);
      })
      .catch(() => {
        // Silently hide the card on error — it's non-critical.
        setData(null);
      })
      .finally(() => setLoaded(true));
  }, []);

  // Wait for load; hide if no progress data.
  if (!loaded || !data) return null;

  const t = TEXT[locale === 'en' ? 'en' : 'id'];

  const handleContinue = () => {
    router.push(data.continueUrl);
  };

  // Friendly relative time label
  const relativeTime = formatRelativeTime(data.lastAccessedAt);

  return (
    <div className={styles.card} role="region" aria-label={t.heading}>
      {/* Background gradient layers */}
      <div className={styles.gradientBg} aria-hidden="true" />
      <div className={styles.patternOverlay} aria-hidden="true" />

      <div className={styles.content}>
        <div className={styles.textGroup}>
          <p className={styles.heading}>{t.heading}</p>
          <h2 className={styles.courseName}>{data.courseName}</h2>
          {data.lastLeafTitle && (
            <p className={styles.leafTitle}>
              <span className={styles.leafIcon}>
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 7h10M7 2l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              {data.lastLeafTitle}
            </p>
          )}
          <p className={styles.timeLabel}>{relativeTime}</p>
        </div>

        <button className={styles.continueBtn} onClick={handleContinue} aria-label={`${t.btn} — ${data.courseName}`}>
          <span>{t.btn}</span>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8h10M10 5l3 3-3 3" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const now = Date.now();
  const past = new Date(iso).getTime();
  const diffMs = now - past;
  const diffMin = Math.floor(diffMs / 60_000);
  const diffHr = Math.floor(diffMs / 3_600_000);
  const diffDay = Math.floor(diffMs / 86_400_000);

  if (diffMin < 2) return 'Baru saja';
  if (diffMin < 60) return `${diffMin} menit yang lalu`;
  if (diffHr < 24) return `${diffHr} jam yang lalu`;
  if (diffDay === 1) return 'Kemarin';
  if (diffDay < 7) return `${diffDay} hari yang lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}
