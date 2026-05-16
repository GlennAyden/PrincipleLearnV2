// src/components/AskQuestion/QuestionBox.tsx
'use client';
import React, { useState, useCallback } from 'react';
import styles from './QuestionBox.module.scss';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch, readStream } from '@/lib/api-client';
import PromptBuilder, { PromptComponents } from '@/components/PromptBuilder/PromptBuilder';
import { useLocale } from '@/context/LocaleContext';

interface QuestionBoxProps {
  context: string;
  onAnswer: (question: string, answer: string) => void;
  courseId?: string;
  subtopic?: string;
  moduleIndex?: number;
  subtopicIndex?: number;
  pageNumber?: number;
  /**
   * MVR Item 7 — when 'research' the Hint Tier button is rendered after each
   * answer so the student can request a more directive AI response. Default
   * 'general' keeps backward compat (button hidden).
   */
  courseMode?: 'general' | 'research';
}

type ScaffoldTier = 1 | 2 | 3;
const TIER_LABEL: Record<ScaffoldTier, string> = {
  1: 'Tier 1 · Diagnostik',
  2: 'Tier 2 · Hint terarah',
  3: 'Tier 3 · Solusi penuh',
};

export default function QuestionBox({
  context,
  onAnswer,
  courseId = '',
  subtopic = '',
  moduleIndex = 0,
  subtopicIndex = 0,
  pageNumber = 0,
  courseMode = 'general',
}: QuestionBoxProps) {
  const [loading, setLoading] = useState(false);
  const [streamingAnswer, setStreamingAnswer] = useState('');
  const [currentTier, setCurrentTier] = useState<ScaffoldTier>(1);
  const [lastQuestion, setLastQuestion] = useState<{ prompt: string; components: PromptComponents } | null>(null);
  const [hasAnswered, setHasAnswered] = useState(false);
  const { user } = useAuth();
  const { t } = useLocale();

  const isResearchMode = courseMode === 'research';

  const submitWithTier = useCallback(async (fullPrompt: string, components: PromptComponents, tier: ScaffoldTier) => {
    if (!fullPrompt.trim()) return;
    if (!user?.id) {
      console.warn('AskQuestion submission blocked: user not authenticated');
      onAnswer(fullPrompt, t('ask_question_must_login'));
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
          scaffoldTier: tier,
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
      setHasAnswered(true);
    } catch (err: unknown) {
      console.error('AskQuestion error:', err);
      setStreamingAnswer('');
      onAnswer(fullPrompt, `Error: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  }, [context, onAnswer, user, courseId, subtopic, moduleIndex, subtopicIndex, pageNumber, t]);

  const handleSubmit = useCallback(async (fullPrompt: string, components: PromptComponents) => {
    // New question resets the tier ladder.
    setCurrentTier(1);
    setLastQuestion({ prompt: fullPrompt, components });
    setHasAnswered(false);
    await submitWithTier(fullPrompt, components, 1);
  }, [submitWithTier]);

  const handleRequestNextHint = useCallback(async () => {
    if (!lastQuestion || currentTier >= 3 || loading) return;
    const nextTier = (currentTier + 1) as ScaffoldTier;
    setCurrentTier(nextTier);
    await submitWithTier(lastQuestion.prompt, lastQuestion.components, nextTier);
  }, [lastQuestion, currentTier, loading, submitWithTier]);

  return (
    <div className={styles.questionBoxContainer}>
      {isResearchMode && lastQuestion && hasAnswered && (
        <div className={styles.tierStatus}>
          <span className={styles.tierBadge} data-tier={currentTier}>
            {TIER_LABEL[currentTier]}
          </span>
          {currentTier < 3 && (
            <button
              type="button"
              className={styles.tierButton}
              onClick={handleRequestNextHint}
              disabled={loading}
            >
              Minta Hint Berikutnya →
            </button>
          )}
        </div>
      )}
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
