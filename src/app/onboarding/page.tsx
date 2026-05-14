// src/app/onboarding/page.tsx
'use client';
import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.scss';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import LanguageToggle from '@/components/LanguageToggle/LanguageToggle';
import { useLocale } from '@/context/LocaleContext';
import type { DictKey } from '@/lib/i18n/dict';

function buildSteps(t: (key: DictKey) => string): string[] {
  return [
    t('onboarding_step_identity'),
    t('onboarding_step_style'),
    t('onboarding_step_goals'),
  ];
}

interface OptionEntry {
  value: string;
  icon: string;
  label: string;
  desc: string;
}

function buildExperienceOptions(t: (key: DictKey) => string): OptionEntry[] {
  return [
    { value: 'none', icon: '🌱', label: t('onboarding_experience_none_label'), desc: t('onboarding_experience_none_desc') },
    { value: 'beginner', icon: '🌿', label: t('onboarding_experience_beginner_label'), desc: t('onboarding_experience_beginner_desc') },
    { value: 'intermediate', icon: '🌳', label: t('onboarding_experience_intermediate_label'), desc: t('onboarding_experience_intermediate_desc') },
    { value: 'advanced', icon: '🏔️', label: t('onboarding_experience_advanced_label'), desc: t('onboarding_experience_advanced_desc') },
  ];
}

function buildStyleOptions(t: (key: DictKey) => string): OptionEntry[] {
  return [
    { value: 'visual', icon: '👁️', label: t('onboarding_style_visual_label'), desc: t('onboarding_style_visual_desc') },
    { value: 'reading', icon: '📖', label: t('onboarding_style_reading_label'), desc: t('onboarding_style_reading_desc') },
    { value: 'practice', icon: '⌨️', label: t('onboarding_style_practice_label'), desc: t('onboarding_style_practice_desc') },
    { value: 'discussion', icon: '💬', label: t('onboarding_style_discussion_label'), desc: t('onboarding_style_discussion_desc') },
  ];
}

export default function OnboardingPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { t } = useLocale();

  const STEPS = useMemo(() => buildSteps(t), [t]);
  const EXPERIENCE_OPTIONS = useMemo(() => buildExperienceOptions(t), [t]);
  const STYLE_OPTIONS = useMemo(() => buildStyleOptions(t), [t]);

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
    apiFetch(`/api/learning-profile?userId=${user.id}`, { cache: 'no-store' })
      .then(r => r.json())
      .then(async data => {
        if (!data.exists) return;
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

        // If the user has already seen the intro slides, send them to the
        // dashboard; otherwise route through /onboarding/intro first.
        try {
          const stateRes = await apiFetch('/api/onboarding-state', { cache: 'no-store' });
          const stateData = await stateRes.json();
          if (stateData?.success && stateData.state?.introSlidesCompleted) {
            router.replace('/dashboard');
          } else {
            router.replace('/onboarding/intro');
          }
        } catch {
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
      const res = await apiFetch('/api/learning-profile', {
        method: 'POST',
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

      // Profile saved — always route through the intro slide deck next. The
      // intro page itself decides whether to continue to the dashboard or to
      // /request-course/step1 based on whether the user already has courses.
      router.replace('/onboarding/intro');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setSaving(false);
    }
  };

  if (authLoading) {
    return <div className={styles.loadingPage}>{t('onboarding_loading')}</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <div className={styles.languageToggleWrap}>
        <LanguageToggle />
      </div>

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

        <h1 className={styles.title}>{t('onboarding_title')}</h1>
        <p className={styles.subtitle}>
          {t('onboarding_subtitle')}
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
              <label className={styles.fieldLabel}>{t('onboarding_display_name_label')}</label>
              <input
                className={styles.textInput}
                type="text"
                inputMode="text"
                autoComplete="given-name"
                autoCapitalize="words"
                value={displayName}
                onChange={e => setDisplayName(e.target.value)}
                placeholder={t('onboarding_display_name_placeholder')}
                autoFocus
                maxLength={50}
              />
              <p className={styles.fieldHint}>
                {t('onboarding_display_name_hint')}
              </p>
            </div>
          )}

          {step === 1 && (
            <div className={styles.stepPanel}>
              <label className={styles.fieldLabel}>{t('onboarding_experience_label')}</label>
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
                {t('onboarding_style_label')}
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
              <label className={styles.fieldLabel}>{t('onboarding_goals_label')}</label>
              <textarea
                className={styles.textArea}
                value={goals}
                onChange={e => setGoals(e.target.value)}
                placeholder={t('onboarding_goals_placeholder')}
                rows={3}
              />

              <label className={styles.fieldLabel} style={{ marginTop: '0.85rem' }}>
                {t('onboarding_challenges_label')}
              </label>
              <textarea
                className={styles.textArea}
                value={challenges}
                onChange={e => setChallenges(e.target.value)}
                placeholder={t('onboarding_challenges_placeholder')}
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
              {t('onboarding_back')}
            </button>
          )}
          <button
            type="button"
            className={styles.nextBtn}
            onClick={handleNext}
            disabled={!canProceed() || saving}
          >
            {saving ? t('onboarding_saving') : step === STEPS.length - 1 ? t('onboarding_finish') : t('onboarding_next')}
          </button>
        </div>
      </div>
    </div>
  );
}
