// src/components/Quiz/Quiz.tsx
import React, { useState } from 'react';
import styles from './Quiz.module.scss';
import { useAuth } from '@/hooks/useAuth';
import ReasoningNote from '@/components/ReasoningNote/ReasoningNote';

export interface QuizItem {
  question: string;
  options: string[];
  correctIndex: number;
}

export interface QuizProps {
  /** Daftar soal kuis */
  questions?: QuizItem[];
  /** Course ID */
  courseId?: string;
  /** Module title for cache tracking */
  moduleTitle?: string;
  /** Subtopic name */
  subtopic?: string;
  /** Actual subtopic title from database */
  subtopicTitle?: string;
  /** Module index */
  moduleIndex?: number;
  /** Subtopic index */
  subtopicIndex?: number;
}

export default function Quiz({
  questions = [],
  courseId = '',
  moduleTitle = '',
  subtopic = '',
  subtopicTitle = '',
  moduleIndex = 0,
  subtopicIndex = 0,
}: QuizProps) {
  const safeItems = questions;
  const { user } = useAuth();
  
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>(
    safeItems.map(() => null)
  );
  const [reasoningNotes, setReasoningNotes] = useState<string[]>(
    safeItems.map(() => '')
  );
  const [showResults, setShowResults] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSelect = (qIndex: number, optIndex: number) => {
    if (showResults) return;
    const updated = [...selectedAnswers];
    updated[qIndex] = optIndex;
    setSelectedAnswers(updated);
  };

  const handleReasoningChange = (qIndex: number, value: string) => {
    const updated = [...reasoningNotes];
    updated[qIndex] = value;
    setReasoningNotes(updated);
  };

  const handleCheck = async () => {
    setShowResults(true);
    
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
    
    const score = Math.round((correctCount / safeItems.length) * 100);
    
    if (user?.id && courseId) {
      await submitQuizToServer(answers, score);
    }
  };
  
  const submitQuizToServer = async (answers: any[], score: number) => {
    if (submitted || !user?.id) return;
    
    try {
      setLoading(true);
      const response = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
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
          reasoningNotes,
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        setSubmitted(true);
        console.log('Quiz attempt saved successfully:', result.message);
      } else {
        const errorResult = await response.json();
        console.error('Failed to save quiz attempt:', errorResult);
      }
    } catch (error) {
      console.error('Error saving quiz attempt:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!safeItems.length) {
    return (
      <section className={styles.quizSection}>
        <h3 className={styles.quizHeader}>Quiz Time!</h3>
        <div className={styles.noQuizMessage}>
          <p>Quiz sedang disiapkan untuk subtopik ini. Silakan lanjut ke bagian selanjutnya atau kembali lagi nanti.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.quizSection}>
      <h3 className={styles.quizHeader}>Quiz Time!</h3>
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
          {/* Reasoning Note — muncul setelah siswa memilih jawaban */}
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
      <button
        type="button"
        onClick={handleCheck}
        disabled={selectedAnswers.some((ans) => ans === null) || showResults || loading}
        className={styles.checkButton}
      >
        {loading ? 'Saving...' : (showResults ? 'Done' : 'Check Result')}
      </button>
    </section>
  );
}
