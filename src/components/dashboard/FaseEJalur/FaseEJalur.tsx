'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api-client';
import styles from './FaseEJalur.module.scss';

interface ResearchTemplate {
  id: string;
  templateTopic: string;
  title: string;
  description: string;
  sourceReference: string | null;
  difficultyLevel: string | null;
  displayOrder: number;
  prereqTemplateTopic: string | null;
  unlockThreshold: number;
  isUnlocked: boolean;
  lockReason: string | null;
}

interface UnlockStatus {
  isUnlocked: boolean;
  prereqProgress: { averageScore: number } | null;
  currentProgress: { averageScore: number } | null;
}

/**
 * MVR Item 7b — Dashboard 4-card jalur Fase E.
 *
 * Renders the 4 research-mode template courses in canonical Bab 2 order so
 * the student sees the unlock state of each + their own progress. Card
 * states:
 *   - locked: prereq not yet ≥70%; shows progress toward unlock
 *   - available: unlocked but not started — "Mulai" button
 *   - in-progress: 0 < score < 70% — "Lanjut" button + progress bar
 *   - completed: score ≥ 70% — "Buka kembali" button + check badge
 *
 * Only shown when the student has at least one research-mode learning
 * session OR explicitly chooses Mode Penelitian from request-course. The
 * dashboard renders this conditionally — see DashboardPage.
 */
export function FaseEJalur() {
  const router = useRouter();
  const [templates, setTemplates] = useState<ResearchTemplate[]>([]);
  const [statuses, setStatuses] = useState<Record<string, UnlockStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiFetch('/api/courses/research-templates');
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as { templates?: ResearchTemplate[] };
        if (cancelled) return;
        const list = json.templates ?? [];
        setTemplates(list);

        // Fetch per-course progress in parallel so each card can show its
        // own bar without N+1. The 60s in-memory cache on the helper makes
        // these calls cheap on rapid re-visits.
        const statusEntries = await Promise.all(list.map(async (tpl) => {
          try {
            const r = await apiFetch(`/api/courses/${tpl.id}/unlock-status`);
            if (!r.ok) return [tpl.templateTopic, null] as const;
            const j = await r.json();
            return [
              tpl.templateTopic,
              {
                isUnlocked: !!j.isUnlocked,
                prereqProgress: j.prereqProgress ?? null,
                currentProgress: j.currentProgress ?? null,
              } as UnlockStatus,
            ] as const;
          } catch {
            return [tpl.templateTopic, null] as const;
          }
        }));
        if (cancelled) return;
        const next: Record<string, UnlockStatus> = {};
        for (const [topic, status] of statusEntries) {
          if (status) next[topic] = status;
        }
        setStatuses(next);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Gagal memuat jalur Fase E.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <section className={styles.section}>
        <h2 className={styles.title}>Jalur Algoritma Fase E</h2>
        <p className={styles.muted}>Memuat...</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={styles.section}>
        <h2 className={styles.title}>Jalur Algoritma Fase E</h2>
        <p className={styles.error}>{error}</p>
      </section>
    );
  }

  if (templates.length === 0) return null;

  return (
    <section className={styles.section}>
      <header className={styles.header}>
        <h2 className={styles.title}>Jalur Algoritma Fase E</h2>
        <p className={styles.sub}>
          Berdasarkan Bab 2 buku <em>Informatika SMA/MA Kelas X Edisi Revisi</em> (Mushthofa dkk., 2023, Kemdikbudristek).
        </p>
      </header>

      <div className={styles.grid}>
        {templates.map((tpl) => {
          const status = statuses[tpl.templateTopic] ?? null;
          const currentProgress = status?.currentProgress?.averageScore ?? 0;
          const prereqProgress = status?.prereqProgress?.averageScore ?? 0;
          const isUnlocked = status?.isUnlocked ?? tpl.isUnlocked;
          const isCompleted = isUnlocked && currentProgress >= tpl.unlockThreshold;
          const inProgress = isUnlocked && currentProgress > 0 && !isCompleted;
          const cardState = !isUnlocked
            ? 'locked'
            : isCompleted ? 'completed' : inProgress ? 'in_progress' : 'available';

          return (
            <article key={tpl.templateTopic} className={styles.card} data-state={cardState}>
              <div className={styles.cardOrder}>{tpl.displayOrder}</div>
              <div className={styles.cardBody}>
                <h3 className={styles.cardTitle}>{tpl.title}</h3>
                {tpl.sourceReference && (
                  <p className={styles.cardSource}>{tpl.sourceReference}</p>
                )}
                {!isUnlocked ? (
                  <div className={styles.lockMsg}>
                    🔒 Terkunci — selesaikan course sebelumnya ≥ {Math.round(tpl.unlockThreshold * 100)}%
                    {prereqProgress > 0 && (
                      <span className={styles.lockProgress}>
                        Saat ini: {Math.round(prereqProgress * 100)}%
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    <div className={styles.progressBar}>
                      <div
                        className={styles.progressFill}
                        style={{ width: `${Math.round(currentProgress * 100)}%` }}
                      />
                    </div>
                    <div className={styles.progressLabel}>
                      {Math.round(currentProgress * 100)}%
                      {isCompleted && <span className={styles.completedBadge}>✓ Selesai</span>}
                    </div>
                  </>
                )}
              </div>
              <button
                className={styles.cardBtn}
                disabled={!isUnlocked}
                onClick={() => router.push(`/course/${tpl.id}`)}
              >
                {!isUnlocked ? 'Terkunci' : isCompleted ? 'Buka kembali' : inProgress ? 'Lanjut' : 'Mulai'}
              </button>
            </article>
          );
        })}
      </div>
    </section>
  );
}
