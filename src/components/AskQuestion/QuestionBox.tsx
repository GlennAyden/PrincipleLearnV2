// src/components/AskQuestion/QuestionBox.tsx
import React, { useState } from 'react';
import styles from './QuestionBox.module.scss';
import { useAuth } from '@/hooks/useAuth';
import PromptBuilder, { PromptComponents } from '@/components/PromptBuilder/PromptBuilder';

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
  const [loading, setLoading] = useState(false);
  const { user } = useAuth();

  const handleSubmit = async (fullPrompt: string, components: PromptComponents) => {
    if (!fullPrompt.trim()) return;
    if (!user?.id) {
      console.warn('AskQuestion submission blocked: user not authenticated');
      onAnswer(fullPrompt, 'You must be logged in to ask a question.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/ask-question', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: fullPrompt,
          context,
          userId: user.id,
          courseId,
          subtopic,
          moduleIndex,
          subtopicIndex,
          pageNumber,
          promptComponents: components,
          reasoningNote: components.reasoning || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to fetch answer');
      onAnswer(fullPrompt, data.answer);
    } catch (err: any) {
      console.error('AskQuestion error:', err);
      onAnswer(fullPrompt, `Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.questionBoxContainer}>
      <PromptBuilder
        onSubmit={handleSubmit}
        loading={loading}
        courseContext={context}
      />
    </div>
  );
}
