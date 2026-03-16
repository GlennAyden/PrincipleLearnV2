// src/components/ReasoningNote/ReasoningNote.tsx
'use client';
import React, { useState } from 'react';
import styles from './ReasoningNote.module.scss';

export interface ReasoningNoteProps {
  /** Current value of the reasoning note */
  value: string;
  /** Callback when user types */
  onChange: (value: string) => void;
  /** Custom label text */
  label?: string;
  /** Custom placeholder text */
  placeholder?: string;
  /** Whether the field is disabled */
  disabled?: boolean;
  /** Whether to start collapsed */
  defaultCollapsed?: boolean;
}

export default function ReasoningNote({
  value,
  onChange,
  label = 'Catatan Penalaran',
  placeholder = 'Tuliskan alasan Anda memilih langkah/jawaban ini...',
  disabled = false,
  defaultCollapsed = true,
}: ReasoningNoteProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);

  return (
    <div className={styles.reasoningNote}>
      <button
        type="button"
        className={styles.toggleButton}
        onClick={() => setIsCollapsed(!isCollapsed)}
        aria-expanded={!isCollapsed}
      >
        <div className={styles.toggleLeft}>
          <svg
            className={`${styles.toggleIcon} ${isCollapsed ? '' : styles.expanded}`}
            xmlns="http://www.w3.org/2000/svg"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
          <span className={styles.labelIcon}>💭</span>
          <span className={styles.label}>{label}</span>
        </div>
        {value.trim() && (
          <span className={styles.filledBadge}>Terisi ✓</span>
        )}
      </button>

      {!isCollapsed && (
        <div className={styles.contentArea}>
          <p className={styles.helperText}>
            Jelaskan <strong>mengapa</strong> Anda memilih langkah ini. Catatan ini membantu Anda dan pengajar memahami proses berpikir Anda.
          </p>
          <textarea
            className={styles.textarea}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            disabled={disabled}
            rows={3}
          />
        </div>
      )}
    </div>
  );
}
