// src/components/Quiz/Quiz.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import styles from './Quiz.module.scss';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import ReasoningNote from '@/components/ReasoningNote/ReasoningNote';

export interface QuizItem {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface QuizCompletedState {
  attemptCount: number;
  latest: {
    attemptNumber: number;
    quizAttemptId: string;
    score: number;
    correctCount: number;
    totalQuestions: number;
    submittedAt: string;
  };
}

export interface QuizProps {
  questions?: QuizItem[];
  courseId?: string;
  moduleTitle?: string;
  subtopic?: string;
  subtopicTitle?: string;
  moduleIndex?: number;
  subtopicIndex?: number;
  /** If provided, the user has already completed this quiz — show summary instead. */
  completedState?: QuizCompletedState | null;
  /** Called when the user clicks the Reshuffle button. Parent should generate new questions. */
  onReshuffle?: () => Promise<void> | void;
  /** True while the parent is fetching new questions. */
  reshuffling?: boolean;
}

export default function Quiz({
  questions = [],
  courseId = '',
  moduleTitle = '',
  subtopic = '',
  subtopicTitle = '',
  moduleIndex = 0,
  subtopicIndex = 0,
  completedState = null,
  onReshuffle,
  reshuffling = false,
}: QuizProps) {
  const safeItems = questions;
  const { user } = useAuth();

  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>(
    safeItems.map(() => null),
  );
  // Per-question reasoning notes — kept in component state so the textarea
  // is controlled, but ALWAYS sent embedded inside each `answers[i]` entry
  // (no separate global array in the request payload).
  const [reasoningNotes, setReasoningNotes] = useState<string[]>(
    safeItems.map(() => ''),
  );
  const [showResults, setShowResults] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Atomic double-submit guard. State updates are async so `submitted` can
  // race when the user double-clicks; a ref flips synchronously and is the
  // source of truth for "is a request in flight".
  const submittingRef = useRef(false);
  // If completedState is set on initial mount, show the completion summary.
  // After the user clicks Reshuffle, the parent passes new questions + clears
  // completedState, so we bypass the summary view for the fresh attempt.
  const [showSummary, setShowSummary] = useState<boolean>(!!completedState);

  // Reset internal state whenever the questions array changes (after reshuffle).
  useEffect(() => {
    setSelectedAnswers(safeItems.map(() => null));
    setReasoningNotes(safeItems.map(() => ''));
    setShowResults(false);
    setSubmitted(false);
    setLoading(false);
    setSubmitError(null);
    submittingRef.current = false;
  }, [safeItems.length, safeItems]);

  // If the parent flips completedState back to non-null (e.g. after a submit
  // where the status endpoint is re-fetched), re-enter summary view.
  useEffect(() => {
    if (completedState && !showResults) {
      setShowSummary(true);
    }
  }, [completedState, showResults]);

  const handleSelect = useCallback(
    (qIndex: number, optIndex: number) => {
      if (showResults) return;
      setSelectedAnswers((prev) => {
        const updated = [...prev];
        updated[qIndex] = optIndex;
        return updated;
      });
    },
    [showResults],
  );

  const handleReasoningChange = useCallback((qIndex: number, value: string) => {
    setReasoningNotes((prev) => {
      const updated = [...prev];
      updated[qIndex] = value;
      return updated;
    });
  }, []);

  const submitQuizToServer = useCallback(
    async (
      answers: Array<{
        question: string;
        options: string[];
        userAnswer: string;
        isCorrect: boolean;
        questionIndex: number;
        reasoningNote: string;
      }>,
      score: number,
    ): Promise<boolean> => {
      // Atomic guard: ref flips synchronously so a double-click cannot
      // squeeze a second request through before React commits `submitted`.
      if (submittingRef.current) return false;
      if (submitted || !user?.id) return false;
      submittingRef.current = true;

      try {
        setLoading(true);
        setSubmitError(null);
        const response = await apiFetch('/api/quiz/submit', {
          method: 'POST',
          body: JSON.stringify({
            userId: user.id,
            userEmail: user.email,
            courseId,
            moduleTitle,
            subtopic,
            subtopicTitle,
            moduleIndex,
            subtopicIndex,
            score,
            answers,
          }),
        });

        if (response.ok) {
          const result = await response.json();
          setSubmitted(true);
          console.log('Quiz attempt saved successfully:', result.message);
          return true;
        }

        const errorResult = await response.json().catch(() => ({}));
        console.error('Failed to save quiz attempt:', errorResult);
        const reason =
          (errorResult && typeof errorResult.error === 'string' && errorResult.error) ||
          `Server mengembalikan status ${response.status}`;
        setSubmitError(
          `Gagal menyimpan hasil kuis: ${reason}. Silakan coba lagi atau muat ulang halaman.`,
        );
        return false;
      } catch (error) {
        console.error('Error saving quiz attempt:', error);
        setSubmitError(
          'Gagal menyimpan hasil kuis: koneksi terputus. Silakan coba lagi.',
        );
        return false;
      } finally {
        setLoading(false);
        submittingRef.current = false;
      }
    },
    [submitted, user, courseId, moduleTitle, subtopic, subtopicTitle, moduleIndex, subtopicIndex],
  );

  const buildAnswersFromState = useCallback(() => {
    let correctCount = 0;
    const answers = safeItems.map((q, index) => {
      const userAnswerIndex = selectedAnswers[index] ?? -1;
      const isCorrect = userAnswerIndex === q.correctIndex;
      if (isCorrect) correctCount++;

      return {
        question: q.question,
        options: q.options,
        userAnswer: userAnswerIndex >= 0 ? q.options[userAnswerIndex] : '',
        isCorrect,
        questionIndex: index,
        reasoningNote: reasoningNotes[index] || '',
      };
    });
    const score = Math.round((correctCount / Math.max(safeItems.length, 1)) * 100);
    return { answers, score };
  }, [safeItems, selectedAnswers, reasoningNotes]);

  const handleCheck = async () => {
    const { answers, score } = buildAnswersFromState();

    // Gate the inline result view on successful server persistence so the
    // UI cannot claim "results saved" while the DB insert silently failed.
    // If the user is anonymous (no user.id), keep the legacy local-only
    // flow so the feature still works in demo mode.
    if (user?.id && courseId) {
      const ok = await submitQuizToServer(answers, score);
      if (ok) {
        setShowResults(true);
      }
    } else {
      setShowResults(true);
    }
  };

  // Retry the most recent submit (used by the "Coba lagi" button shown in
  // the error banner). Re-invokes the lazy-seed path on the server so a
  // missing `quiz` table row gets re-seeded from subtopic_cache before the
  // insert is attempted the second time.
  const handleRetrySubmit = async () => {
    if (!user?.id || !courseId) return;
    const { answers, score } = buildAnswersFromState();
    const ok = await submitQuizToServer(answers, score);
    if (ok) setShowResults(true);
  };

  const handleReshuffleClick = async () => {
    if (!onReshuffle) return;
    const confirmed = typeof window !== 'undefined'
      ? window.confirm('Yakin ingin mengerjakan kuis baru? Nilai lama tetap tersimpan.')
      : true;
    if (!confirmed) return;
    setShowSummary(false);
    setShowResults(false);
    setSubmitted(false);
    await onReshuffle();
  };

  // ── Render: completion summary panel ──
  if (showSummary && completedState) {
    const { latest, attemptCount } = completedState;
    const submittedLabel = (() => {
      try {
        return new Date(latest.submittedAt).toLocaleString('id-ID');
      } catch {
        return latest.submittedAt;
      }
    })();

    return (
      <section className={styles.quizSection}>
        <h3 className={styles.quizHeader}>Waktu Kuis!</h3>
        <div className={styles.completionPanel}>
          <div className={styles.completionCheck}>✓</div>
          <div className={styles.completionTitle}>Anda sudah menyelesaikan kuis ini</div>
          <div className={styles.completionScore}>
            Skor terakhir: <strong>{latest.score}%</strong> ({latest.correctCount}/{latest.totalQuestions})
          </div>
          <div className={styles.completionMeta}>
            Attempt #{latest.attemptNumber}
            {attemptCount > 1 && ` dari ${attemptCount}`} • {submittedLabel}
          </div>
          {onReshuffle && (
            <button
              type="button"
              className={styles.reshuffleButton}
              onClick={handleReshuffleClick}
              disabled={reshuffling}
            >
              {reshuffling ? 'Menyiapkan kuis baru...' : '↻ Reshuffle Kuis (kerjakan baru)'}
            </button>
          )}
          <div className={styles.completionHint}>
            Nilai dan jawaban lama tetap tersimpan untuk riwayat.
          </div>
        </div>
      </section>
    );
  }

  if (!safeItems.length) {
    return (
      <section className={styles.quizSection}>
        <h3 className={styles.quizHeader}>Waktu Kuis!</h3>
        <div className={styles.noQuizMessage}>
          <p>Quiz sedang disiapkan untuk subtopik ini. Silakan lanjut ke bagian selanjutnya atau kembali lagi nanti.</p>
        </div>
      </section>
    );
  }

  // ── Render: interactive quiz ──
  return (
    <section className={styles.quizSection}>
      <h3 className={styles.quizHeader}>Waktu Kuis!</h3>
      {safeItems.map((q, qIdx) => (
        <div key={qIdx} className={styles.questionBlock}>
          <p className={styles.questionText}>
            {qIdx + 1}. {q.question}
          </p>
          <ul className={styles.optionsList}>
            {q.options.map((opt, optIdx) => {
              const isSelected = selectedAnswers[qIdx] === optIdx;
              const isCorrect = q.correctIndex === optIdx;
              return (
                <li key={optIdx} className={styles.optionItem}>
                  <label className={styles.optionLabel}>
                    <input
                      type="radio"
                      name={`quiz-${qIdx}`}
                      disabled={showResults}
                      checked={isSelected}
                      onChange={() => handleSelect(qIdx, optIdx)}
                      className={styles.optionInput}
                    />
                    {opt}
                  </label>
                  {showResults && isSelected && isCorrect && (
                    <span className={styles.resultIcon}>✔</span>
                  )}
                  {showResults && isSelected && !isCorrect && (
                    <span className={styles.resultIcon}>✖</span>
                  )}
                  {showResults && !isSelected && isCorrect && (
                    <span className={styles.resultIcon}>✔</span>
                  )}
                </li>
              );
            })}
          </ul>
          {selectedAnswers[qIdx] !== null && !showResults && (
            <ReasoningNote
              value={reasoningNotes[qIdx]}
              onChange={(val) => handleReasoningChange(qIdx, val)}
              label="Kenapa memilih jawaban ini?"
              placeholder="Jelaskan alasan Anda memilih jawaban tersebut..."
            />
          )}
        </div>
      ))}

      {submitError && (
        <div className={styles.submitError} role="alert">
          <span aria-hidden="true">⚠️</span>
          <div className={styles.submitErrorBody}>
            <div>
              <strong>Simpan gagal.</strong> {submitError}
            </div>
            <button
              type="button"
              className={styles.submitRetryButton}
              onClick={handleRetrySubmit}
              disabled={loading}
            >
              {loading ? 'Mencoba ulang...' : '↻ Coba lagi'}
            </button>
          </div>
        </div>
      )}

      <div className={styles.buttonRow}>
        <button
          type="button"
          onClick={handleCheck}
          disabled={selectedAnswers.some((ans) => ans === null) || showResults || loading}
          className={styles.checkButton}
        >
          {loading ? 'Menyimpan...' : showResults ? 'Selesai' : 'Cek Hasil'}
        </button>
        {showResults && onReshuffle && (
          <button
            type="button"
            className={styles.reshuffleButtonSecondary}
            onClick={handleReshuffleClick}
            disabled={reshuffling}
          >
            {reshuffling ? 'Menyiapkan...' : '↻ Reshuffle Kuis'}
          </button>
        )}
      </div>
    </section>
  );
}
