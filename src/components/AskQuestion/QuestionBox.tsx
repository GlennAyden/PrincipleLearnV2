// src/components/AskQuestion/QuestionBox.tsx
import React, { useState, useCallback } from 'react';
import styles from './QuestionBox.module.scss';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch, readStream } from '@/lib/api-client';
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
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const { user } = useAuth();

  const handleSubmit = useCallback(async (fullPrompt: string, components: PromptComponents) => {
    if (!fullPrompt.trim()) return;
    if (!user?.id) {
      console.warn('AskQuestion submission blocked: user not authenticated');
      onAnswer(fullPrompt, 'You must be logged in to ask a question.');
      return;
    }

    setLoading(true);
    setStreamingAnswer('');
    try {
      const res = await apiFetch('/api/ask-question', {
        method: 'POST',
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

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to fetch answer');
      }

      // Read streaming response with progressive display
      let finalAnswer: string;
      const contentType = res.headers.get('content-type') || '';

      if (contentType.includes('text/plain') && res.body) {
        finalAnswer = await readStream(res, setStreamingAnswer);
        setStreamingAnswer('');
      } else {
        const data = await res.json();
        finalAnswer = data.answer;
      }

      onAnswer(fullPrompt, finalAnswer);

      // Persist a transcript snapshot so admin can review QnA trails.
      if (courseId && subtopic) {
        apiFetch('/api/transcript/save', {
          method: 'POST',
          body: JSON.stringify({
            userId: user.id,
            courseId,
            subtopic,
            question: fullPrompt,
            answer: finalAnswer,
          }),
        }).catch((transcriptErr) => {
          console.error('Transcript save error:', transcriptErr);
        });
      }
    } catch (err: any) {
      console.error('AskQuestion error:', err);
      setStreamingAnswer('');
      onAnswer(fullPrompt, `Error: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [context, onAnswer, user, courseId, subtopic, moduleIndex, subtopicIndex, pageNumber]);

  return (
    <div className={styles.questionBoxContainer}>
      {streamingAnswer && (
        <div className={styles.streamingAnswer}>{streamingAnswer}</div>
      )}
      <PromptBuilder
        onSubmit={handleSubmit}
        loading={loading}
        courseContext={context}
      />
    </div>
  );
}
