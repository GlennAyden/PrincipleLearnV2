// src/components/KeyTakeaways/KeyTakeaways.tsx
'use client';
import React from 'react';
import styles from './KeyTakeaways.module.scss';
import { useLocale } from '@/context/LocaleContext';

export interface KeyTakeawaysProps {
  items: string[];
}

export default function KeyTakeaways({ items }: KeyTakeawaysProps) {
  const { t } = useLocale();
  return (
    <section className={styles.takeawaysSection}>
      <h3 className={styles.takeawaysHeader}>{t('key_takeaways_header')}</h3>
      <ul className={styles.takeawaysList}>
        {items.map((item, idx) => (
          <li key={idx} className={styles.takeawayItem}>
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}
