// src/components/Quiz/Quiz.tsx
import React, { useState, useEffect } from 'react';
import styles from './Quiz.module.scss';
import { useLocalStorage } from '@/hooks/useLocalStorage';

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
}

export default function Quiz({ questions = [], courseId = '', subtopic = '' }: QuizProps) {
  // gunakan safeItems untuk mencegah undefined
  const safeItems = questions;
  // Get user from localStorage
  const [user] = useLocalStorage<{ email: string } | null>('pl_user', null);
  
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
    if (user?.email && courseId && subtopic) {
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
          score,
          answers
        }),
      });
      
      if (response.ok) {
        setSubmitted(true);
        console.log('Quiz attempt saved successfully');
      } else {
        console.error('Failed to save quiz attempt');
      }
    } catch (error) {
      console.error('Error saving quiz attempt:', error);
    } finally {
      setLoading(false);
    }
  };

  // jika tidak ada soal, jangan render apa-apa atau tampilkan pesan
  if (!safeItems.length) return null;

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
