// src/components/AskQuestion/CitationCard.tsx
'use client';

import React from 'react';
import styles from './CitationCard.module.scss';
import { useLocale } from '@/context/LocaleContext';

interface CitationCardProps {
  chunkId: string;
  index: number;
  onClick: (chunkId: string) => void;
}

export default function CitationCard({ chunkId, index, onClick }: CitationCardProps) {
  const { t } = useLocale();

  const handleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick(chunkId);
    }
  };

  return (
    <button
      type="button"
      className={styles.card}
      onClick={() => onClick(chunkId)}
      onKeyDown={handleKeyDown}
      aria-label={`${t('citation_section_label')} ${index + 1}`}
      title={`${t('citation_section_label')} ${index + 1}`}
    >
      {/* Document icon (SVG) */}
      <span className={styles.icon} aria-hidden="true">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      </span>
      <span className={styles.label}>
        {t('citation_section_label')}&nbsp;{index + 1}
      </span>
    </button>
  );
}
