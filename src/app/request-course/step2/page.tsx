// Path: src/app/request-course/step2/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useRequestCourse } from '@/context/RequestCourseContext';
import type { Level } from '@/context/RequestCourseContext';
import styles from './page.module.scss';

const levels: { value: Level; label: string; icon: string; desc: string; color: string }[] = [
  { value: 'Beginner',     label: 'Beginner',     icon: '🌱', desc: 'Starting from the basics',     color: 'green' },
  { value: 'Intermediate', label: 'Intermediate', icon: '📚', desc: 'Some prior knowledge',         color: 'blue' },
  { value: 'Advance',      label: 'Advanced',     icon: '🚀', desc: 'Deep dive & advanced topics',  color: 'purple' },
];

export default function RequestCourseStep2() {
  const router = useRouter();
  const { answers, setPartial } = useRequestCourse();

  const [level, setLevel]             = useState(answers.level);
  const [extraTopics, setExtraTopics] = useState(answers.extraTopics);
  const [error, setError]             = useState('');

  const handleContinue = () => {
    if (!level) {
      setError('Please select your knowledge level');
      return;
    }
    setPartial({ level, extraTopics });
    router.push('/request-course/step3');
  };

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <Link href="/request-course/step1" className={styles.backLink}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
          <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back
      </Link>

      <div className={styles.card}>
        {/* Step indicator */}
        <div className={styles.stepIndicator}>
          <div className={styles.stepDot} data-done="true">✓</div>
          <div className={styles.stepLine} data-done="true" />
          <div className={styles.stepDot} data-active="true">2</div>
          <div className={styles.stepLine} />
          <div className={styles.stepDot}>3</div>
        </div>

        <div className={styles.cardHeader}>
          <div className={styles.headerIcon}>
            <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
              <path d="M14 4L4 10L14 16L24 10L14 4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
              <path d="M4 14L14 20L24 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 18L14 24L24 18" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <h1 className={styles.title}>Your knowledge level</h1>
          <p className={styles.subtitle}>Help us calibrate the course difficulty</p>
        </div>

        {error && (
          <div className={styles.error}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
              <path d="M8 5V9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <circle cx="8" cy="11.5" r="0.75" fill="currentColor" />
            </svg>
            {error}
          </div>
        )}

        {/* Level Cards */}
        <div className={styles.levelGrid}>
          {levels.map((l) => (
            <button
              key={l.value}
              className={styles.levelCard}
              data-color={l.color}
              data-selected={level === l.value}
              onClick={() => { setLevel(l.value); setError(''); }}
            >
              <span className={styles.levelIcon}>{l.icon}</span>
              <span className={styles.levelLabel}>{l.label}</span>
              <span className={styles.levelDesc}>{l.desc}</span>
              {level === l.value && (
                <div className={styles.checkMark}>
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 8L7 11L12 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
            </button>
          ))}
        </div>

        {/* Extra topics */}
        <div className={styles.field}>
          <label className={styles.label}>
            Specific topics to cover
            <span className={styles.optional}>(optional)</span>
          </label>
          <textarea
            className={styles.textarea}
            placeholder="e.g., Neural Networks, Transfer Learning, NLP..."
            value={extraTopics}
            onChange={e => setExtraTopics(e.currentTarget.value)}
          />
        </div>

        <button className={styles.submitBtn} onClick={handleContinue}>
          Continue
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
            <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
