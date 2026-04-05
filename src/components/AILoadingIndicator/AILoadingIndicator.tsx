'use client';

import React, { useState, useEffect } from 'react';
import styles from './AILoadingIndicator.module.scss';

interface AILoadingIndicatorProps {
  /** Custom sequence of messages (defaults to generic AI messages) */
  messages?: string[];
  /** Milliseconds between message transitions (default: 3000) */
  interval?: number;
}

const DEFAULT_MESSAGES = [
  'Sedang berpikir...',
  'Menyusun jawaban...',
  'Hampir selesai...',
];

export default function AILoadingIndicator({
  messages = DEFAULT_MESSAGES,
  interval = 3000,
}: AILoadingIndicatorProps) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    // Cycle through messages, stop at the last one
    if (index >= messages.length - 1) return;

    const timer = setTimeout(() => {
      setIndex((prev) => prev + 1);
    }, interval);

    return () => clearTimeout(timer);
  }, [index, interval, messages.length]);

  // Reset index when messages change (new loading session)
  useEffect(() => {
    setIndex(0);
  }, [messages]);

  return (
    <div className={styles.container}>
      <div className={styles.dots}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
      <span className={styles.message}>{messages[index]}</span>
    </div>
  );
}
