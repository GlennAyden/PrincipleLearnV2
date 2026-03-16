'use client';
// src/app/admin/evidence/page.tsx
import React, { useState, useEffect } from 'react';
import styles from './page.module.scss';

interface EvidenceItem {
  id: string;
  evidence_type: string;
  user_id: string;
  course_id?: string;
  question?: string;
  answer?: string;
  content?: string;
  feedback?: string;
  reasoning_note?: string;
  prompt_components?: any;
  prompt_version?: number;
  session_number?: number;
  subtopic_label?: string;
  is_correct?: boolean;
  rating?: number;
  type?: string;
  created_at: string;
}

interface UserOption {
  id: string;
  name: string;
  email: string;
}

const TYPE_CONFIG: Record<string, { icon: string; label: string; color: string }> = {
  ask_question: { icon: '❓', label: 'Pertanyaan', color: '#6366f1' },
  challenge: { icon: '🧠', label: 'Challenge', color: '#ec4899' },
  quiz: { icon: '📝', label: 'Quiz', color: '#f59e0b' },
  jurnal: { icon: '📓', label: 'Jurnal', color: '#10b981' },
  feedback: { icon: '💬', label: 'Feedback', color: '#06b6d4' },
};

export default function EvidenceLockerPage() {
  const [evidence, setEvidence] = useState<EvidenceItem[]>([]);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [selectedUser, setSelectedUser] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchEvidence();
  }, [selectedUser]);

  const fetchEvidence = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (selectedUser) params.set('userId', selectedUser);
      const res = await fetch(`/api/admin/evidence?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch evidence');
      const data = await res.json();
      setEvidence(data.evidence || []);
      setUsers(data.users || []);
      setCounts(data.counts || {});
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const filteredEvidence = filterType === 'all'
    ? evidence
    : evidence.filter(e => e.evidence_type === filterType);

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const renderEvidenceContent = (item: EvidenceItem) => {
    switch (item.evidence_type) {
      case 'ask_question':
        return (
          <>
            <div className={styles.evidenceQuestion}>
              <strong>Q:</strong> {item.question}
            </div>
            <div className={styles.evidenceAnswer}>
              <strong>A:</strong> {item.answer?.substring(0, 200)}{(item.answer?.length || 0) > 200 ? '...' : ''}
            </div>
            {item.prompt_components && (
              <div className={styles.promptComponents}>
                {item.prompt_components.tujuan && <span className={styles.chip}>🎯 {item.prompt_components.tujuan.substring(0, 50)}</span>}
                {item.prompt_components.konteks && <span className={styles.chip}>📝 Konteks terisi</span>}
                {item.prompt_components.batasan && <span className={styles.chip}>📏 Batasan terisi</span>}
              </div>
            )}
          </>
        );
      case 'challenge':
        return (
          <>
            <div className={styles.evidenceQuestion}>
              <strong>Challenge:</strong> {item.question}
            </div>
            <div className={styles.evidenceAnswer}>
              <strong>Jawaban:</strong> {item.answer?.substring(0, 200)}{(item.answer?.length || 0) > 200 ? '...' : ''}
            </div>
            {item.feedback && <div className={styles.evidenceFeedback}>Feedback: {item.feedback.substring(0, 100)}</div>}
          </>
        );
      case 'quiz':
        return (
          <div className={styles.quizResult}>
            <span className={item.is_correct ? styles.correct : styles.incorrect}>
              {item.is_correct ? '✔ Benar' : '✖ Salah'}
            </span>
            <span className={styles.quizAnswer}>Jawaban: {item.answer}</span>
          </div>
        );
      case 'jurnal':
        return (
          <div className={styles.jurnalContent}>
            {item.type === 'structured_reflection' ? (
              (() => {
                try {
                  const parsed = JSON.parse(item.content || '{}');
                  return (
                    <div className={styles.structuredContent}>
                      {parsed.understood && <p>💡 <strong>Pahami:</strong> {parsed.understood}</p>}
                      {parsed.confused && <p>❓ <strong>Bingung:</strong> {parsed.confused}</p>}
                      {parsed.strategy && <p>🗺️ <strong>Strategi:</strong> {parsed.strategy}</p>}
                      {parsed.promptEvolution && <p>📈 <strong>Evolusi:</strong> {parsed.promptEvolution}</p>}
                    </div>
                  );
                } catch {
                  return <p>{item.content}</p>;
                }
              })()
            ) : (
              <p>{item.content?.substring(0, 200)}{(item.content?.length || 0) > 200 ? '...' : ''}</p>
            )}
          </div>
        );
      case 'feedback':
        return (
          <div className={styles.feedbackContent}>
            {item.rating && <span className={styles.ratingBadge}>⭐ {item.rating}/5</span>}
            <p>{item.content?.substring(0, 200)}{(item.content?.length || 0) > 200 ? '...' : ''}</p>
          </div>
        );
      default:
        return <p>{JSON.stringify(item)}</p>;
    }
  };

  return (
    <div className={styles.evidencePage}>
      <div className={styles.pageHeader}>
        <h1 className={styles.pageTitle}>🗄️ Evidence Locker</h1>
        <p className={styles.pageSubtitle}>
          Semua jejak interaksi siswa tersimpan rapi untuk analisis RM2 &amp; RM3
        </p>
      </div>

      {/* Filters */}
      <div className={styles.filters}>
        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Siswa</label>
          <select
            className={styles.filterSelect}
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="">Semua Siswa</option>
            {users.map(u => (
              <option key={u.id} value={u.id}>{u.name || u.email}</option>
            ))}
          </select>
        </div>

        <div className={styles.filterGroup}>
          <label className={styles.filterLabel}>Tipe</label>
          <div className={styles.typeFilter}>
            <button
              className={`${styles.typeButton} ${filterType === 'all' ? styles.activeType : ''}`}
              onClick={() => setFilterType('all')}
            >
              Semua ({counts.total || 0})
            </button>
            {Object.entries(TYPE_CONFIG).map(([key, config]) => (
              <button
                key={key}
                className={`${styles.typeButton} ${filterType === key ? styles.activeType : ''}`}
                onClick={() => setFilterType(key)}
                style={{ '--type-color': config.color } as React.CSSProperties}
              >
                {config.icon} {config.label} ({(counts as any)[key === 'ask_question' ? 'askQuestion' : key] || 0})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Stats Summary */}
      <div className={styles.statsRow}>
        {Object.entries(TYPE_CONFIG).map(([key, config]) => (
          <div key={key} className={styles.statCard} style={{ borderLeftColor: config.color }}>
            <span className={styles.statIcon}>{config.icon}</span>
            <div>
              <span className={styles.statNumber}>{(counts as any)[key === 'ask_question' ? 'askQuestion' : key] || 0}</span>
              <span className={styles.statLabel}>{config.label}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Evidence List */}
      {loading ? (
        <p className={styles.loadingText}>Memuat evidence...</p>
      ) : error ? (
        <p className={styles.errorText}>⚠️ {error}</p>
      ) : filteredEvidence.length === 0 ? (
        <div className={styles.emptyState}>
          <span className={styles.emptyIcon}>📭</span>
          <p>Belum ada evidence yang tersedia.</p>
        </div>
      ) : (
        <div className={styles.evidenceList}>
          {filteredEvidence.map((item) => {
            const config = TYPE_CONFIG[item.evidence_type] || { icon: '📄', label: 'Unknown', color: '#94a3b8' };
            return (
              <div key={`${item.evidence_type}-${item.id}`} className={styles.evidenceCard}>
                <div className={styles.evidenceHeader}>
                  <span className={styles.evidenceTypeBadge} style={{ background: config.color }}>
                    {config.icon} {config.label}
                  </span>
                  <span className={styles.evidenceTime}>{formatDate(item.created_at)}</span>
                  {item.session_number && <span className={styles.sessionBadge}>Sesi {item.session_number}</span>}
                  {item.prompt_version && item.prompt_version > 1 && (
                    <span className={styles.versionBadge}>v{item.prompt_version}</span>
                  )}
                </div>

                <div className={styles.evidenceBody}>
                  {renderEvidenceContent(item)}
                </div>

                {item.reasoning_note && (
                  <div className={styles.reasoningBlock}>
                    <span className={styles.reasoningIcon}>💭</span>
                    <span className={styles.reasoningText}>{item.reasoning_note}</span>
                  </div>
                )}

                {item.subtopic_label && (
                  <div className={styles.evidenceFooter}>
                    <span className={styles.subtopicTag}>{item.subtopic_label}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
