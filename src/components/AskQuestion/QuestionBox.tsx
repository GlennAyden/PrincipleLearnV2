// src/components/AskQuestion/QuestionBox.tsx
import React, { useState } from 'react';
import styles from './QuestionBox.module.scss';
import { useLocalStorage } from '@/hooks/useLocalStorage';

interface QuestionBoxProps {
  context: string;
  onAnswer: (question: string, answer: string) => void;
  courseId?: string;
  subtopic?: string;
}

export default function QuestionBox({ context, onAnswer, courseId = '', subtopic = '' }: QuestionBoxProps) {
  const [question, setQuestion] = useState('');
  const [loading, setLoading] = useState(false);
  const [user] = useLocalStorage<{ email: string } | null>('pl_user', null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = question.trim();
    if (!trimmed) return;
    setLoading(true);
    try {
      const res = await fetch('/api/ask-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          question: trimmed, 
          context,
          userId: user?.email || '',
          courseId,
          subtopic
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
