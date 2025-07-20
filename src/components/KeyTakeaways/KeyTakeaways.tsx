// src/components/KeyTakeaways/KeyTakeaways.tsx
import React from 'react';
import styles from './KeyTakeaways.module.scss';

export interface KeyTakeawaysProps {
  items: string[];
}

export default function KeyTakeaways({ items }: KeyTakeawaysProps) {
  return (
    <section className={styles.takeawaysSection}>
      <h3 className={styles.takeawaysHeader}>Key Takeaways</h3>
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
