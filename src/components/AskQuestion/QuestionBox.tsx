// src/components/AskQuestion/QuestionBox.tsx
import React, { useState } from 'react';
import styles from './QuestionBox.module.scss';
import { useAuth } from '@/hooks/useAuth';

interface QuestionBoxProps {
  context: string;
  onAnswer: (question: string, answer: string) => void;
  courseId?: string;
  subtopic?: string;
  moduleIndex?: number;
  subtopicIndex?: number;
  pageNumber?: number;
}

export default function QuestionBox({
  context,
  onAnswer,
  courseId = '',
  subtopic = '',
  moduleIndex = 0,
  subtopicIndex = 0,
  pageNumber = 0,
}: QuestionBoxProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    if (!user?.id) {
      console.warn('AskQuestion submission blocked: user not authenticated');
      onAnswer(trimmed, 'You must be logged in to ask a question.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/ask-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: trimmed,
          context,
          userId: user.id,
          courseId,
          subtopic,
          moduleIndex,
          subtopicIndex,
          pageNumber,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch answer');
      onAnswer(trimmed, data.answer);
      setQuestion('');
    } catch (err: any) {
      console.error('AskQuestion error:', err);
      onAnswer(trimmed, `Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.questionBoxContainer}>
      <form className={styles.questionForm} onSubmit={handleSubmit}>
        <div className={styles.inputContainer}>
          <input
            type="text"
            className={styles.inputField}
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask anything you want"
            disabled={loading}
          />
          <button
            type="submit"
            className={styles.enterButton}
            disabled={loading || !question.trim()}
          >
            Enter
          </button>
        </div>
      </form>
    </div>
  );
}
