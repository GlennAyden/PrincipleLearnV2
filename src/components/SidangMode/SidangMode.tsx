'use client';

import { useEffect, useState } from 'react';
import { useLocale } from '@/context/LocaleContext';
import styles from './SidangMode.module.scss';

const LS_KEY = 'sidang_mode';
const BODY_CLASS = 'sidang-mode';

export default function SidangMode() {
  const { t } = useLocale();
  const [enabled, setEnabled] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Read persisted state on mount
  useEffect(() => {
    const stored = localStorage.getItem(LS_KEY);
    const active = stored === 'true';
    setEnabled(active);
    if (active) document.body.classList.add(BODY_CLASS);
    setMounted(true);
  }, []);

  const toggle = () => {
    setEnabled((prev) => {
      const next = !prev;
      localStorage.setItem(LS_KEY, String(next));
      if (next) {
        document.body.classList.add(BODY_CLASS);
      } else {
        document.body.classList.remove(BODY_CLASS);
      }
      return next;
    });
  };

  // Avoid hydration mismatch — render nothing on server
  if (!mounted) return null;

  return (
    <div className={styles.wrapper}>
      <span className={styles.label}>{t('sidang_mode_label')}</span>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? t('sidang_mode_off_aria') : t('sidang_mode_on_aria')}
        className={`${styles.track} ${enabled ? styles.trackOn : ''}`}
        onClick={toggle}
      >
        <span className={`${styles.thumb} ${enabled ? styles.thumbOn : ''}`} />
      </button>
    </div>
  );
}
