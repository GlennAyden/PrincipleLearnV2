// src/components/WhatNext/WhatNext.tsx
'use client';
import React from 'react';
import styles from './WhatNext.module.scss';
import { useLocale } from '@/context/LocaleContext';

export interface WhatNextProps {
  /** Satu kalimat ringkasan apa yang selanjutnya */
  summary: string;
  /** Satu kalimat penyemangat */
  encouragement: string;
}

export default function WhatNext({ summary, encouragement }: WhatNextProps) {
  const { t } = useLocale();
  return (
    <section className={styles.whatNextSection}>
      <h3 className={styles.header}>{t('what_next_header')}</h3>
      <p className={styles.summary}>{summary}</p>
      <p className={styles.encouragement}>{encouragement}</p>
    </section>
  );
}
