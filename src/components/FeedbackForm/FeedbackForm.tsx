// src/components/FeedbackForm/FeedbackForm.tsx

'use client';
import React, { useState } from 'react';
import styles from './FeedbackForm.module.scss';
import { useLocalStorage } from '@/hooks/useLocalStorage';

export interface FeedbackFormProps {
  /** ID subtopik untuk attribut feedback */
  subtopicId: string;
  /** Indeks modul tempat subtopik ini berada */
  moduleIndex: number;
  /** Indeks subtopik dalam modul */
  subtopicIndex: number;
  /** Course ID jika tersedia */
  courseId?: string;
}

export default function FeedbackForm({
  subtopicId,
  moduleIndex,
  subtopicIndex,
  courseId = '',
}: FeedbackFormProps) {
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [user] = useLocalStorage<{ email: string } | null>('pl_user', null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedback.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subtopicId,
          moduleIndex,
          subtopicIndex,
          feedback: feedback.trim(),
          userId: user?.email || '',
          courseId,
        }),
      });
      setSuccess(true);
      setFeedback('');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className={styles.successMessage}>
        Terima kasih atas feedback Anda!
      </div>
    );
  }

  return (
    <form className={styles.feedbackForm} onSubmit={handleSubmit}>
      <h4 className={styles.header}>Feedback terkait subtopik</h4>
      <textarea
        className={styles.textarea}
        placeholder="Tulis feedback Anda di sini..."
        value={feedback}
        onChange={(e) => setFeedback(e.target.value)}
        disabled={loading}
      />
      {error && <p className={styles.error}>{error}</p>}
      <button
        type="submit"
        className={styles.submitButton}
        disabled={loading || !feedback.trim()}
      >
        {loading ? 'Mengirim...' : 'Submit Feedback'}
      </button>
    </form>
  );
}
