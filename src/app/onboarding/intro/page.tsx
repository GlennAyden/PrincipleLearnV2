// src/app/onboarding/intro/page.tsx
'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.scss';
import { useAuth } from '@/hooks/useAuth';
import { useOnboardingState } from '@/hooks/useOnboardingState';
import { apiFetch } from '@/lib/api-client';

interface SlideConfig {
  emoji: string;
  title: string;
  body: string;
  bullets?: string[];
}

const SLIDES: SlideConfig[] = [
  {
    emoji: '👋',
    title: 'Selamat datang di PrincipleLearn',
    body: 'Platform belajar personal berbasis AI. Course kamu dirakit sesuai topik, tujuan, dan gaya belajarmu — bukan satu kurikulum untuk semua orang.',
  },
  {
    emoji: '🧠',
    title: 'Belajar dengan berpikir, bukan menghafal',
    body: 'Setiap subtopic punya alat bantu yang mendorong kamu aktif:',
    bullets: [
      'Tanya AI kapan saja saat bingung',
      'Quiz cepat untuk cek pemahaman',
      'Challenge berpikir kritis + feedback AI',
      'Jurnal refleksi untuk menguatkan ingatan',
    ],
  },
  {
    emoji: '🗺️',
    title: 'Alurmu di sini',
    body: 'Urutan belajar yang disarankan:',
    bullets: [
      '1. Buat course sesuai topik yang ingin dikuasai',
      '2. Pelajari subtopic satu per satu',
      '3. Selesaikan quiz & tulis refleksi',
      '4. Modul selesai → Diskusi modul terbuka',
    ],
  },
  {
    emoji: '🚀',
    title: 'Siap mulai?',
    body: 'Kamu bisa panggil panduan ini lagi kapan saja lewat tombol bantuan di tiap subtopic. Kita mulai dari membuat course pertamamu.',
  },
];

export default function OnboardingIntroPage() {
  const router = useRouter();
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { state, loading: stateLoading, markCompleted } = useOnboardingState(isAuthenticated);

  const [index, setIndex] = useState(0);
  const [finishing, setFinishing] = useState(false);

  const lastIndex = SLIDES.length - 1;
  const slide = useMemo(() => SLIDES[index], [index]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace('/login');
    }
  }, [authLoading, isAuthenticated, router]);

  // If the user already finished the intro in a previous session, skip straight
  // through. We still rely on server state (learning_profiles flag) as the
  // source of truth; cookies elsewhere are only UX hints.
  useEffect(() => {
    if (!stateLoading && state?.introSlidesCompleted) {
      routeAfterIntro();
    }
  }, [stateLoading, state?.introSlidesCompleted]);

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
    return <div className={styles.loadingPage}>Memuat…</div>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />

      <button
        type="button"
        className={styles.skipBtn}
        onClick={finish}
        disabled={finishing}
      >
        Lewati
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

        <div className={styles.dots} role="tablist" aria-label="Slide progress">
          {SLIDES.map((_, i) => (
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
              ← Kembali
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
              ? 'Memuat…'
              : index === lastIndex
                ? '🚀 Mulai belajar'
                : 'Lanjut →'}
          </button>
        </div>
      </div>
    </div>
  );
}
