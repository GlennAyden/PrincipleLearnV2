'use client';

import { useCallback, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api-client';
import { useInteractionTracking } from '@/hooks/useInteractionTracking';
import type { BugHuntConfig } from '@/types/interactive-blocks';
import styles from './BugHunt.module.scss';

interface BugHuntProps {
  config: BugHuntConfig;
  courseId: string;
  subtopicId?: string | null;
  leafSubtopicId?: string | null;
  onSubmitted?: (artifactId: string | null, score: number) => void;
}

/**
 * MVR Item 9.3 — BugHunt.
 *
 * Student reads numbered buggy code lines, clicks the line with the bug,
 * then types a fix. Score: 1.0 = correct line + correct fix; 0.5 = correct
 * line only; 0 = wrong line. Fix is revealed after submit when score < 1.
 */
export function BugHunt({
  config,
  courseId,
  subtopicId,
  leafSubtopicId,
  onSubmitted,
}: BugHuntProps) {
  const { track, getEvents, eventCount } = useInteractionTracking();

  const [selectedLine, setSelectedLine] = useState<number | null>(null); // 1-indexed
  const [fixText, setFixText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  // Throttle fix_typed events: fire at most once per second
  const fixThrottleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleLineClick = (lineIdx: number) => {
    if (submitted) return;
    setSelectedLine(lineIdx);
    track('line_clicked', { line: lineIdx });
  };

  const handleFixChange = useCallback(
    (value: string) => {
      setFixText(value);
      if (!fixThrottleRef.current) {
        fixThrottleRef.current = setTimeout(() => {
          track('fix_typed', { length: value.length });
          fixThrottleRef.current = null;
        }, 1000);
      }
    },
    [track],
  );

  const evaluate = (): number => {
    if (selectedLine === null) return 0;
    const lineCorrect = selectedLine === config.bugLineIndex;
    if (!lineCorrect) return 0;

    const trimmed = fixText.trim().toLowerCase();
    const acceptedFixes = [
      config.expectedFix,
      ...(config.fixAlternatives ?? []),
    ].map((f) => f.trim().toLowerCase());

    const fixCorrect = acceptedFixes.some((f) => f === trimmed);
    return fixCorrect ? 1.0 : 0.5;
  };

  const handleSubmit = async () => {
    if (selectedLine === null) return;
    setSubmitting(true);
    setSubmitError('');

    const finalScore = evaluate();
    track('submitted', { selectedLine, fixText, score: finalScore });

    try {
      const res = await apiFetch('/api/research-artifacts/submit', {
        method: 'POST',
        body: JSON.stringify({
          courseId,
          subtopicId,
          leafSubtopicId,
          artifactType: 'bug_hunt',
          artifactTitle: 'BugHunt submission',
          artifactContent: JSON.stringify({
            selectedLine,
            fixText,
            bugLineIndex: config.bugLineIndex,
            expectedFix: config.expectedFix,
            score: finalScore,
          }),
          interactionEvents: getEvents(),
          completionStatus: 'submitted',
          componentScore: Number(finalScore.toFixed(2)),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setSubmitted(true);
      setScore(finalScore);
      onSubmitted?.(json.artifactId ?? null, finalScore);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Gagal submit.');
    } finally {
      setSubmitting(false);
    }
  };

  const lineCorrect = submitted && selectedLine === config.bugLineIndex;
  const lineWrong = submitted && selectedLine !== config.bugLineIndex;

  return (
    <div className={styles.block}>
      {config.prompt && <div className={styles.prompt}>{config.prompt}</div>}

      <div className={styles.codeBlock} role="list" aria-label="Baris kode">
        {config.buggyLines.map((line, idx) => {
          const lineNumber = idx + 1;
          const isSelected = selectedLine === lineNumber;
          const isRevealedBug = submitted && lineNumber === config.bugLineIndex;

          const lineClass = [
            styles.codeLine,
            isSelected && !submitted ? styles.codeLineSelected : '',
            isRevealedBug ? styles.codeLineBug : '',
            submitted && isSelected && !isRevealedBug ? styles.codeLineWrongPick : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              key={lineNumber}
              className={lineClass}
              role="listitem"
              aria-label={`Baris ${lineNumber}`}
              aria-selected={isSelected}
              tabIndex={submitted ? -1 : 0}
              onClick={() => handleLineClick(lineNumber)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  handleLineClick(lineNumber);
                }
              }}
            >
              <span className={styles.lineNumber} aria-hidden>
                {lineNumber}
              </span>
              <code className={styles.lineText}>{line}</code>
              {isRevealedBug && submitted && (
                <span className={styles.bugMarker} aria-label="Baris bermasalah">
                  bug
                </span>
              )}
            </div>
          );
        })}
      </div>

      {selectedLine !== null && !submitted && (
        <div className={styles.fixArea}>
          <label htmlFor="bug-fix-input" className={styles.fixLabel}>
            Tulis perbaikan untuk baris {selectedLine}:
          </label>
          <textarea
            id="bug-fix-input"
            className={styles.fixInput}
            rows={2}
            value={fixText}
            placeholder="Ketik baris yang sudah diperbaiki..."
            onChange={(e) => handleFixChange(e.target.value)}
            aria-label={`Perbaikan baris ${selectedLine}`}
          />
        </div>
      )}

      {submitted && score !== null && score < 1 && (
        <div className={styles.revealBox}>
          {lineWrong && (
            <div className={styles.revealItem}>
              <span className={styles.revealIcon} aria-hidden>!</span>
              <span>
                Bug ada di baris <strong>{config.bugLineIndex}</strong>, bukan baris {selectedLine}.
              </span>
            </div>
          )}
          <div className={styles.revealItem}>
            <span className={styles.revealIcon} aria-hidden>?</span>
            <span>
              Perbaikan yang benar: <code className={styles.fixCode}>{config.expectedFix}</code>
            </span>
          </div>
          {config.hint && (
            <div className={styles.hint}>
              Petunjuk: {config.hint}
            </div>
          )}
        </div>
      )}

      {submitted && score === 1 && (
        <div className={styles.successBox}>
          Tepat! Kamu menemukan bug dan menulis perbaikan yang benar.
        </div>
      )}

      <div className={styles.footer}>
        <span className={styles.eventBadge}>{eventCount} aksi tercatat</span>
        {submitted && score !== null && (
          <span
            className={[styles.scoreBadge, lineCorrect ? styles.scoreBadgeGood : styles.scoreBadgeLow].join(' ')}
          >
            Skor: {Math.round(score * 100)}%
          </span>
        )}
        {submitError && <span className={styles.error}>{submitError}</span>}
        <button
          type="button"
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={submitting || submitted || selectedLine === null || !fixText.trim()}
          aria-label="Submit jawaban bug hunt"
        >
          {submitting ? 'Mengirim...' : submitted ? 'Tersimpan' : 'Submit'}
        </button>
      </div>
    </div>
  );
}
