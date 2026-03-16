// Path: src/app/request-course/generating/page.tsx
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useRequestCourse } from '@/context/RequestCourseContext';
import { useAuth } from '@/hooks/useAuth';
import styles from './page.module.scss';

type Stage = 'sending' | 'ai-generating' | 'processing' | 'saving' | 'complete' | 'error';

interface StageInfo {
  label: string;
  description: string;
  basePercent: number;
  targetPercent: number;
}

const STAGES: Record<Stage, StageInfo> = {
  'sending':       { label: 'Sending Request',     description: 'Sending your course details to the server...',  basePercent: 0,   targetPercent: 10 },
  'ai-generating': { label: 'AI Processing',       description: 'AI is generating your course outline...',       basePercent: 10,  targetPercent: 65 },
  'processing':    { label: 'Processing Response',  description: 'Parsing and validating the AI response...',     basePercent: 65,  targetPercent: 75 },
  'saving':        { label: 'Saving Course',        description: 'Saving your course to the database...',        basePercent: 75,  targetPercent: 90 },
  'complete':      { label: 'Complete!',            description: 'Course created successfully! Redirecting...',   basePercent: 90,  targetPercent: 100 },
  'error':         { label: 'Error',                description: 'Something went wrong.',                        basePercent: 0,   targetPercent: 0 },
};

const AI_TIPS = [
  'Structuring modules based on your learning level...',
  'Connecting topics to your real-world problem...',
  'Building progressive learning pathways...',
  'Tailoring content to your goals...',
  'Organizing subtopics for optimal understanding...',
  'Almost there — polishing the outline...',
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

    if (authLoading || !user?.email || hasStarted.current) return;
    if (!answers.topic || !answers.goal || !answers.problem || !answers.assumption) {
      router.replace('/request-course/step1');
      return;
    }

    hasStarted.current = true;
    generateCourse();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, isAuthenticated, user]);

  const generateCourse = async () => {
    try {
      // Stage 1: Sending
      setStage('sending');
      setPercent(5);

      const res = await fetch('/api/generate-course', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          ...answers,
          userId: user!.email,
        }),
        signal: (() => {
          // Start AI progress as soon as fetch begins
          setStage('ai-generating');
          setPercent(STAGES['ai-generating'].basePercent);
          startAiProgress();
          return undefined;
        })(),
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
          throw new Error('Course generation timed out. Please try again with a simpler topic.');
        } else if (res.status === 500) {
          throw new Error('Server error occurred. Please try again in a moment.');
        }
        throw new Error(`Unexpected server response (${res.status}). Please try again.`);
      }

      setPercent(70);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `API Error: ${res.status}`);

      // Stage 4: Saving
      setStage('saving');
      setPercent(STAGES['saving'].basePercent);

      // Log the generation
      try {
        await fetch('/api/generate-course/log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: user!.email,
            courseName: answers.topic,
            parameter: JSON.stringify({
              topic: answers.topic,
              goal: answers.goal,
              level: answers.level,
              extraTopics: answers.extraTopics,
              problem: answers.problem,
              assumption: answers.assumption,
            }),
          }),
        });
      } catch (logErr) {
        console.error('Error logging course generation:', logErr);
      }

      setPercent(90);

      // Stage 5: Complete
      setStage('complete');
      setPercent(100);

      setTimeout(() => router.push('/dashboard'), 1500);
    } catch (err: any) {
      stopAiProgress();
      setStage('error');
      setErrorMsg(err.message || 'An unexpected error occurred');
    }
  };

  const handleRetry = () => {
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
            Go back &amp; try again
          </button>
        )}

        {/* Course info summary */}
        <div className={styles.courseSummary}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Topic</span>
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
