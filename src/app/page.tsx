// src/app/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useRequestCourse } from "@/context/RequestCourseContext";
import styles from "./page.module.scss";

export default function HomePage() {
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { setPartial, reset } = useRequestCourse();

  const handleLearn = () => {
    const trimmed = query.trim();
    if (!trimmed) return;
    reset();
    setPartial({ topic: trimmed });
    router.push('/request-course/step1');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleLearn();
  };

  return (
    <div className={styles.page}>
      {/* Decorative background elements */}
      <div className={styles.bgOrb1} />
      <div className={styles.bgOrb2} />
      <div className={styles.bgOrb3} />

      {/* Header / Navbar */}
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <div className={styles.logoGroup}>
            <div className={styles.logoIcon}>
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <rect width="28" height="28" rx="8" fill="url(#logoGrad)" />
                <path d="M8 14L12 18L20 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                <defs>
                  <linearGradient id="logoGrad" x1="0" y1="0" x2="28" y2="28">
                    <stop stopColor="#3b82f6" />
                    <stop offset="1" stopColor="#1d4ed8" />
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <h1 className={styles.logo}>PrincipleLearn</h1>
          </div>
          <Link href="/login">
            <button type="button" className={styles.ctaBtn}>
              Mulai Sekarang
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={styles.btnArrow}>
                <path d="M3 8H13M13 8L9 4M13 8L9 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className={styles.hero}>
        <div className={styles.badge}>
          <span className={styles.badgeDot} />
          Platform Belajar Berbasis AI
        </div>

        <h2 className={styles.title}>
          Belajar Lebih Cerdas.<br />
          <span className={styles.titleAccent}>Berpikir Lebih Dalam.</span><br />
          Kuasai Apapun!
        </h2>

        <p className={styles.subtitle}>
          Manfaatkan strategi efektif, tetap penasaran, pertanyakan asumsi, dan
          jelajahi perspektif baru — berdayakan dirimu untuk menguasai apapun dan
          ubah setiap tantangan menjadi peluang untuk berkembang.
        </p>

        <div className={styles.searchGroup}>
          <div className={styles.searchIcon}>
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <circle cx="9" cy="9" r="6" stroke="#94a3b8" strokeWidth="2" />
              <path d="M13.5 13.5L17 17" stroke="#94a3b8" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
          <input
            type="search"
            className={styles.input}
            placeholder="Apa yang ingin kamu pelajari hari ini?"
            aria-label="Cari topik"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className={styles.learnBtn}
            onClick={handleLearn}
          >
            Mulai Belajar
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M4 9H14M14 9L10 5M14 9L10 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        </div>

        <div className={styles.stats}>
          <div className={styles.statItem}>
            <span className={styles.statNumber}>500+</span>
            <span className={styles.statLabel}>Kursus Tercipta</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statNumber}>AI</span>
            <span className={styles.statLabel}>Konten Cerdas</span>
          </div>
          <div className={styles.statDivider} />
          <div className={styles.statItem}>
            <span className={styles.statNumber}>24/7</span>
            <span className={styles.statLabel}>Akses Belajar</span>
          </div>
        </div>
      </main>

      {/* Features Section */}
      <section className={styles.features}>
        <h3 className={styles.featuresTitle}>Mengapa PrincipleLearn?</h3>
        <p className={styles.featuresSubtitle}>
          Rasakan cara belajar yang lebih cerdas dengan personalisasi berbasis AI
        </p>

        <div className={styles.featureGrid}>
          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap} data-color="blue">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 3C8.48 3 4 7.48 4 13C4 16.64 6.06 19.78 9.06 21.41V24C9.06 24.55 9.51 25 10.06 25H17.94C18.49 25 18.94 24.55 18.94 24V21.41C21.94 19.78 24 16.64 24 13C24 7.48 19.52 3 14 3Z" fill="currentColor" />
              </svg>
            </div>
            <h4 className={styles.featureTitle}>Pembuatan Kursus AI</h4>
            <p className={styles.featureDesc}>
              Cukup ketik topik dan AI kami akan membuat kursus komprehensif dan terstruktur yang disesuaikan dengan levelmu.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap} data-color="purple">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 2L3 7L14 12L25 7L14 2Z" fill="currentColor" />
                <path d="M3 17L14 22L25 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
                <path d="M3 12L14 17L25 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
              </svg>
            </div>
            <h4 className={styles.featureTitle}>Lapisan Pembelajaran Mendalam</h4>
            <p className={styles.featureDesc}>
              Lebih dari sekadar permukaan dengan subtopik, contoh, kuis, dan tantangan berpikir kritis.
            </p>
          </div>

          <div className={styles.featureCard}>
            <div className={styles.featureIconWrap} data-color="teal">
              <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
                <path d="M14 25C20.075 25 25 20.075 25 14C25 7.925 20.075 3 14 3C7.925 3 3 7.925 3 14C3 20.075 7.925 25 14 25Z" stroke="currentColor" strokeWidth="2" fill="none" />
                <path d="M10 14L13 17L18 11" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h4 className={styles.featureTitle}>Pantau Progresmu</h4>
            <p className={styles.featureDesc}>
              Pantau perjalanan belajarmu dengan kuis, jurnal, dan umpan balik personal dari AI.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className={styles.footer}>
        <p>© 2026 PrincipleLearn. Dibangun untuk pembelajaran yang lebih cerdas.</p>
      </footer>
    </div>
  );
}
