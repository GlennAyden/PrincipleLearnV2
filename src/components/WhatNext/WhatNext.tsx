// src/components/WhatNext/WhatNext.tsx
import React from 'react';
import styles from './WhatNext.module.scss';

export interface WhatNextProps {
  /** Satu kalimat ringkasan apa yang selanjutnya */
  summary: string;
  /** Satu kalimat penyemangat */
  encouragement: string;
}

export default function WhatNext({ summary, encouragement }: WhatNextProps) {
  return (
    <section className={styles.whatNextSection}>
      <h3 className={styles.header}>What next?</h3>
      <p className={styles.summary}>{summary}</p>
      <p className={styles.encouragement}>{encouragement}</p>
    </section>
  );
}
