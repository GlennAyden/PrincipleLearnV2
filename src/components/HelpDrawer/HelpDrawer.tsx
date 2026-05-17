'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './HelpDrawer.module.scss';
import {
  buildSubtopicHelpFeatures,
  filterFeaturesForMode,
  type HelpFeature,
} from './featureData';
import { useLocale } from '@/context/LocaleContext';

interface HelpDrawerProps {
  open: boolean;
  onClose: () => void;
  features?: HelpFeature[];
  /** Controls which research-only features are shown. Defaults to 'general'. */
  mode?: 'general' | 'research';
}

export default function HelpDrawer({
  open,
  onClose,
  features,
  mode = 'general',
}: HelpDrawerProps) {
  const { t } = useLocale();
  const allDefaultFeatures = useMemo(() => buildSubtopicHelpFeatures(t), [t]);
  const defaultFeatures = useMemo(
    () => filterFeaturesForMode(allDefaultFeatures, mode),
    [allDefaultFeatures, mode],
  );
  const resolvedFeatures = features ?? defaultFeatures;
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

  // Lock body scroll while the drawer is open so mobile users don't
  // accidentally scroll the page behind it when swiping on the backdrop.
  // We preserve whatever inline `overflow` was set before (rare, but could
  // be set by another modal in the component tree) and restore it on close.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, [open]);

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
        aria-label={t('help_drawer_backdrop_aria')}
        className={`${styles.backdrop} ${open ? styles.backdropOpen : ''}`}
        onClick={onClose}
        tabIndex={open ? 0 : -1}
      />

      <aside
        className={`${styles.drawer} ${open ? styles.drawerOpen : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={t('help_drawer_aria_label')}
        aria-hidden={!open}
      >
        <header className={styles.header}>
          <div>
            <div className={styles.eyebrow}>{t('help_drawer_eyebrow')}</div>
            <h2 className={styles.title}>{t('help_drawer_title')}</h2>
          </div>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t('help_drawer_close_aria')}
          >
            ✕
          </button>
        </header>

        <p className={styles.intro}>
          {t('help_drawer_intro_prefix')} <strong>{t('help_drawer_intro_action')}</strong>{' '}
          {t('help_drawer_intro_suffix')}
        </p>

        <div className={styles.list}>
          {resolvedFeatures.map((f) => {
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
                        {t('help_drawer_show_target')}
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
export function HelpButton({ onClick, label }: HelpButtonProps) {
  const { t } = useLocale();
  const resolvedLabel = label ?? t('help_drawer_button_label');
  return (
    <button
      type="button"
      className={styles.floatingBtn}
      onClick={onClick}
      aria-label={resolvedLabel}
      title={resolvedLabel}
    >
      <span aria-hidden="true">?</span>
    </button>
  );
}
