'use client';

import React, { useState, useEffect, useMemo } from 'react';
import styles from './AILoadingIndicator.module.scss';
import { useLocale } from '@/context/LocaleContext';
import type { DictKey } from '@/lib/i18n/dict';

interface AILoadingIndicatorProps {
  /** Custom sequence of messages (defaults to generic AI messages) */
  messages?: string[];
  /** Milliseconds between message transitions (default: 3000) */
  interval?: number;
}

function buildDefaultMessages(t: (key: DictKey) => string) {
  return [
    t('ai_loading_thinking'),
    t('ai_loading_drafting'),
    t('ai_loading_almost'),
  ];
}

export default function AILoadingIndicator({
  messages,
  interval = 3000,
}: AILoadingIndicatorProps) {
  const { t } = useLocale();
  const defaultMessages = useMemo(() => buildDefaultMessages(t), [t]);
  const resolvedMessages = messages ?? defaultMessages;
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Cycle through messages, stop at the last one
    if (index >= resolvedMessages.length - 1) return;

    const timer = setTimeout(() => {
      setIndex((prev) => prev + 1);
    }, interval);

    return () => clearTimeout(timer);
  }, [index, interval, resolvedMessages.length]);

  // Reset index when messages change (new loading session)
  useEffect(() => {
    setIndex(0);
  }, [resolvedMessages]);

  return (
    <div className={styles.container}>
      <div className={styles.dots}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
      <span className={styles.message}>{resolvedMessages[index]}</span>
    </div>
  );
}
