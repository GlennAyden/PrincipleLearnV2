// src/app/onboarding/intro/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.scss';
import { useAuth } from '@/hooks/useAuth';
import { useOnboardingState } from '@/hooks/useOnboardingState';
import { apiFetch } from '@/lib/api-client';
import LanguageToggle from '@/components/LanguageToggle/LanguageToggle';
import { useLocale } from '@/context/LocaleContext';
import type { DictKey } from '@/lib/i18n/dict';

interface SlideConfig {
  emoji: string;
  title: string;
  body: string;
  bullets?: string[];
}

function buildSlides(t: (key: DictKey) => string): SlideConfig[] {
  return [
    {
      emoji: '👋',
      title: t('intro_slide1_title'),
      body: t('intro_slide1_body'),
    },
    {
      emoji: '🧠',
      title: t('intro_slide2_title'),
      body: t('intro_slide2_body'),
      bullets: [
        t('intro_slide2_bullet1'),
        t('intro_slide2_bullet2'),
        t('intro_slide2_bullet3'),
        t('intro_slide2_bullet4'),
      ],
    },
    {
      emoji: '🗺️',
      title: t('intro_slide3_title'),
      body: t('intro_slide3_body'),
      bullets: [
        t('intro_slide3_bullet1'),
        t('intro_slide3_bullet2'),
        t('intro_slide3_bullet3'),
        t('intro_slide3_bullet4'),
      ],
    },
    {
      emoji: '🚀',
      title: t('intro_slide4_title'),
      body: t('intro_slide4_body'),
    },
  ];
}

export default function OnboardingIntroPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { state, loading: stateLoading, markCompleted } = useOnboardingState(isAuthenticated);
  const { t } = useLocale();

  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const slides = useMemo(() => buildSlides(t), [t]);
  const lastIndex = slides.length - 1;
  const slide = slides[index];

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // If the user already finished the intro in a previous session (server flag
  // says so), skip straight through — but also BACKFILL the `intro_slides_done`
  // cookie so the middleware stops redirecting them back here on every
  // navigation. This is the path that recovers users whose DB flag is true but
  // who cleared cookies / switched browsers.
  useEffect(() => {
    if (!stateLoading && state?.introSlidesCompleted) {
      setIntroSlidesCookie();
      routeAfterIntro();
    }
  }, [stateLoading, state?.introSlidesCompleted]);

  function setIntroSlidesCookie() {
    if (typeof document === 'undefined') return;
    const maxAgeSeconds = 60 * 60 * 24 * 365; // 1 year
    const secureFlag =
      typeof window !== 'undefined' && window.location.protocol === 'https:'
        ? '; Secure'
        : '';
    document.cookie = `intro_slides_done=true; Path=/; Max-Age=${maxAgeSeconds}; SameSite=Lax${secureFlag}`;
  }

  async function routeAfterIntro() {
    if (!user?.id) {
      router.replace('/dashboard');
      return;
    }
    try {
      const res = await apiFetch(`/api/courses?userId=${encodeURIComponent(user.id)}`, {
        cache: 'no-store',
      });
      const data = await res.json();
      if (data?.success && Array.isArray(data.courses) && data.courses.length > 0) {
        router.replace('/dashboard');
      } else {
        router.replace('/request-course/step1');
      }
    } catch {
      router.replace('/dashboard');
    }
  }

  async function finish() {
    if (finishing) return;
    setFinishing(true);
    // Set the cookie up-front so the middleware gate stops firing even if the
    // POST below is slow or fails. The DB flag remains the authoritative
    // value; the cookie is only a UX short-circuit for the next navigation.
    setIntroSlidesCookie();
    await markCompleted('intro_slides');
    await routeAfterIntro();
  }

  function handleNext() {
    if (index < lastIndex) setIndex(index + 1);
    else finish();
  }

  function handleBack() {
    if (index > 0) setIndex(index - 1);
  }

  if (authLoading || stateLoading) {
    return <div className={styles.loadingPage}>{t('intro_loading')}</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <div className={styles.languageToggleWrap}>
        <LanguageToggle />
      </div>

      <button
        type="button"
        className={styles.skipBtn}
        onClick={finish}
        disabled={finishing}
      >
        {t('intro_skip')}
      </button>

      <div className={styles.card}>
        <div className={styles.emoji} aria-hidden="true">{slide.emoji}</div>

        <h1 className={styles.title}>{slide.title}</h1>
        <p className={styles.body}>{slide.body}</p>

        {slide.bullets && (
          <ul className={styles.bullets}>
            {slide.bullets.map((b) => (
              <li key={b}>{b}</li>
            ))}
          </ul>
        )}

        <div className={styles.dots} role="tablist" aria-label={t('intro_progress_label')}>
          {slides.map((_, i) => (
            <span
              key={i}
              role="tab"
              aria-selected={i === index}
              className={`${styles.dot} ${i === index ? styles.dotActive : ''} ${i < index ? styles.dotDone : ''}`}
            />
          ))}
        </div>

        <div className={styles.nav}>
          {index > 0 ? (
            <button type="button" className={styles.backBtn} onClick={handleBack}>
              {t('intro_back')}
            </button>
          ) : (
            <span />
          )}
          <button
            type="button"
            className={styles.nextBtn}
            onClick={handleNext}
            disabled={finishing}
          >
            {finishing
              ? t('intro_finishing')
              : index === lastIndex
                ? t('intro_finish')
                : t('intro_next')}
          </button>
        </div>
      </div>
    </div>
  );
}
