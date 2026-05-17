'use client';

import React, { useCallback, useEffect, useLayoutEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import styles from './DemoCueCards.module.scss';

const STORAGE_KEY = 'demo_cue_last_step';

interface CueStep {
  id: string;
  title: string;
  narasi: string;
  targetSelector?: string;
  placement?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  navigateTo?: string;
}

const STEPS: CueStep[] = [
  {
    id: 'dashboard',
    title: 'Dasbor Admin',
    narasi:
      'Login sebagai admin → buka Dashboard. Lihat 6 KPI utama: total siswa, sesi aktif, kursus berjalan, rata-rata skor Bloom, coverage bukti, dan status readiness penelitian.',
    targetSelector: '[data-tour="dashboard-kpi"]',
    placement: 'bottom',
    navigateTo: '/admin/dashboard',
  },
  {
    id: 'sumber',
    title: 'Bank Sumber Penelitian',
    narasi:
      'Toggle ke Mode Penelitian → klik Sumber di sidebar. Bank sumber berisi 14 PDF ter-upload dengan 541 chunks ter-embed siap untuk retrieval RAG.',
    targetSelector: '[data-tour="nav-sumber"]',
    placement: 'right',
    navigateTo: '/admin/sumber',
  },
  {
    id: 'prompt-evolution',
    title: 'Bukti RM2 — Evolusi Prompt Bloom',
    narasi:
      'Bukti RM2 → buka Demo Persona → Tab Evolusi Prompt. Chart menunjukkan trajektori Bloom: Apply → Analyze → Evaluate. Ini membuktikan perkembangan kemampuan berpikir kritis.',
    targetSelector: '[data-tour="prompt-timeline"]',
    placement: 'bottom',
    navigateTo: '/admin/siswa',
  },
  {
    id: 'cognitive-heatmap',
    title: 'Bukti RM3 — Heatmap Kognitif',
    narasi:
      'Bukti RM3 → Tab Heatmap Kognitif. Matriks 12 dimensi (CT + CTH) menunjukkan rising trajectory dari sesi awal ke akhir. Warna lebih terang = skor lebih tinggi.',
    targetSelector: '[data-tour="cognitive-heatmap"]',
    placement: 'bottom',
    navigateTo: '/admin/siswa',
  },
  {
    id: 'triangulasi',
    title: 'Triangulasi 3 Sumber Bukti',
    narasi:
      'Triangulasi → buka record konvergen dan parsial. Panel split 3 kolom menampilkan artefak siswa, kutipan teori, dan penilaian otomatis secara berdampingan.',
    targetSelector: '[data-tour="triangulasi-table"]',
    placement: 'top',
    navigateTo: '/admin/riset/triangulasi',
  },
  {
    id: 'live-monitor',
    title: 'Live Monitor Sidang',
    narasi:
      'Buka /admin/live di tab baru. Real-time KPI diperbarui setiap 30 detik saat demo berlangsung: sesi aktif, pertanyaan masuk, submission kuis, dan challenge baru.',
    targetSelector: '[data-tour="live-grid"]',
    placement: 'center',
    navigateTo: '/admin/live',
  },
  {
    id: 'ekspor',
    title: 'Ekspor Bundle Riset',
    narasi:
      '1 klik download ZIP berisi semua CSV data penelitian: prompt_classifications, cognitive_scores, triangulation_records, dan research_artifacts — siap untuk analisis SPSS.',
    targetSelector: '[data-tour="ekspor-bundle"]',
    placement: 'top',
    navigateTo: '/admin/ekspor',
  },
];

const PADDING = 10;
const CARD_WIDTH = 360;
const CARD_OFFSET = 16;

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

interface DemoCueCardsProps {
  /** Inject className on the floating trigger button (e.g. to reposition) */
  triggerClassName?: string;
}

export default function DemoCueCards({ triggerClassName }: DemoCueCardsProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [stepIdx, setStepIdx] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);
  const [mounted, setMounted] = useState(false);
  const [navigating, setNavigating] = useState(false);

  useEffect(() => setMounted(true), []);

  // Restore last step from localStorage when opening.
  const handleOpen = () => {
    const saved = typeof window !== 'undefined'
      ? parseInt(localStorage.getItem(STORAGE_KEY) ?? '0', 10)
      : 0;
    setStepIdx(Number.isFinite(saved) && saved >= 0 && saved < STEPS.length ? saved : 0);
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    setNavigating(false);
  };

  const currentStep = STEPS[stepIdx];

  const measure = useCallback(() => {
    if (!open || !currentStep?.targetSelector) {
      setRect(null);
      return;
    }
    const el = document.querySelector(currentStep.targetSelector);
    if (!el) {
      setRect(null);
      return;
    }
    const r = (el as HTMLElement).getBoundingClientRect();
    setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    const vh = window.innerHeight;
    if (r.top < 80 || r.bottom > vh - 80) {
      (el as HTMLElement).scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [open, currentStep]);

  useLayoutEffect(() => {
    if (!open) return;
    measure();
    const id = window.setTimeout(measure, 300);
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

  // Keyboard shortcuts. stepIdx in deps so goNext/goBack have fresh closure.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, stepIdx]); // goNext/goBack recreate each render — intentional

  // Lock body scroll.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const persistStep = (idx: number) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, String(idx));
    }
  };

  const goToStep = async (nextIdx: number) => {
    const next = STEPS[nextIdx];
    if (!next) return;
    persistStep(nextIdx);
    if (next.navigateTo && next.navigateTo !== currentStep?.navigateTo) {
      setNavigating(true);
      router.push(next.navigateTo);
      // Give the navigation a moment to settle before measuring.
      await new Promise<void>((res) => setTimeout(res, 600));
      setNavigating(false);
    }
    setStepIdx(nextIdx);
  };

  const goNext = () => {
    if (stepIdx === STEPS.length - 1) {
      handleClose();
    } else {
      void goToStep(stepIdx + 1);
    }
  };

  const goBack = () => {
    if (stepIdx > 0) void goToStep(stepIdx - 1);
  };

  if (!mounted) return null;

  const spotlight = rect && {
    top: Math.max(rect.top - PADDING, 0),
    left: Math.max(rect.left - PADDING, 0),
    width: rect.width + PADDING * 2,
    height: rect.height + PADDING * 2,
  };

  const cardStyle = computeCardStyle(rect, currentStep?.placement ?? 'center');
  const isLast = stepIdx === STEPS.length - 1;

  return (
    <>
      {/* Floating trigger */}
      <button
        className={`${styles.trigger} ${triggerClassName ?? ''}`}
        onClick={handleOpen}
        aria-label="Mulai Demo Sidang"
        title="Mulai Demo Sidang"
      >
        <span className={styles.triggerIcon}>🎬</span>
        <span className={styles.triggerLabel}>Mulai Demo Sidang</span>
      </button>

      {open && createPortal(
        <div className={styles.root} role="dialog" aria-modal="true" aria-label="Demo cue cards sidang">
          {/* Spotlight veils */}
          {spotlight ? (
            <>
              <div className={styles.veil} style={{ top: 0, left: 0, width: '100%', height: spotlight.top }} />
              <div className={styles.veil} style={{ top: spotlight.top, left: 0, width: spotlight.left, height: spotlight.height }} />
              <div className={styles.veil} style={{ top: spotlight.top, left: spotlight.left + spotlight.width, right: 0, height: spotlight.height }} />
              <div className={styles.veil} style={{ top: spotlight.top + spotlight.height, left: 0, width: '100%', bottom: 0 }} />
              <div
                className={styles.ring}
                style={{ top: spotlight.top, left: spotlight.left, width: spotlight.width, height: spotlight.height }}
              />
            </>
          ) : (
            <div className={`${styles.veil} ${styles.veilFull}`} />
          )}

          {/* Cue card */}
          <div className={styles.card} style={cardStyle}>
            {/* Cinematic header */}
            <div className={styles.cardHeader}>
              <span className={styles.stepBadge}>Step {stepIdx + 1} dari {STEPS.length}</span>
              <button className={styles.closeBtn} onClick={handleClose} aria-label="Tutup demo">
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
            </div>

            {/* Progress bar */}
            <div className={styles.progressBar}>
              <div
                className={styles.progressFill}
                style={{ width: `${((stepIdx + 1) / STEPS.length) * 100}%` }}
              />
            </div>

            <div className={styles.cardBody}>
              <h3 className={styles.stepTitle}>{currentStep?.title}</h3>
              <p className={styles.stepNarasi}>{currentStep?.narasi}</p>
              {currentStep?.navigateTo && (
                <div className={styles.urlHint}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1v4M6 7v4M1 6h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                  {currentStep.navigateTo}
                </div>
              )}
            </div>

            {navigating && (
              <div className={styles.navigatingBanner}>
                <span className={styles.navSpinner} />
                Navigasi...
              </div>
            )}

            <div className={styles.cardFooter}>
              <button className={styles.exitBtn} onClick={handleClose}>Keluar Demo</button>
              <div className={styles.navBtns}>
                {stepIdx > 0 && (
                  <button className={styles.backBtn} onClick={goBack} disabled={navigating}>
                    ← Sebelumnya
                  </button>
                )}
                <button className={styles.nextBtn} onClick={goNext} disabled={navigating}>
                  {isLast ? 'Selesai ✓' : 'Berikutnya →'}
                </button>
              </div>
            </div>

            {/* Dot indicators */}
            <div className={styles.dots}>
              {STEPS.map((_, i) => (
                <button
                  key={i}
                  className={`${styles.dot} ${i === stepIdx ? styles.dotActive : ''} ${i < stepIdx ? styles.dotDone : ''}`}
                  onClick={() => void goToStep(i)}
                  aria-label={`Step ${i + 1}`}
                />
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}

function computeCardStyle(
  rect: TargetRect | null,
  placement: CueStep['placement'],
): React.CSSProperties {
  if (!rect || placement === 'center') {
    return {
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      width: CARD_WIDTH,
    };
  }

  const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 800;

  let p = placement;
  // Auto-pick best placement only when none explicit fits the viewport.
  const spaceBelow = vh - (rect.top + rect.height);
  const spaceAbove = rect.top;
  const spaceRight = vw - (rect.left + rect.width);
  if (p === 'bottom' && spaceBelow < 260) {
    if (spaceAbove >= 260) p = 'top';
    else if (spaceRight >= CARD_WIDTH + 20) p = 'right';
    else p = 'left';
  }

  let top = 0;
  let left = 0;

  switch (p) {
    case 'bottom':
      top = rect.top + rect.height + CARD_OFFSET;
      left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
      break;
    case 'top':
      top = rect.top - CARD_OFFSET - 260;
      left = rect.left + rect.width / 2 - CARD_WIDTH / 2;
      break;
    case 'right':
      top = rect.top + rect.height / 2 - 130;
      left = rect.left + rect.width + CARD_OFFSET;
      break;
    case 'left':
      top = rect.top + rect.height / 2 - 130;
      left = rect.left - CARD_OFFSET - CARD_WIDTH;
      break;
  }

  left = Math.max(12, Math.min(left, vw - CARD_WIDTH - 12));
  top = Math.max(12, Math.min(top, vh - 280));

  return { top, left, width: CARD_WIDTH };
}
