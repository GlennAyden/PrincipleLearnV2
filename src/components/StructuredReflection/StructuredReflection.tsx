// src/components/StructuredReflection/StructuredReflection.tsx
'use client';

import React, { useCallback, useEffect, useState } from 'react';
import styles from './StructuredReflection.module.scss';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';

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

const REFLECTION_FIELDS = [
  {
    key: 'understood' as const,
    icon: '1',
    title: 'Apa yang Saya Pahami',
    question: 'Apa hal utama yang saya pahami hari ini?',
    placeholder: 'Contoh: Saya sekarang mengerti bahwa loop while terus berjalan selama kondisinya benar...',
  },
  {
    key: 'confused' as const,
    icon: '2',
    title: 'Yang Masih Membingungkan',
    question: 'Apa yang masih salah atau membingungkan?',
    placeholder: 'Contoh: Saya masih bingung kapan harus memilih for vs while loop...',
  },
  {
    key: 'strategy' as const,
    icon: '3',
    title: 'Strategi ke Depan',
    question: 'Apa strategi belajar saya selanjutnya?',
    placeholder: 'Contoh: Saya akan mencoba membuat 3 program kecil yang menggunakan kedua jenis loop...',
  },
  {
    key: 'promptEvolution' as const,
    icon: '4',
    title: 'Evolusi Cara Bertanya',
    question: 'Bagaimana cara saya bertanya berubah dari sesi sebelumnya?',
    placeholder: 'Contoh: Awalnya saya hanya bertanya "apa itu loop", sekarang saya bertanya lebih spesifik...',
  },
];

const STAR_LABELS = ['Kurang', 'Cukup', 'Baik', 'Sangat Baik', 'Luar Biasa'];

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
            : 'Gagal memuat status refleksi',
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
      setError(err instanceof Error ? err.message : 'Gagal memuat status refleksi');
    } finally {
      setStatusLoading(false);
    }
  }, [courseId, moduleIndex, subtopic, subtopicId, subtopicIndex, subtopicLabel]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  const updateField = (key: keyof ReflectionData, value: string) => {
    setReflection((prev) => ({ ...prev, [key]: value }));
    setSavedMessage('');
  };

  const filledCount = REFLECTION_FIELDS.filter((field) => reflection[field.key].trim()).length;
  const canSubmit =
    REFLECTION_FIELDS.every((field) => reflection[field.key].trim().length > 0) &&
    rating > 0;

  const handleSubmit = async () => {
    if (!canSubmit || loading) {
      setError('Harap isi semua bagian refleksi dan rating sebelum melanjutkan.');
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
        throw new Error(data.error || 'Gagal menyimpan refleksi');
      }

      setHasSubmitted(true);
      setRevisionCount((current) => Math.max(current + 1, 1));
      setSavedMessage(
        hasSubmitted
          ? 'Revisi refleksi berhasil tersimpan.'
          : 'Refleksi berhasil tersimpan. Kamu bisa melanjutkan setelah ini.',
      );
      onSaved?.();
      await loadStatus();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className={styles.reflectionSection}>
      <div className={styles.header}>
        <h3 className={styles.title}>Refleksi & Feedback</h3>
        <p className={styles.subtitle}>
          Semua bagian refleksi wajib diisi. Masukan materi tetap opsional.
        </p>
      </div>

      {statusLoading && (
        <p className={styles.statusMessage}>Memuat refleksi terakhir...</p>
      )}

      {hasSubmitted && (
        <div className={styles.revisionNotice}>
          <strong>Refleksi subtopik ini sudah tersimpan.</strong>
          <span>
            Form ini berisi versi terakhir dan tetap bisa diperbarui sebagai revisi.
            {revisionCount > 1 ? ` Total revisi: ${revisionCount}.` : ''}
          </span>
        </div>
      )}

      {savedMessage && (
        <div className={styles.successMessage}>
          <h3>{savedMessage}</h3>
          <p>Perubahan baru tersimpan di server.</p>
        </div>
      )}

      <div className={styles.ratingSection}>
        <label className={styles.ratingLabel}>
          <span className={styles.ratingIcon}>★</span>
          Seberapa puas kamu dengan materi ini?
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
              title={STAR_LABELS[star - 1]}
            >
              ★
            </button>
          ))}
          {(hoveredStar || rating) > 0 && (
            <span className={styles.starLabel}>
              {STAR_LABELS[(hoveredStar || rating) - 1]}
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
          placeholder="Ada masukan untuk materi ini? (opsional)"
          disabled={loading}
          rows={2}
        />
      </div>

      <div className={styles.reflectionDivider}>
        <span>Refleksi Belajar</span>
        <span className={styles.progressBadge}>{filledCount}/{REFLECTION_FIELDS.length} terisi</span>
      </div>

      <div className={styles.fieldsGrid}>
        {REFLECTION_FIELDS.map((field) => (
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
          Harap isi feedback dulu: empat textarea refleksi dan rating bintang wajib terisi.
        </p>
      )}

      <button
        type="button"
        className={styles.submitButton}
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
      >
        {loading
          ? 'Menyimpan...'
          : hasSubmitted
            ? 'Simpan Revisi'
            : 'Simpan Refleksi & Feedback'}
      </button>
    </section>
  );
}
