'use client';

import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import styles from './ProductTour.module.scss';

export interface TourStep {
  targetSelector: string;
  title: string;
  body: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'auto';
}

interface ProductTourProps {
  steps: TourStep[];
  open: boolean;
  onClose: () => void;
  onFinish: () => void;
}

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const PADDING = 8;
const TOOLTIP_WIDTH = 320;
const TOOLTIP_OFFSET = 14;

export default function ProductTour({ steps, open, onClose, onFinish }: ProductTourProps) {
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (open) setStepIdx(0);
  }, [open]);

  const currentStep = steps[stepIdx];

  // Measure the target element whenever the active step changes, or when the
  // window is resized/scrolled. We poll once with a short delay so React has
  // committed any layout change (e.g. sidebar collapse/expand) before we read.
  const measure = useCallback(() => {
    if (!open || !currentStep) return;
    const el = document.querySelector(currentStep.targetSelector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = (el as HTMLElement).getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    // Scroll the element into view if it's off-screen (center it vertically).
    const vh = window.innerHeight;
    if (r.top < 80 || r.bottom > vh - 80) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [open, currentStep]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const id = window.setTimeout(measure, 250);
    return () => window.clearTimeout(id);
  }, [open, stepIdx, measure]);

  useEffect(() => {
    if (!open) return;
    const onResize = () => measure();
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onResize, true);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onResize, true);
    };
  }, [open, measure]);

  // Esc to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') handleNext();
      if (e.key === 'ArrowLeft') handleBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, stepIdx]);

  if (!open || !mounted || !currentStep) return null;

  const isLast = stepIdx === steps.length - 1;

  function handleNext() {
    if (isLast) onFinish();
    else setStepIdx((i) => Math.min(i + 1, steps.length - 1));
  }

  function handleBack() {
    setStepIdx((i) => Math.max(i - 1, 0));
  }

  // Compute tooltip position. If target not found, center it on screen.
  const tooltipStyle = computeTooltipStyle(rect, currentStep.placement);

  // Spotlight via four overlay rectangles covering everything BUT the target.
  // This avoids clip-path / mask issues across browsers and keeps the target
  // visually highlighted without blocking its own pointer events.
  const spotlight = rect && {
    top: Math.max(rect.top - PADDING, 0),
    left: Math.max(rect.left - PADDING, 0),
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  };

  return createPortal(
    <div className={styles.root} role="dialog" aria-modal="true" aria-label="Panduan produk">
      {/* Four rectangles around the spotlight — or a full veil if no target */}
      {spotlight ? (
        <>
          <div
            className={styles.veil}
            style={{ top: 0, left: 0, width: '100%', height: spotlight.top }}
          />
          <div
            className={styles.veil}
            style={{
              top: spotlight.top,
              left: 0,
              width: spotlight.left,
              height: spotlight.height,
            }}
          />
          <div
            className={styles.veil}
            style={{
              top: spotlight.top,
              left: spotlight.left + spotlight.width,
              right: 0,
              height: spotlight.height,
            }}
          />
          <div
            className={styles.veil}
            style={{
              top: spotlight.top + spotlight.height,
              left: 0,
              width: '100%',
              bottom: 0,
            }}
          />
          {/* Visual ring around the target */}
          <div
            className={styles.ring}
            style={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height,
            }}
          />
        </>
      ) : (
        <div className={`${styles.veil} ${styles.veilFull}`} />
      )}

      <div className={styles.tooltip} style={tooltipStyle}>
        <div className={styles.progress}>
          Langkah {stepIdx + 1} dari {steps.length}
        </div>
        <h3 className={styles.title}>{currentStep.title}</h3>
        <p className={styles.body}>{currentStep.body}</p>
        <div className={styles.nav}>
          <button type="button" className={styles.skipBtn} onClick={onClose}>
            Lewati
          </button>
          <div className={styles.navRight}>
            {stepIdx > 0 && (
              <button type="button" className={styles.backBtn} onClick={handleBack}>
                ← Kembali
              </button>
            )}
            <button type="button" className={styles.nextBtn} onClick={handleNext}>
              {isLast ? 'Selesai' : 'Lanjut →'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function computeTooltipStyle(
  rect: TargetRect | null,
  placement: TourStep['placement'] = 'auto',
): React.CSSProperties {
  if (!rect) {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  const spaceBelow = vh - (rect.top + rect.height);
  const spaceAbove = rect.top;
  const spaceRight = vw - (rect.left + rect.width);

  let p = placement;
  if (p === 'auto') {
    if (spaceBelow >= 220) p = 'bottom';
    else if (spaceAbove >= 220) p = 'top';
    else if (spaceRight >= TOOLTIP_WIDTH + 20) p = 'right';
    else p = 'left';
  }

  let top = 0;
  let left = 0;

  switch (p) {
    case 'bottom':
      top = rect.top + rect.height + TOOLTIP_OFFSET;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      break;
    case 'top':
      top = rect.top - TOOLTIP_OFFSET - 220;
      left = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - 110;
      left = rect.left + rect.width + TOOLTIP_OFFSET;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - 110;
      left = rect.left - TOOLTIP_OFFSET - TOOLTIP_WIDTH;
      break;
  }

  // Clamp inside the viewport.
  left = Math.max(12, Math.min(left, vw - TOOLTIP_WIDTH - 12));
  top = Math.max(12, Math.min(top, vh - 220));

  return { top, left, width: TOOLTIP_WIDTH };
}
