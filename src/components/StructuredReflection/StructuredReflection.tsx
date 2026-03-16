// src/components/StructuredReflection/StructuredReflection.tsx
'use client';
import React, { useState } from 'react';
import styles from './StructuredReflection.module.scss';
import { useAuth } from '@/hooks/useAuth';

interface ReflectionData {
  understood: string;
  confused: string;
  strategy: string;
  promptEvolution: string;
}

interface StructuredReflectionProps {
  courseId: string;
  subtopic?: string;
  moduleIndex?: number;
  subtopicIndex?: number;
}

const REFLECTION_FIELDS = [
  {
    key: 'understood' as const,
    icon: '💡',
    title: 'Apa yang Saya Pahami',
    question: 'Apa hal utama yang saya pahami hari ini?',
    placeholder: 'Contoh: Saya sekarang mengerti bahwa loop while terus berjalan selama kondisinya benar...',
  },
  {
    key: 'confused' as const,
    icon: '❓',
    title: 'Yang Masih Membingungkan',
    question: 'Apa yang masih salah atau membingungkan?',
    placeholder: 'Contoh: Saya masih bingung kapan harus memilih for vs while loop...',
  },
  {
    key: 'strategy' as const,
    icon: '🗺️',
    title: 'Strategi ke Depan',
    question: 'Apa strategi belajar saya selanjutnya?',
    placeholder: 'Contoh: Saya akan mencoba membuat 3 program kecil yang menggunakan kedua jenis loop...',
  },
  {
    key: 'promptEvolution' as const,
    icon: '📈',
    title: 'Evolusi Cara Bertanya',
    question: 'Bagaimana cara saya bertanya berubah dari sesi sebelumnya?',
    placeholder: 'Contoh: Awalnya saya hanya bertanya "apa itu loop", sekarang saya sudah bertanya lebih spesifik tentang perbandingan for vs while...',
  },
];

const STAR_LABELS = ['Kurang', 'Cukup', 'Baik', 'Sangat Baik', 'Luar Biasa'];

export default function StructuredReflection({
  courseId,
  subtopic = '',
  moduleIndex = 0,
  subtopicIndex = 0,
}: StructuredReflectionProps) {
  const { user } = useAuth();
  const [reflection, setReflection] = useState<ReflectionData>({
    understood: '',
    confused: '',
    strategy: '',
    promptEvolution: '',
  });

  // Content satisfaction
  const [rating, setRating] = useState<number>(0);
  const [hoveredStar, setHoveredStar] = useState<number>(0);
  const [feedbackText, setFeedbackText] = useState('');

  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const updateField = (key: keyof ReflectionData, value: string) => {
    setReflection(prev => ({ ...prev, [key]: value }));
  };

  const filledCount = REFLECTION_FIELDS.filter(f => reflection[f.key].trim()).length;
  const canSubmit = reflection.understood.trim().length > 0 || rating > 0;

  const handleSubmit = async () => {
    if (!canSubmit || loading || !user?.id) return;

    setLoading(true);
    setError('');

    try {
      // Save structured reflection
      const res = await fetch('/api/jurnal/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          courseId,
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
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Gagal menyimpan refleksi');
      }

      // Save feedback to /api/feedback if rating or feedbackText is provided
      if (rating > 0 || feedbackText.trim()) {
        try {
          await fetch('/api/feedback', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              subtopicId: courseId,
              moduleIndex,
              subtopicIndex,
              feedback: `Rating: ${rating}/5${feedbackText.trim() ? ` | ${feedbackText.trim()}` : ''}`,
              userId: user.email || user.id,
              courseId,
            }),
          });
        } catch {
          // Non-critical, don't block on feedback save failure
        }
      }

      setSubmitted(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <section className={styles.reflectionSection}>
        <div className={styles.successMessage}>
          <span className={styles.successIcon}>✨</span>
          <h3>Refleksi Tersimpan!</h3>
          <p>Terima kasih sudah meluangkan waktu untuk refleksi. Catatan ini akan membantu pengajar memahami perkembangan Anda.</p>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.reflectionSection}>
      <div className={styles.header}>
        <h3 className={styles.title}>📝 Refleksi & Feedback</h3>
        <p className={styles.subtitle}>
          Luangkan waktu sejenak untuk merefleksikan pembelajaran dan berikan penilaianmu.
        </p>
      </div>

      {/* ── Content Satisfaction Rating ── */}
      <div className={styles.ratingSection}>
        <label className={styles.ratingLabel}>
          <span className={styles.ratingIcon}>⭐</span>
          Seberapa puas kamu dengan materi ini?
        </label>
        <div className={styles.starsRow}>
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              type="button"
              className={`${styles.starButton} ${star <= (hoveredStar || rating) ? styles.starActive : ''}`}
              onClick={() => setRating(star)}
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
          onChange={(e) => setFeedbackText(e.target.value)}
          placeholder="Ada masukan untuk materi ini? (opsional)"
          disabled={loading}
          rows={2}
        />
      </div>

      {/* ── Reflection Fields ── */}
      <div className={styles.reflectionDivider}>
        <span>Refleksi Belajar</span>
        <span className={styles.progressBadge}>{filledCount}/{REFLECTION_FIELDS.length} terisi</span>
      </div>

      <div className={styles.fieldsGrid}>
        {REFLECTION_FIELDS.map((field) => (
          <div key={field.key} className={`${styles.fieldCard} ${reflection[field.key].trim() ? styles.filled : ''}`}>
            <label className={styles.fieldLabel}>
              <span className={styles.fieldIcon}>{field.icon}</span>
              <span className={styles.fieldTitle}>{field.title}</span>
            </label>
            <p className={styles.fieldQuestion}>{field.question}</p>
            <textarea
              className={styles.fieldTextarea}
              value={reflection[field.key]}
              onChange={(e) => updateField(field.key, e.target.value)}
              placeholder={field.placeholder}
              disabled={loading}
              rows={3}
            />
          </div>
        ))}
      </div>

      {error && <p className={styles.errorMessage}>⚠️ {error}</p>}

      <button
        type="button"
        className={styles.submitButton}
        onClick={handleSubmit}
        disabled={!canSubmit || loading}
      >
        {loading ? 'Menyimpan...' : '💾 Simpan Refleksi & Feedback'}
      </button>
    </section>
  );
}
