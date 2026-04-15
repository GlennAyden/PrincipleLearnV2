// Path: src/app/request-course/generating/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRequestCourse } from '@/context/RequestCourseContext';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import styles from './page.module.scss';

type Stage = 'sending' | 'ai-generating' | 'processing' | 'saving' | 'complete' | 'error';

interface StageInfo {
  label: string;
  description: string;
  basePercent: number;
  targetPercent: number;
}

const STAGES: Record<Stage, StageInfo> = {
  'sending':       { label: 'Mengirim Permintaan',  description: 'Mengirim detail kursus ke server...',             basePercent: 0,   targetPercent: 10 },
  'ai-generating': { label: 'Proses AI',            description: 'AI sedang membuat outline kursusmu...',        basePercent: 10,  targetPercent: 65 },
  'processing':    { label: 'Memproses Respons',    description: 'Memeriksa dan memvalidasi respons AI...',       basePercent: 65,  targetPercent: 75 },
  'saving':        { label: 'Menyimpan Kursus',     description: 'Menyimpan kursus ke database...',              basePercent: 75,  targetPercent: 90 },
  'complete':      { label: 'Selesai!',             description: 'Kursus berhasil dibuat! Mengalihkan...',       basePercent: 90,  targetPercent: 100 },
  'error':         { label: 'Error',                description: 'Terjadi kesalahan.',                           basePercent: 0,   targetPercent: 0 },
};

const AI_TIPS = [
  'Menyusun modul berdasarkan level belajarmu...',
  'Menghubungkan topik dengan masalah nyatamu...',
  'Membangun jalur pembelajaran bertahap...',
  'Menyesuaikan konten dengan tujuanmu...',
  'Mengorganisir subtopik untuk pemahaman optimal...',
  'Hampir selesai — menyempurnakan outline...',
];

export default function GeneratingPage() {
  const router = useRouter();
  const { answers } = useRequestCourse();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const [stage, setStage] = useState<Stage>('sending');
  const [percent, setPercent] = useState(0);
  const [tipIdx, setTipIdx] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const hasStarted = useRef(false);

  // Idempotency guard. sessionStorage survives hard reloads (F5) but is
  // cleared when the tab closes, so we use it to detect a duplicate run
  // triggered by the user refreshing mid-generation. The timestamp lets
  // us expire stale flags if a previous attempt crashed without cleanup.
  const GENERATION_FLAG_KEY = 'course_generation_in_flight';
  const GENERATION_FLAG_TTL_MS = 3 * 60 * 1000;

  // AbortController for cancelling long-running requests
  const abortControllerRef = useRef<AbortController | null>(null);

  // Smooth percentage animation during AI wait
  const aiTimerRef = useRef<number | null>(null);
  const tipTimerRef = useRef<number | null>(null);

  const startAiProgress = useCallback(() => {
    const startTime = Date.now();
    const expectedDuration = 45000; // 45 seconds expected
    const startPercent = STAGES['ai-generating'].basePercent;
    const endPercent = STAGES['ai-generating'].targetPercent;

    aiTimerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startTime;
      // Ease-out curve: fast start, slow end, never reaches 100%
      const progress = 1 - Math.pow(1 - Math.min(elapsed / expectedDuration, 0.95), 2);
      const currentPercent = startPercent + (endPercent - startPercent) * progress;
      setPercent(Math.floor(currentPercent));
    }, 300);

    // Rotate tips every 5 seconds
    tipTimerRef.current = window.setInterval(() => {
      setTipIdx(prev => (prev + 1) % AI_TIPS.length);
    }, 5000);
  }, []);

  const stopAiProgress = useCallback(() => {
    if (aiTimerRef.current) { clearInterval(aiTimerRef.current); aiTimerRef.current = null; }
    if (tipTimerRef.current) { clearInterval(tipTimerRef.current); tipTimerRef.current = null; }
  }, []);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
      return;
    }

    if (authLoading || !user?.id || !user?.email || hasStarted.current) return;
    if (!answers.topic || !answers.goal || !answers.problem || !answers.assumption) {
      router.replace('/request-course/step1');
      return;
    }

    // Detect duplicate invocations caused by a hard reload during an
    // in-flight generation. If a fresh flag exists in sessionStorage, we
    // refuse to fire a second OpenAI call — the previous request is still
    // running (or was abandoned). The user can hit retry to start over.
    try {
      const raw = sessionStorage.getItem(GENERATION_FLAG_KEY);
      if (raw) {
        const { startedAt } = JSON.parse(raw) as { startedAt: number };
        if (Number.isFinite(startedAt) && Date.now() - startedAt < GENERATION_FLAG_TTL_MS) {
          setStage('error');
          setErrorMsg('Pembuatan kursus sudah berjalan di tab ini. Tunggu hingga selesai atau kembali ke step sebelumnya untuk mulai ulang.');
          return;
        }
        // Stale flag — clear and proceed
        sessionStorage.removeItem(GENERATION_FLAG_KEY);
      }
    } catch {
      // Ignore sessionStorage errors (private mode, etc.)
    }

    hasStarted.current = true;
    try {
      sessionStorage.setItem(
        GENERATION_FLAG_KEY,
        JSON.stringify({ startedAt: Date.now() }),
      );
    } catch {
      // Non-fatal — idempotency guard is best-effort
    }
    generateCourse();
  }, [authLoading, isAuthenticated, user]);

  // Warn user if they try to close/reload mid-generation so we don't
  // accidentally fire a second OpenAI call on a fresh page mount.
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (stage !== 'complete' && stage !== 'error') {
        e.preventDefault();
        // Legacy Chrome still reads returnValue
        e.returnValue = 'Kursusmu sedang dibuat. Keluar sekarang akan membatalkan proses.';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [stage]);

  // Abort any in-flight request if the component unmounts (user navigates away).
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const generateCourse = async () => {
    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      // Stage 1: Sending
      setStage('sending');
      setPercent(5);

      // Stage 2: Start AI progress tracking before fetch
      setStage('ai-generating');
      setPercent(STAGES['ai-generating'].basePercent);
      startAiProgress();

      // Identity is derived server-side from the JWT cookie; never send
      // userId/userEmail in the body (would be an IDOR vector) and the
      // backend schema is .strict() so unknown keys would also 400.
      const res = await apiFetch('/api/generate-course', {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        },
        body: JSON.stringify(answers),
        signal: abortController.signal,
      });

      // Stage 3: Processing response
      stopAiProgress();
      setStage('processing');
      setPercent(STAGES['processing'].basePercent);

      const contentType = res.headers.get('content-type');
      if (!contentType || !contentType.includes('application/json')) {
        const textResponse = await res.text();
        console.error('Non-JSON response:', textResponse);
        if (res.status === 504) {
          throw new Error('Pembuatan kursus timeout. Coba lagi dengan topik yang lebih sederhana.');
        } else if (res.status === 500) {
          throw new Error('Terjadi error server. Coba lagi beberapa saat.');
        }
        throw new Error(`Respons server tidak terduga (${res.status}). Coba lagi.`);
      }

      setPercent(70);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);

      // Stage 4: Saving (already saved by the API route, just updating UI)
      setStage('saving');
      setPercent(STAGES['saving'].basePercent);

      // Activity logging is handled by the generate-course API route directly
      // No need to call /api/generate-course/log separately

      setPercent(90);

      // Stage 5: Complete
      setStage('complete');
      setPercent(100);

      try { sessionStorage.removeItem(GENERATION_FLAG_KEY); } catch { /* ignore */ }

      setTimeout(() => router.push(data.courseId ? `/course/${data.courseId}` : '/dashboard'), 1500);
    } catch (err: unknown) {
      stopAiProgress();
      try { sessionStorage.removeItem(GENERATION_FLAG_KEY); } catch { /* ignore */ }
      if (err instanceof Error && err.name === 'AbortError') {
        setStage('error');
        setErrorMsg('Pembuatan kursus dibatalkan.');
      } else {
        setStage('error');
        setErrorMsg(err instanceof Error ? err.message : 'Terjadi kesalahan tidak terduga');
      }
    }
  };

  const handleRetry = () => {
    try { sessionStorage.removeItem(GENERATION_FLAG_KEY); } catch { /* ignore */ }
    router.push('/request-course/step3');
  };

  if (authLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingSpinner} />
      </div>
    );
  }

  const currentStage = STAGES[stage];
  const stageOrder: Stage[] = ['sending', 'ai-generating', 'processing', 'saving', 'complete'];

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />
      <div className={styles.bgOrb3} />

      <div className={styles.container}>
        {/* Animated icon */}
        <div className={styles.iconWrap} data-stage={stage}>
          {stage === 'error' ? (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
              <path d="M16 16L32 32M32 16L16 32" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          ) : stage === 'complete' ? (
            <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
              <circle cx="24" cy="24" r="20" stroke="currentColor" strokeWidth="2" />
              <path d="M15 24L21 30L33 18" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <div className={styles.pulseRing}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="4" y="8" width="32" height="24" rx="4" stroke="currentColor" strokeWidth="1.5" />
                <path d="M4 16H36" stroke="currentColor" strokeWidth="1.5" />
                <circle cx="10" cy="12" r="1.5" fill="currentColor" />
                <circle cx="15" cy="12" r="1.5" fill="currentColor" />
                <circle cx="20" cy="12" r="1.5" fill="currentColor" />
                <path d="M12 24H28" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                <path d="M16 28H24" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              </svg>
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            data-stage={stage}
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Percent */}
        <div className={styles.percentText}>{percent}%</div>

        {/* Stage label  */}
        <h2 className={styles.stageLabel}>{currentStage.label}</h2>
        <p className={styles.stageDesc}>
          {stage === 'ai-generating' ? AI_TIPS[tipIdx] : (stage === 'error' ? errorMsg : currentStage.description)}
        </p>

        {/* Stage timeline */}
        {stage !== 'error' && (
          <div className={styles.timeline}>
            {stageOrder.map((s, i) => {
              const stageIdx = stageOrder.indexOf(stage);
              const isDone = i < stageIdx;
              const isCurrent = i === stageIdx;
              return (
                <div key={s} className={styles.timelineItem} data-done={isDone} data-current={isCurrent}>
                  <div className={styles.timelineDot}>
                    {isDone ? '✓' : (i + 1)}
                  </div>
                  <span className={styles.timelineLabel}>{STAGES[s].label}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Error retry */}
        {stage === 'error' && (
          <button className={styles.retryBtn} onClick={handleRetry}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M2 8C2 4.7 4.7 2 8 2C11.3 2 14 4.7 14 8C14 11.3 11.3 14 8 14C5.3 14 3 12.1 2.3 9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M2 4V8H6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            Kembali &amp; Coba Lagi
          </button>
        )}

        {/* Course info summary */}
        <div className={styles.courseSummary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Topik</span>
            <span className={styles.summaryValue}>{answers.topic || '—'}</span>
          </div>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Level</span>
            <span className={styles.summaryValue}>{answers.level || '—'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
