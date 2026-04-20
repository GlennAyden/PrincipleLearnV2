'use client';

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './HelpDrawer.module.scss';
import { SUBTOPIC_HELP_FEATURES, type HelpFeature } from './featureData';

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
  features?: HelpFeature[];
}

export default function HelpDrawer({
  open,
  onClose,
  features = SUBTOPIC_HELP_FEATURES,
}: HelpDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!mounted) return null;

  function handleShowTarget(selector?: string) {
    if (!selector) return;
    const el = document.querySelector(selector);
    if (!el) return;
    onClose();
    // Let the drawer collapse before we scroll.
    window.setTimeout(() => {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
      (el as HTMLElement).classList.add(styles.pulseTarget);
      window.setTimeout(() => {
        (el as HTMLElement).classList.remove(styles.pulseTarget);
      }, 2200);
    }, 200);
  }

  return createPortal(
    <>
      {/* Backdrop — clickable, closes drawer */}
      <button
        type="button"
        aria-label="Tutup panduan"
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ''}`}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />

      <aside
        className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Panduan fitur"
        aria-hidden={!open}
      >
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>Bantuan</div>
            <h2 className={styles.title}>Fitur di halaman ini</h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Tutup"
          >
            ✕
          </button>
        </header>

        <p className={styles.intro}>
          Setiap fitur di subtopic punya peran berbeda. Klik kartu untuk detail,
          atau tekan <strong>Tunjukkan</strong> supaya kami arahkan ke element
          yang dimaksud.
        </p>

        <div className={styles.list}>
          {features.map((f) => {
            const isOpen = expandedId === f.id;
            return (
              <div key={f.id} className={`${styles.card} ${isOpen ? styles.cardOpen : ''}`}>
                <button
                  type="button"
                  className={styles.cardHeader}
                  onClick={() => setExpandedId(isOpen ? null : f.id)}
                  aria-expanded={isOpen}
                >
                  <span className={styles.icon} aria-hidden="true">{f.icon}</span>
                  <span className={styles.cardTitle}>{f.title}</span>
                  <span className={`${styles.chevron} ${isOpen ? styles.chevronOpen : ''}`} aria-hidden="true">
                    ▾
                  </span>
                </button>
                {isOpen && (
                  <div className={styles.cardBody}>
                    <p className={styles.description}>{f.description}</p>
                    {f.targetSelector && (
                      <button
                        type="button"
                        className={styles.showBtn}
                        onClick={() => handleShowTarget(f.targetSelector)}
                      >
                        Tunjukkan di halaman →
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </aside>
    </>,
    document.body,
  );
}

interface HelpButtonProps {
  onClick: () => void;
  label?: string;
}

/** Floating question-mark button that opens the drawer. */
export function HelpButton({ onClick, label = 'Panduan fitur' }: HelpButtonProps) {
  return (
    <button
      type="button"
      className={styles.floatingBtn}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      <span aria-hidden="true">?</span>
    </button>
  );
}
