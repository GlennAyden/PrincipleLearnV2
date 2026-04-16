// src/components/Quiz/Quiz.tsx
import React, { useState, useCallback, useEffect, useRef } from 'react';
import styles from './Quiz.module.scss';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import ReasoningNote from '@/components/ReasoningNote/ReasoningNote';

export interface QuizItem {
  question: string;
  options: string[];
  correctIndex?: number;
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

interface QuizAnswerEvaluation {
  questionIndex: number;
  isCorrect: boolean;
  correctAnswer?: string;
  userAnswer?: string;
  matched?: boolean;
  method?: string;
  question?: string;
}

interface QuizSubmissionSummary {
  score: number;
  correctCount: number;
  totalQuestions: number;
  attemptNumber?: number;
  quizAttemptId?: string;
  submittedAt?: string;
}

interface QuizSubmissionResponse {
  success?: boolean;
  score?: number;
  correctCount?: number;
  attemptNumber?: number;
  quizAttemptId?: string;
  submittedAt?: string;
  message?: string;
  evaluatedAnswers?: QuizAnswerEvaluation[];
  matchingResults?: Array<{
    questionIndex?: number;
    matched?: boolean;
    method?: string;
    question?: string;
    correctAnswer?: string;
    userAnswer?: string;
    isCorrect?: boolean;
  }>;
  evaluations?: QuizAnswerEvaluation[];
  questionEvaluations?: QuizAnswerEvaluation[];
  answerEvaluations?: QuizAnswerEvaluation[];
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
  const quizScopeKey = `${courseId}|${moduleTitle}|${subtopic}|${subtopicTitle}|${moduleIndex}|${subtopicIndex}`;

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
  const [submissionSummary, setSubmissionSummary] = useState<QuizSubmissionSummary | null>(null);
  const [questionEvaluations, setQuestionEvaluations] = useState<QuizAnswerEvaluation[]>([]);
  // Atomic double-submit guard. State updates are async so `submitted` can
  // race when the user double-clicks; a ref flips synchronously and is the
  // source of truth for "is a request in flight".
  const submittingRef = useRef(false);
  // If completedState is set on initial mount, show the completion summary.
  // After the user clicks Reshuffle, the parent passes new questions + clears
  // completedState, so we bypass the summary view for the fresh attempt.
  const [showSummary, setShowSummary] = useState<boolean>(!!completedState);

  const resetAttemptState = useCallback((nextShowSummary = false) => {
    setSelectedAnswers(safeItems.map(() => null));
    setReasoningNotes(safeItems.map(() => ''));
    setShowResults(false);
    setSubmitted(false);
    setLoading(false);
    setSubmitError(null);
    setSubmissionSummary(null);
    setQuestionEvaluations([]);
    submittingRef.current = false;
    setShowSummary(nextShowSummary);
  }, [safeItems]);

  // Reset internal state whenever the quiz scope or question list changes.
  useEffect(() => {
    resetAttemptState(false);
  }, [quizScopeKey, safeItems.length, resetAttemptState]);

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
    ): Promise<QuizSubmissionResponse | null> => {
      // Atomic guard: ref flips synchronously so a double-click cannot
      // squeeze a second request through before React commits `submitted`.
      if (submittingRef.current) return null;
      if (submitted || !user?.id) return null;
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
          const evaluations = extractEvaluations(result, answers);
          setQuestionEvaluations(evaluations);
          setSubmissionSummary({
            score: typeof result.score === 'number' ? result.score : score,
            correctCount:
              typeof result.correctCount === 'number'
                ? result.correctCount
                : evaluations.filter((item) => item.isCorrect).length,
            totalQuestions: answers.length,
            attemptNumber: typeof result.attemptNumber === 'number' ? result.attemptNumber : undefined,
            quizAttemptId: typeof result.quizAttemptId === 'string' ? result.quizAttemptId : undefined,
            submittedAt: typeof result.submittedAt === 'string' ? result.submittedAt : undefined,
          });
          console.log('Quiz attempt saved successfully:', result.message);
          return result;
        }

        const errorResult = await response.json().catch(() => ({}));
        console.error('Failed to save quiz attempt:', errorResult);
        const reason =
          (errorResult && typeof errorResult.error === 'string' && errorResult.error) ||
          `Server mengembalikan status ${response.status}`;
        setSubmitError(
          `Gagal menyimpan hasil kuis: ${reason}. Silakan coba lagi atau muat ulang halaman.`,
        );
        return null;
      } catch (error) {
        console.error('Error saving quiz attempt:', error);
        setSubmitError(
          'Gagal menyimpan hasil kuis: koneksi terputus. Silakan coba lagi.',
        );
        return null;
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
      const isCorrect = typeof q.correctIndex === 'number' && userAnswerIndex === q.correctIndex;
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
      const result = await submitQuizToServer(answers, score);
      if (result) {
        setShowResults(true);
        setShowSummary(false);
      }
    } else {
      const fallbackEvaluations = buildFallbackEvaluations(answers);
      setQuestionEvaluations(fallbackEvaluations);
      setSubmissionSummary({
        score,
        correctCount: fallbackEvaluations.filter((evaluation) => evaluation.isCorrect).length,
        totalQuestions: answers.length,
      });
      setShowResults(true);
      setShowSummary(false);
    }
  };

  // Retry the most recent submit (used by the "Coba lagi" button shown in
  // the error banner). Re-invokes the lazy-seed path on the server so a
  // missing `quiz` table row gets re-seeded from subtopic_cache before the
  // insert is attempted the second time.
  const handleRetrySubmit = async () => {
    if (!user?.id || !courseId) return;
    const { answers, score } = buildAnswersFromState();
    const result = await submitQuizToServer(answers, score);
    if (result) {
      setShowResults(true);
      setShowSummary(false);
    }
  };

  const handleReshuffleClick = async () => {
    if (!onReshuffle) return;
    const confirmed = typeof window !== 'undefined'
      ? window.confirm('Yakin ingin mengerjakan kuis baru? Nilai lama tetap tersimpan.')
      : true;
    if (!confirmed) return;
    resetAttemptState(false);
    await onReshuffle();
  };

  const buildFallbackEvaluations = useCallback(
    (answers: Array<{
      question: string;
      options: string[];
      userAnswer: string;
      isCorrect: boolean;
      questionIndex: number;
      reasoningNote: string;
    }>) =>
      answers.map((answer) => ({
        questionIndex: answer.questionIndex,
        isCorrect: answer.isCorrect,
        userAnswer: answer.userAnswer,
        question: answer.question,
      })),
    [],
  );

  function extractEvaluations(
    result: QuizSubmissionResponse,
    answers: Array<{
      question: string;
      options: string[];
      userAnswer: string;
      isCorrect: boolean;
      questionIndex: number;
      reasoningNote: string;
    }>,
  ): QuizAnswerEvaluation[] {
    const rawEvaluations = (
      result.questionEvaluations ??
      result.answerEvaluations ??
      result.evaluations ??
      result.evaluatedAnswers ??
      result.matchingResults ??
      []
    ) as Array<Record<string, unknown>>;

    if (!Array.isArray(rawEvaluations) || rawEvaluations.length === 0) {
      return buildFallbackEvaluations(answers);
    }

    return rawEvaluations.map((evaluation, index) => {
      const questionIndexValue = evaluation.questionIndex;
      const questionIndex = typeof questionIndexValue === 'number' ? questionIndexValue : index;
      const answer = answers[questionIndex] ?? answers[index];
      const correctAnswer =
        typeof evaluation.correctAnswer === 'string'
          ? evaluation.correctAnswer
          : undefined;
      const isCorrect =
        typeof evaluation.isCorrect === 'boolean'
          ? evaluation.isCorrect
          : typeof evaluation.matched === 'boolean'
            ? evaluation.matched
            : typeof correctAnswer === 'string'
              ? answer?.userAnswer === correctAnswer
              : typeof answer?.isCorrect === 'boolean'
                ? answer.isCorrect
                : false;

      return {
        questionIndex,
        isCorrect,
        correctAnswer,
        userAnswer:
          typeof evaluation.userAnswer === 'string'
            ? evaluation.userAnswer
            : answer?.userAnswer,
        matched: typeof evaluation.matched === 'boolean' ? evaluation.matched : undefined,
        method: typeof evaluation.method === 'string' ? evaluation.method : undefined,
        question: typeof evaluation.question === 'string' ? evaluation.question : answer?.question,
      };
    });
  }

  const getEvaluationForQuestion = useCallback(
    (questionIndex: number) =>
      questionEvaluations.find((evaluation) => evaluation.questionIndex === questionIndex) ??
      null,
    [questionEvaluations],
  );

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
      {showResults && submissionSummary && (
        <div className={styles.completionPanel}>
          <div className={styles.completionTitle}>Hasil evaluasi tersimpan</div>
          <div className={styles.completionScore}>
            Skor: <strong>{submissionSummary.score}%</strong> ({submissionSummary.correctCount}/{submissionSummary.totalQuestions})
          </div>
          {submissionSummary.attemptNumber && (
            <div className={styles.completionMeta}>Attempt #{submissionSummary.attemptNumber}</div>
          )}
        </div>
      )}
      {safeItems.map((q, qIdx) => (
        <div key={qIdx} className={styles.questionBlock}>
          <p className={styles.questionText}>
            {qIdx + 1}. {q.question}
          </p>
          <ul className={styles.optionsList}>
            {q.options.map((opt, optIdx) => {
              const isSelected = selectedAnswers[qIdx] === optIdx;
              const evaluation = getEvaluationForQuestion(qIdx);
              const fallbackCorrectIndex = typeof q.correctIndex === 'number' ? q.correctIndex : null;
              const correctAnswerText = evaluation?.correctAnswer ?? (
                fallbackCorrectIndex !== null ? q.options[fallbackCorrectIndex] : undefined
              );
              const isCorrectOption = typeof correctAnswerText === 'string'
                ? q.options[optIdx] === correctAnswerText
                : fallbackCorrectIndex === optIdx;
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
                  {showResults && isSelected && isCorrectOption && (
                    <span className={styles.resultIcon}>✔</span>
                  )}
                  {showResults && isSelected && !isCorrectOption && (
                    <span className={styles.resultIcon}>✖</span>
                  )}
                  {showResults && !isSelected && isCorrectOption && (
                    <span className={styles.resultIcon}>✔</span>
                  )}
                </li>
              );
            })}
          </ul>
          {showResults && (() => {
            const evaluation = getEvaluationForQuestion(qIdx);
            const correctAnswerText = evaluation?.correctAnswer ??
              (typeof q.correctIndex === 'number' ? q.options[q.correctIndex] : undefined);
            if (!correctAnswerText) return null;
            return (
              <div className={styles.completionHint}>
                Jawaban benar: <strong>{correctAnswerText}</strong>
              </div>
            );
          })()}
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
