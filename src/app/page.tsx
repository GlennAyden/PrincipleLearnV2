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
    if (!trimmed) return; // jangan push kalau kosong
    
    // Reset context first to ensure clean state
    reset();
    
    // Pre-fill topic dari homepage input ke RequestCourse context
    setPartial({ topic: trimmed });
    
    // Navigate to request-course step1 dengan data yang sudah di-prefill
    router.push('/request-course/step1');
  };

  return (
    <div>
      <header className={styles.header}>
        <h1 className={styles.logo}>PrincipleLearn</h1>
        <Link href="/login">
          <button type="button" className={styles.btn}>
            Get Started
          </button>
        </Link>
      </header>

      <main className={styles.hero}>
        <h2 className={styles.title}>
          Learn Smarter. Think Deeper. Master Anything!
        </h2>
        <p className={styles.subtitle}>
          When you learn smarter by leveraging effective strategies and staying
          curious and thinking deeper by questioning assumptions and exploring
          new perspectives you empower yourself to master anything,
          transforming every challenge into an opportunity for growth and
          success.
        </p>

        <div className={styles.searchGroup}>
          <input
            type="search"
            className={styles.input}
            placeholder="type here..."
            aria-label="Search topic"
            value={query}
            onChange={(e) => setQuery(e.currentTarget.value)}
          />
          <button
            type="button"
            className={styles.learnBtn}
            onClick={handleLearn}
          >
            Let&apos;s Learn
          </button>
        </div>
      </main>
    </div>
  );
}
