'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './page.module.scss';
import { useAdmin } from '@/hooks/useAdmin';

type LearningGoal = {
  id: string;
  description: string;
  covered: boolean;
  rubric?: any;
};

type SessionListItem = {
  id: string;
  status: string;
  phase: string;
  learningGoals: LearningGoal[];
  createdAt: string;
  updatedAt: string;
  user: { id: string; email: string | null };
  course: { id: string; title: string | null };
  subtopic: { id: string; title: string | null };
};

type DiscussionMessage = {
  id: string;
  role: 'agent' | 'student';
  content: string;
  metadata?: Record<string, any>;
  step_key?: string | null;
  created_at: string;
};

type AdminAction = {
  id: string;
  action: string;
  payload: Record<string, any> | null;
  created_at: string;
  admin_id: string | null;
  admin_email: string | null;
};

type SessionDetail = {
  session: SessionListItem;
  messages: DiscussionMessage[];
  adminActions: AdminAction[];
};

const STATUS_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'in_progress', label: 'Sedang Berlangsung' },
  { value: 'completed', label: 'Selesai' },
];

export default function AdminDiscussionsPage() {
  const router = useRouter();
  const { admin, loading: authLoading } = useAdmin();

  const [statusFilter, setStatusFilter] = useState('all');
  const [sessions, setSessions] = useState<SessionListItem[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [reloadCounter, setReloadCounter] = useState(0);

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const [noteText, setNoteText] = useState('');
  const [notePhase, setNotePhase] = useState<string | null>(null);
  const [submittingAction, setSubmittingAction] = useState(false);

  useEffect(() => {
    if (!authLoading && !admin) {
      router.push('/admin/login');
    }
  }, [admin, authLoading, router]);

  useEffect(() => {
    if (!admin || authLoading) return;
    const controller = new AbortController();
    async function loadSessions() {
      setLoadingSessions(true);
      setListError(null);
      try {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') {
          params.append('status', statusFilter);
        }
        const response = await fetch(`/api/admin/discussions?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Gagal memuat sesi diskusi');
        }
        const payload = await response.json();
        setSessions(payload.sessions ?? []);
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          setListError(error?.message ?? 'Tidak dapat memuat sesi diskusi');
        }
      } finally {
        setLoadingSessions(false);
      }
    }

    loadSessions();
    return () => controller.abort();
  }, [admin, authLoading, statusFilter, reloadCounter]);

  useEffect(() => {
    if (!selectedSessionId) {
      setDetail(null);
      return;
    }
    const controller = new AbortController();
    async function loadDetail() {
      setLoadingDetail(true);
      setDetailError(null);
      try {
        const response = await fetch(`/api/admin/discussions/${selectedSessionId}`, {
          credentials: 'include',
          signal: controller.signal,
        });
        if (!response.ok) {
          const err = await response.json().catch(() => ({}));
          throw new Error(err.error || 'Gagal memuat detail sesi');
        }
        const payload = await response.json();
        setDetail(payload);
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          setDetailError(error?.message ?? 'Tidak dapat memuat detail sesi');
        }
      } finally {
        setLoadingDetail(false);
      }
    }
    loadDetail();
    return () => controller.abort();
  }, [selectedSessionId]);

  const selectedSessionGoals = useMemo(
    () => detail?.session?.learningGoals ?? [],
    [detail?.session?.learningGoals]
  );

  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId);
    setNoteText('');
    setNotePhase(null);
  };

  const handleToggleGoal = async (goalId: string, currentCovered: boolean) => {
    if (!selectedSessionId) return;
    setSubmittingAction(true);
    try {
      const response = await fetch(`/api/admin/discussions/${selectedSessionId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'markGoal',
          goalId,
          covered: !currentCovered,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Gagal memperbarui status goal');
      }
      await refreshDetail();
    } catch (error: any) {
      alert(error?.message ?? 'Tidak dapat memperbarui status goal');
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleSubmitNote = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSessionId || !noteText.trim()) return;

    setSubmittingAction(true);
    try {
      const response = await fetch(`/api/admin/discussions/${selectedSessionId}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addCoachNote',
          message: noteText.trim(),
          phase: notePhase,
        }),
      });
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.error || 'Gagal menambahkan catatan');
      }
      setNoteText('');
      setNotePhase(null);
      await refreshDetail();
    } catch (error: any) {
      alert(error?.message ?? 'Tidak dapat menambahkan catatan');
    } finally {
      setSubmittingAction(false);
    }
  };

  const refreshDetail = async () => {
    if (!selectedSessionId) return;
    setLoadingDetail(true);
    try {
      const response = await fetch(`/api/admin/discussions/${selectedSessionId}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const payload = await response.json();
        setDetail(payload);
      }
    } catch (error) {
      console.error('[AdminDiscussions] Failed to refresh detail', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const phaseOptions = useMemo(() => {
    const phases = new Set<string>();
    (detail?.messages ?? []).forEach((msg) => {
      const phase = msg.metadata?.phase;
      if (phase) phases.add(phase);
    });
    return Array.from(phases);
  }, [detail?.messages]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div>
          <h1>Manajemen Diskusi</h1>
          <p>
            Pantau sesi diskusi Socratic, tinjau transkrip, dan lakukan intervensi manual
            ketika diperlukan.
          </p>
        </div>
        <div className={styles.filters}>
          <select
            className={styles.select}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            className={styles.button}
            onClick={() => setReloadCounter((count) => count + 1)}
            disabled={loadingSessions}
          >
            {loadingSessions ? 'Memuat...' : 'Segarkan'}
          </button>
        </div>
      </header>

      {listError && <div className={styles.errorBanner}>{listError}</div>}

      <div className={styles.layout}>
        <section className={styles.sessionList}>
          <h2>Daftar Sesi</h2>
          {loadingSessions ? (
            <div className={styles.placeholder}>Memuat sesi diskusi…</div>
          ) : sessions.length === 0 ? (
            <div className={styles.placeholder}>Belum ada sesi untuk filter ini.</div>
          ) : (
            <ul className={styles.sessionItems}>
              {sessions.map((session) => {
                const coveredCount = session.learningGoals.filter((goal) => goal.covered)
                  .length;
                return (
                  <li
                    key={session.id}
                    className={`${styles.sessionItem} ${
                      session.id === selectedSessionId ? styles.sessionItemActive : ''
                    }`}
                    onClick={() => handleSelectSession(session.id)}
                  >
                    <div className={styles.sessionHeader}>
                      <span className={styles.sessionCourse}>
                        {session.course.title ?? 'Tanpa judul'}
                      </span>
                      <span
                        className={`${styles.statusBadge} ${
                          session.status === 'completed'
                            ? styles.statusBadgeDone
                            : styles.statusBadgeProgress
                        }`}
                      >
                        {session.status === 'completed' ? 'Selesai' : 'Berjalan'}
                      </span>
                    </div>
                    <p className={styles.sessionSubtopic}>
                      {session.subtopic.title ?? 'Subtopik tidak diketahui'}
                    </p>
                    <div className={styles.sessionMeta}>
                      <span>{session.user.email ?? 'Anonim'}</span>
                      <span>
                        Goals: {coveredCount}/{session.learningGoals.length}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className={styles.sessionDetail}>
          {!selectedSessionId ? (
            <div className={styles.placeholder}>
              Pilih sesi untuk melihat detail transkrip dan tujuan pembelajaran.
            </div>
          ) : detailError ? (
            <div className={styles.errorBanner}>{detailError}</div>
          ) : loadingDetail || !detail ? (
            <div className={styles.placeholder}>Memuat detail sesi…</div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <div>
                  <h2>{detail.session.subtopic.title ?? 'Subtopik'}</h2>
                  <p>
                    {detail.session.course.title ?? 'Tanpa kursus'} •{' '}
                    {detail.session.user.email ?? 'Anonim'}
                  </p>
                </div>
                <span
                  className={`${styles.statusBadge} ${
                    detail.session.status === 'completed'
                      ? styles.statusBadgeDone
                      : styles.statusBadgeProgress
                  }`}
                >
                  {detail.session.status === 'completed' ? 'Selesai' : 'Berjalan'}
                </span>
              </div>

              <div className={styles.detailGrid}>
                <div className={styles.card}>
                  <h3>Tujuan Pembelajaran</h3>
                  <ul className={styles.goalList}>
                    {selectedSessionGoals.map((goal) => (
                      <li key={goal.id} className={styles.goalItem}>
                        <div>
                          <p>{goal.description}</p>
                          {goal.rubric?.success_summary && (
                            <small>{goal.rubric.success_summary}</small>
                          )}
                        </div>
                        <button
                          type="button"
                          className={`${styles.button} ${
                            goal.covered ? styles.buttonSecondary : styles.buttonPrimary
                          }`}
                          onClick={() => handleToggleGoal(goal.id, goal.covered)}
                          disabled={submittingAction}
                        >
                          {goal.covered ? 'Tandai belum tercapai' : 'Tandai tercapai'}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className={styles.card}>
                  <h3>Catatan Manual</h3>
                  <form onSubmit={handleSubmitNote} className={styles.noteForm}>
                    <textarea
                      placeholder="Kirim pesan manual ke siswa..."
                      value={noteText}
                      onChange={(event) => setNoteText(event.target.value)}
                      rows={4}
                    />
                    {phaseOptions.length > 0 && (
                      <select
                        value={notePhase ?? ''}
                        onChange={(event) =>
                          setNotePhase(event.target.value || null)
                        }
                      >
                        <option value="">Tanpa fase</option>
                        {phaseOptions.map((phase) => (
                          <option key={phase} value={phase}>
                            {phase}
                          </option>
                        ))}
                      </select>
                    )}
                    <button
                      type="submit"
                      className={styles.button}
                      disabled={!noteText.trim() || submittingAction}
                    >
                      Kirim Catatan
                    </button>
                  </form>
                  {detail.adminActions.length > 0 && (
                    <div className={styles.actionHistory}>
                      <h4>Riwayat Intervensi</h4>
                      <ul>
                        {detail.adminActions.map((action) => (
                          <li key={action.id}>
                            <strong>{action.action}</strong> oleh{' '}
                            {action.admin_email ?? 'admin'} pada{' '}
                            {new Date(action.created_at).toLocaleString()}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>

              <div className={styles.card}>
                <h3>Transkrip Diskusi</h3>
                <div className={styles.messages}>
                  {detail.messages.map((message) => (
                    <div
                      key={message.id}
                      className={`${styles.message} ${
                        message.role === 'agent'
                          ? styles.messageAgent
                          : styles.messageStudent
                      }`}
                    >
                      <div className={styles.messageHeader}>
                        <span>
                          {message.role === 'agent' ? 'Mentor' : 'Siswa'} ·{' '}
                          {new Date(message.created_at).toLocaleTimeString()}
                        </span>
                        {message.metadata?.phase && (
                          <small>{message.metadata.phase}</small>
                        )}
                        {message.metadata?.type && (
                          <small>{message.metadata.type}</small>
                        )}
                      </div>
                      <p>{message.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
