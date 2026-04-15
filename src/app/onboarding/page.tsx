// src/app/onboarding/page.tsx
'use client';
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.scss';
import { useAuth } from '@/hooks/useAuth';

const STEPS = ['Identitas', 'Gaya Belajar', 'Tujuan'];

const EXPERIENCE_OPTIONS = [
  { value: 'none', icon: '🌱', label: 'Belum pernah', desc: 'Baru pertama kali belajar pemrograman' },
  { value: 'beginner', icon: '🌿', label: 'Pemula', desc: 'Pernah belajar sedikit (< 6 bulan)' },
  { value: 'intermediate', icon: '🌳', label: 'Menengah', desc: 'Sudah punya pengalaman (6-24 bulan)' },
  { value: 'advanced', icon: '🏔️', label: 'Mahir', desc: 'Berpengalaman (> 2 tahun)' },
];

const STYLE_OPTIONS = [
  { value: 'visual', icon: '👁️', label: 'Visual', desc: 'Lebih mudah paham lewat gambar, diagram, dan video' },
  { value: 'reading', icon: '📖', label: 'Membaca', desc: 'Suka membaca penjelasan tertulis yang detail' },
  { value: 'practice', icon: '⌨️', label: 'Praktik', desc: 'Belajar paling baik dengan langsung mencoba kode' },
  { value: 'discussion', icon: '💬', label: 'Diskusi', desc: 'Lebih paham lewat tanya-jawab dan berdiskusi' },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();

  const [step, setStep] = useState(0);
  const [displayName, setDisplayName] = useState('');
  const [experience, setExperience] = useState('');
  const [learningStyle, setLearningStyle] = useState('');
  const [goals, setGoals] = useState('');
  const [challenges, setChallenges] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Redirect if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // Check if profile already exists
  useEffect(() => {
    if (!user?.id) return;
    fetch(`/api/learning-profile?userId=${user.id}`)
      .then(r => r.json())
      .then(data => {
        if (data.exists) {
          // Backfill the middleware onboarding cookie for users who already
          // completed onboarding before this gate existed, so they are not
          // bounced back to /onboarding on the next navigation.
          if (typeof document !== 'undefined') {
            const maxAgeSeconds = 60 * 60 * 24 * 365; // 1 year
            const secureFlag =
              typeof window !== 'undefined' && window.location.protocol === 'https:'
                ? '; Secure'
                : '';
            document.cookie = `onboarding_done=true; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureFlag}`;
          }
          router.replace('/dashboard');
        }
      })
      .catch(() => {});
  }, [user?.id, router]);

  const canProceed = () => {
    if (step === 0) return displayName.trim().length >= 2;
    if (step === 1) return experience && learningStyle;
    return true; // Step 2 is optional
  };

  const handleNext = () => {
    if (step < STEPS.length - 1) setStep(step + 1);
    else handleSubmit();
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleSubmit = async () => {
    if (!user?.id || saving) return;
    setSaving(true);
    setError('');

    try {
      // Note: we still send `userId` because the current
      // /api/learning-profile POST handler requires it to match the JWT
      // payload (see src/app/api/learning-profile/route.ts). Once that route
      // is updated to pull the user id from the JWT directly, the `userId`
      // field can be removed from this payload.
      const res = await fetch('/api/learning-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          displayName: displayName.trim(),
          programmingExperience: experience,
          learningStyle,
          learningGoals: goals.trim(),
          challenges: challenges.trim(),
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Failed to save profile');
      }

      // Mark onboarding as done for the middleware onboarding gate.
      // The cookie is intentionally non-HttpOnly so it can be set from the
      // client here. It is a UX signal, NOT a security boundary — the real
      // source of truth is the `learning_profiles` row (and, after the
      // add_users_onboarding_completed.sql migration runs, the
      // `users.onboarding_completed` column). See middleware.ts for the
      // exempt-route list.
      if (typeof document !== 'undefined') {
        const maxAgeSeconds = 60 * 60 * 24 * 365; // 1 year
        const secureFlag =
          typeof window !== 'undefined' && window.location.protocol === 'https:'
            ? '; Secure'
            : '';
        document.cookie = `onboarding_done=true; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureFlag}`;
      }

      // Check if user has courses
      const coursesRes = await fetch(`/api/courses?userId=${encodeURIComponent(user.id)}`);
      const coursesData = await coursesRes.json();

      if (coursesData.success && coursesData.courses?.length > 0) {
        router.replace('/dashboard');
      } else {
        router.replace('/request-course/step1');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return <div className={styles.loadingPage}>Loading...</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.logoGroup}>
          <div className={styles.logoIcon}>
            <svg width="32" height="32" viewBox="0 0 28 28" fill="none">
              <rect width="28" height="28" rx="8" fill="url(#obGrad)" />
              <path d="M8 14L12 18L20 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="obGrad" x1="0" y1="0" x2="28" y2="28">
                  <stop stopColor="#3b82f6" /><stop offset="1" stopColor="#1d4ed8" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <span className={styles.logoText}>PrincipleLearn</span>
        </div>

        <h1 className={styles.title}>Kenali Dirimu 🎯</h1>
        <p className={styles.subtitle}>
          Bantu kami menyesuaikan pengalaman belajar untukmu
        </p>

        {/* Progress Steps */}
        <div className={styles.steps}>
          {STEPS.map((s, i) => (
            <div key={s} className={`${styles.stepDot} ${i <= step ? styles.stepActive : ''} ${i < step ? styles.stepDone : ''}`}>
              <span className={styles.stepNumber}>{i < step ? '✓' : i + 1}</span>
              <span className={styles.stepLabel}>{s}</span>
            </div>
          ))}
        </div>

        {/* Step Content */}
        <div className={styles.stepContent}>
          {step === 0 && (
            <div className={styles.stepPanel}>
              <label className={styles.fieldLabel}>Nama Panggilan</label>
              <input
                className={styles.textInput}
                type="text"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder="Contoh: Budi, Sarah, dll."
                autoFocus
                maxLength={50}
              />
              <p className={styles.fieldHint}>
                Nama ini akan digunakan di dalam aplikasi
              </p>
            </div>
          )}

          {step === 1 && (
            <div className={styles.stepPanel}>
              <label className={styles.fieldLabel}>Pengalaman Pemrograman</label>
              <div className={styles.optionGrid}>
                {EXPERIENCE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.optionCard} ${experience === opt.value ? styles.optionSelected : ''}`}
                    onClick={() => setExperience(opt.value)}
                  >
                    <span className={styles.optionIcon}>{opt.icon}</span>
                    <span className={styles.optionLabel}>{opt.label}</span>
                    <span className={styles.optionDesc}>{opt.desc}</span>
                  </button>
                ))}
              </div>

              <label className={styles.fieldLabel} style={{ marginTop: '1rem' }}>
                Gaya Belajar Favorit
              </label>
              <div className={styles.optionGrid}>
                {STYLE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`${styles.optionCard} ${learningStyle === opt.value ? styles.optionSelected : ''}`}
                    onClick={() => setLearningStyle(opt.value)}
                  >
                    <span className={styles.optionIcon}>{opt.icon}</span>
                    <span className={styles.optionLabel}>{opt.label}</span>
                    <span className={styles.optionDesc}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.stepPanel}>
              <label className={styles.fieldLabel}>Apa tujuan belajarmu? (opsional)</label>
              <textarea
                className={styles.textArea}
                value={goals}
                onChange={e => setGoals(e.target.value)}
                placeholder="Contoh: Ingin bisa membuat website sendiri, memahami algoritma untuk karir..."
                rows={3}
              />

              <label className={styles.fieldLabel} style={{ marginTop: '0.85rem' }}>
                Apa tantangan terbesarmu dalam belajar? (opsional)
              </label>
              <textarea
                className={styles.textArea}
                value={challenges}
                onChange={e => setChallenges(e.target.value)}
                placeholder="Contoh: Sulit memahami konsep abstrak, kurang waktu untuk latihan..."
                rows={3}
              />
            </div>
          )}
        </div>

        {error && <p className={styles.errorMsg}>⚠️ {error}</p>}

        {/* Navigation */}
        <div className={styles.navButtons}>
          {step > 0 && (
            <button type="button" className={styles.backBtn} onClick={handleBack}>
              ← Kembali
            </button>
          )}
          <button
            type="button"
            className={styles.nextBtn}
            onClick={handleNext}
            disabled={!canProceed() || saving}
          >
            {saving ? 'Menyimpan...' : step === STEPS.length - 1 ? '🚀 Mulai Belajar' : 'Lanjut →'}
          </button>
        </div>
      </div>
    </div>
  );
}
