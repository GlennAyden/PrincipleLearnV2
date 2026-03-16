// src/components/PromptTimeline/PromptTimeline.tsx
'use client';
import React, { useState, useEffect } from 'react';
import styles from './PromptTimeline.module.scss';

interface PromptEntry {
  id: string;
  question: string;
  reasoning_note: string | null;
  prompt_components: {
    tujuan?: string;
    konteks?: string;
    batasan?: string;
    reasoning?: string;
  } | null;
  prompt_version: number;
  session_number: number;
  created_at: string;
  subtopic_label: string | null;
}

interface PromptTimelineProps {
  userId: string;
  courseId: string;
}

export default function PromptTimeline({ userId, courseId }: PromptTimelineProps) {
  const [entries, setEntries] = useState<PromptEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchTimeline() {
      try {
        setLoading(true);
        const res = await fetch(`/api/prompt-journey?userId=${userId}&courseId=${courseId}`);
        if (!res.ok) throw new Error('Failed to fetch prompt journey');
        const data = await res.json();
        setEntries(data.entries || []);
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    if (userId && courseId) fetchTimeline();
  }, [userId, courseId]);

  if (loading) {
    return (
      <div className={styles.container}>
        <p className={styles.loadingText}>Memuat riwayat prompt...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <p className={styles.errorText}>⚠️ {error}</p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={styles.container}>
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📭</span>
          <p>Belum ada riwayat prompt. Mulai bertanya untuk membangun timeline!</p>
        </div>
      </div>
    );
  }

  // Group entries by session_number
  const grouped: Record<number, PromptEntry[]> = {};
  entries.forEach(entry => {
    const session = entry.session_number || 1;
    if (!grouped[session]) grouped[session] = [];
    grouped[session].push(entry);
  });

  const sessionKeys = Object.keys(grouped).map(Number).sort((a, b) => a - b);

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>🧭 Prompt Journey Timeline</h3>
      <p className={styles.subtitle}>Lihat bagaimana cara Anda bertanya berkembang dari waktu ke waktu</p>

      <div className={styles.timeline}>
        {sessionKeys.map((session) => (
          <div key={session} className={styles.sessionGroup}>
            <div className={styles.sessionHeader}>
              <span className={styles.sessionBadge}>Sesi {session}</span>
              <span className={styles.sessionCount}>
                {grouped[session].length} prompt
              </span>
            </div>

            {grouped[session].map((entry, idx) => (
              <div key={entry.id} className={styles.entryCard}>
                <div className={styles.entryConnector}>
                  <div className={styles.dot} />
                  {idx < grouped[session].length - 1 && <div className={styles.line} />}
                </div>

                <div className={styles.entryContent}>
                  <div className={styles.entryMeta}>
                    <span className={styles.timestamp}>
                      {new Date(entry.created_at).toLocaleDateString('id-ID', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    {entry.subtopic_label && (
                      <span className={styles.subtopicTag}>{entry.subtopic_label}</span>
                    )}
                    <span className={styles.versionBadge}>v{entry.prompt_version}</span>
                  </div>

                  <p className={styles.promptText}>{entry.question}</p>

                  {entry.prompt_components && (
                    <div className={styles.componentsPreview}>
                      {entry.prompt_components.tujuan && (
                        <span className={styles.componentChip}>🎯 {entry.prompt_components.tujuan.substring(0, 60)}...</span>
                      )}
                      {entry.prompt_components.konteks && (
                        <span className={styles.componentChip}>📝 Konteks</span>
                      )}
                      {entry.prompt_components.batasan && (
                        <span className={styles.componentChip}>📏 Batasan</span>
                      )}
                    </div>
                  )}

                  {entry.reasoning_note && (
                    <div className={styles.reasoningPreview}>
                      <span className={styles.reasoningIcon}>💭</span>
                      <span>{entry.reasoning_note.substring(0, 120)}{entry.reasoning_note.length > 120 ? '...' : ''}</span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
