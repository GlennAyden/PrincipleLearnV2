// src/components/StructuredReflection/StructuredReflection.tsx
'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './StructuredReflection.module.scss';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import { useLocale } from '@/context/LocaleContext';
import type { DictKey } from '@/lib/i18n/dict';

interface ReflectionData {
  understood: string;
  confused: string;
  strategy: string;
  promptEvolution: string;
}

interface StructuredReflectionProps {
  courseId: string;
  subtopic?: string;
  // The `subtopics` table row id for the MODULE that contains this leaf
  // subtopic. Required on saves so the backend can scope jurnal + feedback
  // rows per leaf subtopic.
  subtopicId?: string;
  subtopicLabel?: string;
  moduleIndex?: number;
  subtopicIndex?: number;
  onSaved?: () => void;
}

interface ReflectionStatusResponse {
  status?: {
    submitted?: boolean;
    completed?: boolean;
    revisionCount?: number;
    latestSubmittedAt?: string | null;
  };
  latest?: {
    fields?: {
      understood?: string;
      confused?: string;
      strategy?: string;
      promptEvolution?: string;
      contentRating?: number | null;
      contentFeedback?: string;
    };
  } | null;
}

type ReflectionFieldKey = 'understood' | 'confused' | 'strategy' | 'promptEvolution';

interface ReflectionFieldConfig {
  key: ReflectionFieldKey;
  icon: string;
  title: string;
  question: string;
  placeholder: string;
}

function buildReflectionFields(
  t: (key: DictKey) => string,
): ReflectionFieldConfig[] {
  return [
    {
      key: 'understood',
      icon: '1',
      title: t('reflection_understood_title'),
      question: t('reflection_understood_question'),
      placeholder: t('reflection_understood_placeholder'),
    },
    {
      key: 'confused',
      icon: '2',
      title: t('reflection_confused_title'),
      question: t('reflection_confused_question'),
      placeholder: t('reflection_confused_placeholder'),
    },
    {
      key: 'strategy',
      icon: '3',
      title: t('reflection_strategy_title'),
      question: t('reflection_strategy_question'),
      placeholder: t('reflection_strategy_placeholder'),
    },
    {
      key: 'promptEvolution',
      icon: '4',
      title: t('reflection_prompt_evolution_title'),
      question: t('reflection_prompt_evolution_question'),
      placeholder: t('reflection_prompt_evolution_placeholder'),
    },
  ];
}

function buildStarLabels(t: (key: DictKey) => string): string[] {
  return [
    t('reflection_star_low'),
    t('reflection_star_ok'),
    t('reflection_star_good'),
    t('reflection_star_great'),
    t('reflection_star_excellent'),
  ];
}

export default function StructuredReflection({
  courseId,
  subtopic = '',
  subtopicId,
  subtopicLabel,
  moduleIndex = 0,
  subtopicIndex = 0,
  onSaved,
}: StructuredReflectionProps) {
  const { user } = useAuth();
  const { t } = useLocale();
  const reflectionFields = useMemo(() => buildReflectionFields(t), [t]);
  const starLabels = useMemo(() => buildStarLabels(t), [t]);
  const [reflection, setReflection] = useState<ReflectionData>({
    understood: '',
    confused: '',
    strategy: '',
    promptEvolution: '',
  });
  const [rating, setRating] = useState<number>(0);
  const [hoveredStar, setHoveredStar] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState('');
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [revisionCount, setRevisionCount] = useState(0);
  const [statusLoading, setStatusLoading] = useState(false);
  const [savedMessage, setSavedMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const loadStatus = useCallback(async () => {
    if (!courseId) return;

    setStatusLoading(true);
    setError('');

    try {
      const params = new URLSearchParams({
        courseId,
        moduleIndex: String(moduleIndex),
        subtopicIndex: String(subtopicIndex),
      });
      const label = subtopicLabel || subtopic;
      if (subtopicId) params.set('subtopicId', subtopicId);
      if (label) params.set('subtopicLabel', label);

      const res = await apiFetch(`/api/jurnal/status?${params.toString()}`);
      if (!res.ok) {
        const detail = await res.json().catch(() => ({}));
        throw new Error(
          typeof detail?.error === 'string'
            ? detail.error
            : t('reflection_error_load'),
        );
      }

      const data = (await res.json()) as ReflectionStatusResponse;
      const fields = data.latest?.fields;
      setHasSubmitted(Boolean(data.status?.submitted));
      setRevisionCount(data.status?.revisionCount ?? 0);

      if (fields) {
        setReflection({
          understood: fields.understood ?? '',
          confused: fields.confused ?? '',
          strategy: fields.strategy ?? '',
          promptEvolution: fields.promptEvolution ?? '',
        });
        setRating(typeof fields.contentRating === 'number' ? fields.contentRating : 0);
        setFeedbackText(fields.contentFeedback ?? '');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('reflection_error_load'));
    } finally {
      setStatusLoading(false);
    }
  }, [courseId, moduleIndex, subtopic, subtopicId, subtopicIndex, subtopicLabel, t]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const updateField = (key: keyof ReflectionData, value: string) => {
    setReflection((prev) => ({ ...prev, [key]: value }));
    setSavedMessage('');
  };

  const filledCount = reflectionFields.filter((field) => reflection[field.key].trim()).length;
  const canSubmit =
    reflectionFields.every((field) => reflection[field.key].trim().length > 0) &&
    rating > 0;

  const handleSubmit = async () => {
    if (!canSubmit || loading) {
      setError(t('reflection_error_required'));
      return;
    }

    setLoading(true);
    setError('');
    setSavedMessage('');

    try {
      const res = await apiFetch('/api/jurnal/save', {
        method: 'POST',
        body: JSON.stringify({
          userId: user?.id,
          courseId,
          subtopicId,
          subtopicLabel: subtopicLabel || subtopic,
          subtopic,
          moduleIndex,
          subtopicIndex,
          type: 'structured_reflection',
          content: JSON.stringify({
            ...reflection,
            contentRating: rating,
            contentFeedback: feedbackText.trim(),
          }),
          understood: reflection.understood,
          confused: reflection.confused,
          strategy: reflection.strategy,
          promptEvolution: reflection.promptEvolution,
          contentRating: rating,
          contentFeedback: feedbackText.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || t('reflection_error_save'));
      }

      setHasSubmitted(true);
      setRevisionCount((current) => Math.max(current + 1, 1));
      setSavedMessage(
        hasSubmitted
          ? t('reflection_saved_revision')
          : t('reflection_saved_first'),
      );
      onSaved?.();
      await loadStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('reflection_error_unknown'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.reflectionSection}>
      <div className={styles.header}>
        <h3 className={styles.title}>{t('reflection_title')}</h3>
        <p className={styles.subtitle}>
          {t('reflection_subtitle')}
        </p>
      </div>

      {statusLoading && (
        <p className={styles.statusMessage}>{t('reflection_loading')}</p>
      )}

      {hasSubmitted && (
        <div className={styles.revisionNotice}>
          <strong>{t('reflection_already_submitted')}</strong>
          <span>
            {t('reflection_revision_hint')}
            {revisionCount > 1 ? ` ${t('reflection_revision_count_prefix')}: ${revisionCount}.` : ''}
          </span>
        </div>
      )}

      {savedMessage && (
        <div className={styles.successMessage}>
          <h3>{savedMessage}</h3>
          <p>{t('reflection_saved_subtext')}</p>
        </div>
      )}

      <div className={styles.ratingSection}>
        <label className={styles.ratingLabel}>
          <span className={styles.ratingIcon}>★</span>
          {t('reflection_rating_label')}
        </label>
        <div className={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className={`${styles.starButton} ${star <= (hoveredStar || rating) ? styles.starActive : ''}`}
              onClick={() => {
                setRating(star);
                setSavedMessage('');
              }}
              onMouseEnter={() => setHoveredStar(star)}
              onMouseLeave={() => setHoveredStar(0)}
              disabled={loading}
              title={starLabels[star - 1]}
            >
              ★
            </button>
          ))}
          {(hoveredStar || rating) > 0 && (
            <span className={styles.starLabel}>
              {starLabels[(hoveredStar || rating) - 1]}
            </span>
          )}
        </div>
        <textarea
          className={styles.feedbackTextarea}
          value={feedbackText}
          onChange={(event) => {
            setFeedbackText(event.target.value);
            setSavedMessage('');
          }}
          placeholder={t('reflection_feedback_placeholder')}
          disabled={loading}
          rows={2}
        />
      </div>

      <div className={styles.reflectionDivider}>
        <span>{t('reflection_divider')}</span>
        <span className={styles.progressBadge}>{filledCount}/{reflectionFields.length} {t('reflection_progress_suffix')}</span>
      </div>

      <div className={styles.fieldsGrid}>
        {reflectionFields.map((field) => (
          <div
            key={field.key}
            className={`${styles.fieldCard} ${reflection[field.key].trim() ? styles.filled : ''}`}
          >
            <label className={styles.fieldLabel}>
              <span className={styles.fieldIcon}>{field.icon}</span>
              <span className={styles.fieldTitle}>{field.title}</span>
            </label>
            <p className={styles.fieldQuestion}>{field.question}</p>
            <textarea
              className={styles.fieldTextarea}
              value={reflection[field.key]}
              onChange={(event) => updateField(field.key, event.target.value)}
              placeholder={field.placeholder}
              disabled={loading}
              rows={3}
            />
          </div>
        ))}
      </div>

      {error && <p className={styles.errorMessage}>{error}</p>}

      {!canSubmit && (
        <p className={styles.requiredMessage}>
          {t('reflection_missing_hint')}
        </p>
      )}

      <button
        type="button"
        className={styles.submitButton}
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
      >
        {loading
          ? t('reflection_button_loading')
          : hasSubmitted
            ? t('reflection_button_save_revision')
            : t('reflection_button_save_first')}
      </button>
    </section>
  );
}
