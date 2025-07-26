// src/components/Quiz/Quiz.tsx
import React, { useState, useEffect } from 'react';
import styles from './Quiz.module.scss';
import { useAuth } from '@/hooks/useAuth';

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
  /** Subtopic name */
  subtopic?: string;
  /** Actual subtopic title from database */
  subtopicTitle?: string;
  /** Module index */
  moduleIndex?: number;
  /** Subtopic index */
  subtopicIndex?: number;
}

export default function Quiz({ questions = [], courseId = '', subtopic = '', subtopicTitle = '', moduleIndex = 0, subtopicIndex = 0 }: QuizProps) {
  // gunakan safeItems untuk mencegah undefined
  const safeItems = questions;
  // Get user from auth hook
  const { user } = useAuth();
  
  // state untuk jawaban yang dipilih per soal (null = belum menjawab)
  const [selectedAnswers, setSelectedAnswers] = useState<(number | null)[]>(
    safeItems.map(() => null)
  );
  // apakah hasil sudah dicek?
  const [showResults, setShowResults] = useState(false);
  // flag jika hasil sudah disimpan ke server
  const [submitted, setSubmitted] = useState(false);
  // loading state
  const [loading, setLoading] = useState(false);

  // handle pilihan user
  const handleSelect = (qIndex: number, optIndex: number) => {
    if (showResults) return;
    const updated = [...selectedAnswers];
    updated[qIndex] = optIndex;
    setSelectedAnswers(updated);
  };

  // setelah klik Check Result
  const handleCheck = async () => {
    setShowResults(true);
    
    // Hitung score
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
        questionIndex: index
      };
    });
    
    const score = Math.round((correctCount / safeItems.length) * 100);
    
    // Jika user, courseId, dan subtopic tersedia, simpan ke database
    if (user?.email && courseId) {
      await submitQuizToServer(answers, score);
    }
  };
  
  // Submit quiz hasil ke server
  const submitQuizToServer = async (answers: any[], score: number) => {
    if (submitted || !user?.email) return;
    
    try {
      setLoading(true);
      const response = await fetch('/api/quiz/submit', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.email,
          courseId,
          subtopic,
          subtopicTitle,
          moduleIndex,
          subtopicIndex,
          score,
          answers
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        setSubmitted(true);
        console.log('Quiz attempt saved successfully:', result.message);
        console.log('Matching details:', result.details);
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

  // jika tidak ada soal, tampilkan pesan loading atau fallback
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
