// src/components/AskQuestion/CitationModal.tsx
'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import styles from './CitationModal.module.scss';
import { useLocale } from '@/context/LocaleContext';
import { apiFetch } from '@/lib/api-client';

interface ChunkDetail {
  chunkId: string;
  materialId: string;
  materialTitle: string;
  materialAuthor: string | null;
  materialEdition: string | null;
  sourceUrl: string | null;
  pageNumber: number | null;
  chunkText: string;
  surroundingContext: {
    before: string | null;
    after: string | null;
  };
}

type ModalState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: ChunkDetail };

interface CitationModalProps {
  chunkId: string | null;
  onClose: () => void;
}

export default function CitationModal({ chunkId, onClose }: CitationModalProps) {
  const { t } = useLocale();
  const [modalState, setModalState] = React.useState<ModalState>({ status: 'loading' });
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const firstFocusableRef = useRef<HTMLElement | null>(null);

  // Load chunk detail whenever chunkId changes
  useEffect(() => {
    if (!chunkId) return;

    let cancelled = false;
    setModalState({ status: 'loading' });

    async function fetchChunk() {
      try {
        const res = await apiFetch(`/api/material-chunks/${chunkId}`);
        if (cancelled) return;

        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          const msg =
            (errJson && typeof errJson.error === 'string' && errJson.error) ||
            t('citation_modal_error');
          setModalState({ status: 'error', message: msg });
          return;
        }

        const json = await res.json();
        if (cancelled) return;
        setModalState({ status: 'ready', data: json.chunk as ChunkDetail });
      } catch {
        if (!cancelled) {
          setModalState({ status: 'error', message: t('citation_modal_error') });
        }
      }
    }

    fetchChunk();
    return () => {
      cancelled = true;
    };
  }, [chunkId, t]);

  // Focus trap + ESC
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      // Basic focus trap
      if (e.key === 'Tab' && overlayRef.current) {
        const focusables = overlayRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        const first = focusables[0];
        const last = focusables[focusables.length - 1];

        if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        } else if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      }
    },
    [onClose],
  );

  // Attach keyboard listener when modal is open
  useEffect(() => {
    if (!chunkId) return;
    document.addEventListener('keydown', handleKeyDown);
    // Set initial focus to close button after render
    const raf = requestAnimationFrame(() => {
      closeButtonRef.current?.focus();
      firstFocusableRef.current = closeButtonRef.current;
    });
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      cancelAnimationFrame(raf);
    };
  }, [chunkId, handleKeyDown]);

  // Prevent body scroll while modal is open
  useEffect(() => {
    if (!chunkId) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [chunkId]);

  if (!chunkId) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const renderContent = () => {
    if (modalState.status === 'loading') {
      return (
        <div className={styles.stateCenter} aria-live="polite">
          <span className={styles.spinner} aria-hidden="true" />
          <span>{t('citation_modal_loading')}</span>
        </div>
      );
    }

    if (modalState.status === 'error') {
      return (
        <div className={styles.stateCenter} role="alert">
          <span className={styles.errorIcon} aria-hidden="true">&#9888;</span>
          <span>{modalState.message}</span>
        </div>
      );
    }

    const { data } = modalState;

    return (
      <>
        {/* Header */}
        <div className={styles.header}>
          <div className={styles.headerMeta}>
            <h2 className={styles.materialTitle} id="citation-modal-title">
              {data.materialTitle}
            </h2>
            <div className={styles.metaRow}>
              {data.materialAuthor && (
                <span className={styles.metaBadge}>
                  <strong>{t('citation_modal_author_label')}:</strong>{' '}
                  {data.materialAuthor}
                </span>
              )}
              {data.materialEdition && (
                <span className={styles.metaBadge}>
                  <strong>{t('citation_modal_edition_label')}:</strong>{' '}
                  {data.materialEdition}
                </span>
              )}
              {data.pageNumber != null && (
                <span className={styles.pageBadge}>
                  {t('citation_card_page_prefix')} {data.pageNumber}
                </span>
              )}
            </div>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label={t('citation_modal_close')}
          >
            &#x2715;
          </button>
        </div>

        {/* Body */}
        <div className={styles.body}>
          {/* Context before */}
          {data.surroundingContext.before && (
            <div className={styles.contextBlock}>
              <span className={styles.contextLabel}>{t('citation_modal_context_before')}</span>
              <p className={styles.contextText}>{data.surroundingContext.before}</p>
            </div>
          )}

          {/* Main chunk (highlighted) */}
          <div className={styles.chunkSection}>
            <span className={styles.chunkLabel}>{t('citation_modal_chunk_label')}</span>
            <blockquote className={styles.chunkText}>{data.chunkText}</blockquote>
          </div>

          {/* Context after */}
          {data.surroundingContext.after && (
            <div className={styles.contextBlock}>
              <span className={styles.contextLabel}>{t('citation_modal_context_after')}</span>
              <p className={styles.contextText}>{data.surroundingContext.after}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={styles.footer}>
          <button
            type="button"
            className={styles.footerCloseBtn}
            onClick={onClose}
          >
            {t('citation_modal_close')}
          </button>
          {data.sourceUrl && (
            <a
              href={data.sourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={styles.pdfLink}
            >
              {t('citation_modal_open_pdf')}
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
            </a>
          )}
        </div>
      </>
    );
  };

  return (
    <div
      ref={overlayRef}
      className={styles.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="citation-modal-title"
      onClick={handleBackdropClick}
    >
      <div className={styles.dialog}>
        {renderContent()}
      </div>
    </div>
  );
}
