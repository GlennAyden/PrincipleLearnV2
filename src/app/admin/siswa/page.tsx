// src/app/admin/siswa/page.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import styles from './page.module.scss'
import { useRouter } from 'next/navigation'
import {
  FiTrash2,
  FiAlertCircle,
  FiCheckSquare,
  FiFileText,
  FiSearch,
  FiUsers,
  FiClock,
  FiTrendingUp,
  FiExternalLink,
  FiActivity,
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import type { StudentListItem, ActivitySummary } from '@/types/student'

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  SCP: { label: 'SCP', color: '#b45309', bg: 'rgba(245, 158, 11, 0.14)' },
  SRP: { label: 'SRP', color: '#0369a1', bg: 'rgba(14, 165, 233, 0.14)' },
  MQP: { label: 'MQP', color: '#7c3aed', bg: 'rgba(124, 58, 237, 0.14)' },
  REFLECTIVE: { label: 'Reflective', color: '#059669', bg: 'rgba(16, 185, 129, 0.14)' },
  'N/A': { label: 'N/A', color: '#64748b', bg: '#f1f5f9' },
}

export default function AdminSiswaPage() {
  const router = useRouter()
  const { admin, loading: authLoading } = useAdmin()
  const [users, setUsers] = useState<StudentListItem[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'USER' | 'ADMIN'>('ALL')
  const [sortBy, setSortBy] = useState<'recent' | 'email' | 'engagement' | 'completion'>('recent')
  const [activeTab, setActiveTab] = useState<'overview' | 'activity'>('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteInProgress, setDeleteInProgress] = useState<string | null>(null)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; email: string } | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

  // Ambil data pengguna
  useEffect(() => {
    if (authLoading) return
    if (!admin) { router.push('/admin/login'); return }
    setIsLoading(true)
    setError(null)
    fetch('/api/admin/users', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Gagal memuat data pengguna') }
        return res.json()
      })
      .then(setUsers)
      .catch((err) => { console.error(err); setError(err.message) })
      .finally(() => setIsLoading(false))
  }, [admin, authLoading, router])

  // Ambil ringkasan aktivitas
  useEffect(() => {
    if (!selectedUserId) { setActivitySummary(null); return }
    setActivityLoading(true)
    setActivityError(null)
    fetch(`/api/admin/users/${selectedUserId}/activity-summary`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'Gagal memuat aktivitas') }
        return res.json()
      })
      .then(setActivitySummary)
      .catch((err) => { console.error(err); setActivityError(err.message) })
      .finally(() => setActivityLoading(false))
  }, [selectedUserId])

  const parseDate = (v?: string | null) => {
    if (!v) return null
    const d = new Date(v)
    return Number.isNaN(d.getTime()) ? null : d
  }

  const getActivityStatus = (lastActivity?: string | null) => {
    const last = parseDate(lastActivity)
    if (!last) return { label: 'Tidak Ada Aktivitas', tone: 'cold' as const }
    const days = (Date.now() - last.getTime()) / 86400000
    if (days <= 2) return { label: 'Aktif', tone: 'hot' as const }
    if (days <= 7) return { label: 'Hangat', tone: 'warm' as const }
    return { label: 'Tidak Aktif', tone: 'cold' as const }
  }

  const formatDate = (s: string) => new Date(s).toLocaleDateString('id-ID')

  const handleDeleteRequest = (id: string, email: string) => {
    setDeleteConfirm({ id, email })
  }

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return
    const { id, email } = deleteConfirm
    try {
      setDeleteInProgress(id)
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Gagal menghapus') }
      setUsers((prev) => prev.filter((u) => u.id !== id))
      if (selectedUserId === id) setSelectedUserId(null)
      setDeleteConfirm(null)
    } catch (err: unknown) {
      setError(`Gagal menghapus ${email}: ${err instanceof Error ? err.message : 'Kesalahan tidak diketahui'}`)
      setDeleteConfirm(null)
    } finally {
      setDeleteInProgress(null)
    }
  }

  // Data yang ditampilkan
  const displayedUsers = useMemo(() => {
    const q = searchTerm.trim().toLowerCase()
    const list = users
      .filter((u) => roleFilter === 'ALL' || u.role.toUpperCase() === roleFilter)
      .filter((u) => !q || u.email.toLowerCase().includes(q) || (u.name?.toLowerCase().includes(q)))

    const sorted = [...list]
    if (sortBy === 'email') sorted.sort((a, b) => a.email.localeCompare(b.email))
    if (sortBy === 'engagement') sorted.sort((a, b) => b.engagementScore - a.engagementScore)
    if (sortBy === 'completion') sorted.sort((a, b) => b.courseCompletionRate - a.courseCompletionRate)
    if (sortBy === 'recent') sorted.sort((a, b) => (parseDate(b.lastActivity)?.getTime() ?? 0) - (parseDate(a.lastActivity)?.getTime() ?? 0))
    return sorted
  }, [roleFilter, searchTerm, sortBy, users])

  const studentUsers = useMemo(() => users.filter((u) => u.role.toUpperCase() === 'USER'), [users])
  const activeCount = useMemo(() => studentUsers.filter((u) => getActivityStatus(u.lastActivity).tone === 'hot').length, [studentUsers])
  const idleCount = useMemo(() => studentUsers.filter((u) => getActivityStatus(u.lastActivity).tone === 'cold').length, [studentUsers])
  const avgEngagement = useMemo(() => {
    if (studentUsers.length === 0) return 0
    return Math.round(studentUsers.reduce((s, u) => s + u.engagementScore, 0) / studentUsers.length)
  }, [studentUsers])

  const selectedUser = useMemo(() => users.find((u) => u.id === selectedUserId) ?? null, [selectedUserId, users])

  const timelineEntries = useMemo(() => {
    if (!activitySummary) return []
    const entries: Array<{ label: string; icon: string; title: string; timestamp?: string | null; detail?: string | null }> = []
    if (activitySummary.recentDiscussion) entries.push({ label: 'Diskusi', icon: '💬', title: 'Diskusi terbaru', timestamp: activitySummary.recentDiscussion.updatedAt, detail: `Fase ${activitySummary.recentDiscussion.phase ?? 'N/A'} · ${activitySummary.recentDiscussion.goalCount} tujuan` })
    if (activitySummary.recentJournal) entries.push({ label: 'Jurnal', icon: '📓', title: activitySummary.recentJournal.title ?? 'Jurnal terbaru', timestamp: activitySummary.recentJournal.createdAt, detail: activitySummary.recentJournal.snippet })
    if (activitySummary.recentTranscript) entries.push({ label: 'Transkrip', icon: '📝', title: activitySummary.recentTranscript.title ?? 'Transkrip terbaru', timestamp: activitySummary.recentTranscript.createdAt })
    if (activitySummary.recentAskQuestion) entries.push({ label: 'Pertanyaan', icon: '❓', title: 'Pertanyaan terbaru', timestamp: activitySummary.recentAskQuestion.createdAt, detail: activitySummary.recentAskQuestion.question })
    if (activitySummary.recentChallenge) entries.push({ label: 'Tantangan', icon: '🧩', title: 'Tantangan terbaru', timestamp: activitySummary.recentChallenge.createdAt, detail: activitySummary.recentChallenge.challengeType ? `Tipe: ${activitySummary.recentChallenge.challengeType}` : null })
    if (activitySummary.recentQuiz) entries.push({ label: 'Kuis', icon: '✅', title: `Kuis — ${activitySummary.recentQuiz.isCorrect ? 'Benar' : 'Salah'}`, timestamp: activitySummary.recentQuiz.createdAt })
    if (activitySummary.recentFeedback) entries.push({ label: 'Umpan Balik', icon: '⭐', title: 'Umpan balik terbaru', timestamp: activitySummary.recentFeedback.createdAt, detail: activitySummary.recentFeedback.rating != null ? `Penilaian: ${activitySummary.recentFeedback.rating}/5` : null })
    return entries.sort((a, b) => (parseDate(b.timestamp)?.getTime() ?? 0) - (parseDate(a.timestamp)?.getTime() ?? 0))
  }, [activitySummary])

  // Otomatis pilih pengguna pertama
  useEffect(() => {
    if (displayedUsers.length === 0) { setSelectedUserId(null); return }
    if (!selectedUserId || !displayedUsers.some((u) => u.id === selectedUserId)) setSelectedUserId(displayedUsers[0].id)
  }, [displayedUsers, selectedUserId])

  if (authLoading) return <div className={styles.loading}>Memuat...</div>
  if (!admin) return null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.pageTitle}>Ruang Kerja Siswa</h1>
        <p className={styles.pageSubtitle}>Pantau keterlibatan, periksa jejak belajar, dan kelola data siswa.</p>
      </header>

      <section className={styles.controlBar}>
        <label className={styles.searchInput}>
          <FiSearch />
          <input type="text" placeholder="Cari berdasarkan email atau nama..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </label>
        <select className={styles.select} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'ALL' | 'USER' | 'ADMIN')}>
          <option value="ALL">Semua Peran</option>
          <option value="USER">Siswa</option>
          <option value="ADMIN">Admin</option>
        </select>
        <select className={styles.select} value={sortBy} onChange={(e) => setSortBy(e.target.value as 'recent' | 'email' | 'engagement' | 'completion')}>
          <option value="recent">Urut: Aktivitas Terbaru</option>
          <option value="engagement">Urut: Keterlibatan</option>
          <option value="completion">Urut: Penyelesaian</option>
          <option value="email">Urut: Email A-Z</option>
        </select>
      </section>

      <section className={styles.statGrid}>
        <article className={styles.statCard}>
          <span className={styles.statIcon}><FiUsers /></span>
          <div><p className={styles.statLabel}>Total Siswa</p><h3>{studentUsers.length}</h3></div>
        </article>
        <article className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.statIconGreen}`}><FiTrendingUp /></span>
          <div><p className={styles.statLabel}>Aktif (2 Hari)</p><h3>{activeCount}</h3></div>
        </article>
        <article className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.statIconGray}`}><FiClock /></span>
          <div><p className={styles.statLabel}>Tidak Aktif (7+ Hari)</p><h3>{idleCount}</h3></div>
        </article>
        <article className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.statIconOrange}`}><FiActivity /></span>
          <div><p className={styles.statLabel}>Rata-rata Keterlibatan</p><h3>{avgEngagement}%</h3></div>
        </article>
      </section>

      {deleteConfirm && (
        <div className={styles.deleteConfirmBanner}>
          <FiAlertCircle style={{ color: '#dc2626', flexShrink: 0 }} />
          <p className={styles.deleteConfirmText}>
            Hapus pengguna <strong>{deleteConfirm.email}</strong>? SEMUA data akan dihapus secara permanen.
          </p>
          <div className={styles.deleteConfirmActions}>
            <button className={`${styles.deleteConfirmBtn} ${styles.cancel}`} onClick={() => setDeleteConfirm(null)}>
              Batal
            </button>
            <button
              className={`${styles.deleteConfirmBtn} ${styles.danger}`}
              onClick={handleDeleteConfirm}
              disabled={!!deleteInProgress}
            >
              {deleteInProgress ? 'Menghapus...' : 'Ya, Hapus'}
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className={styles.loading}>Memuat data siswa...</div>
      ) : error ? (
        <div className={styles.error}><FiAlertCircle /> {error}</div>
      ) : (
        <section className={styles.workspace}>
          <aside className={styles.studentRail}>
            <div className={styles.railHeader}>
              <h3>Daftar Siswa</h3>
              <span>{displayedUsers.length} data</span>
            </div>
            {displayedUsers.length === 0 ? (
              <p className={styles.noData}>Tidak ada pengguna yang cocok dengan filter.</p>
            ) : (
              <div className={styles.studentList}>
                {displayedUsers.map((u) => {
                  const status = getActivityStatus(u.lastActivity)
                  const isActive = selectedUserId === u.id
                  const stageConfig = STAGE_CONFIG[u.promptStage] ?? STAGE_CONFIG['N/A']
                  return (
                    <article key={u.id} className={`${styles.studentCard} ${isActive ? styles.studentCardActive : ''}`} onClick={() => setSelectedUserId(u.id)}>
                      <div className={styles.studentCardTop}>
                        <div>
                          <h4>{u.name !== 'Unknown' && u.name !== 'Tidak Diketahui' ? u.name : u.email}</h4>
                          {u.name !== 'Unknown' && u.name !== 'Tidak Diketahui' && <span className={styles.emailSub}>{u.email}</span>}
                        </div>
                        <div className={styles.badgeGroup}>
                          <span className={styles.stageBadge} style={{ color: stageConfig.color, background: stageConfig.bg }}>{stageConfig.label}</span>
                          <span className={`${styles.roleBadge} ${u.role.toUpperCase() === 'ADMIN' ? styles.adminBadge : styles.userBadge}`}>{u.role}</span>
                        </div>
                      </div>
                      <div className={styles.metaRow}>
                        <span className={`${styles.statusPill} ${styles[`status_${status.tone}`]}`}>{status.label}</span>
                        <span>Bergabung {formatDate(u.createdAt)}</span>
                      </div>
                      <div className={styles.keyStatsRow}>
                        <span className={styles.keyStat}>
                          <FiFileText />{u.totalCourses}<span className={styles.keyStatLabel}>kursus</span>
                        </span>
                        <span className={styles.keyStat}>
                          <FiCheckSquare />{u.totalQuizzes}<span className={styles.keyStatLabel}>kuis</span>
                        </span>
                      </div>
                      <div className={styles.progressRow}>
                        <div className={styles.miniProgress}>
                          <span className={styles.miniLabel}>Eng</span>
                          <div className={styles.miniBar}><div className={styles.miniFill} style={{ width: `${u.engagementScore}%` }} /></div>
                          <span className={styles.miniValue}>{u.engagementScore}%</span>
                        </div>
                      </div>
                      <div className={styles.cardFooter}>
                        <small>Terakhir: {u.lastActivity || 'N/A'}</small>
                        <div className={styles.footerActions}>
                          <button className={styles.viewDetailBtn} onClick={(e) => { e.stopPropagation(); router.push(`/admin/siswa/${u.id}`) }} title="Lihat detail">
                            <FiExternalLink />
                          </button>
                          <button
                            className={`${styles.deleteBtn} ${u.role.toUpperCase() === 'ADMIN' ? styles.disabled : ''}`}
                            onClick={(e) => { e.stopPropagation(); if (u.role.toUpperCase() !== 'ADMIN') handleDeleteRequest(u.id, u.email) }}
                            disabled={u.role.toUpperCase() === 'ADMIN' || !!deleteInProgress}
                            title="Hapus pengguna"
                          >
                            {deleteInProgress === u.id ? '...' : <FiTrash2 />}
                          </button>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </aside>

          <section className={styles.detailPanel}>
            {!selectedUser ? (
              <div className={styles.emptyDetail}>Pilih siswa untuk memeriksa aktivitas.</div>
            ) : (
              <>
                <header className={styles.detailHeader}>
                  <div>
                    <h2>{selectedUser.name !== 'Unknown' && selectedUser.name !== 'Tidak Diketahui' ? selectedUser.name : selectedUser.email}</h2>
                    <p>{selectedUser.name !== 'Unknown' && selectedUser.name !== 'Tidak Diketahui' ? `${selectedUser.email} · ` : ''}Peran {selectedUser.role} · Bergabung {formatDate(selectedUser.createdAt)}</p>
                  </div>
                  <button className={styles.viewDetailFullBtn} onClick={() => router.push(`/admin/siswa/${selectedUser.id}`)}>
                    <FiExternalLink /> Detail Lengkap
                  </button>
                </header>

                <div className={styles.detailStatsGrid}>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalCourses}</span><span className={styles.detailStatLabel}>Kursus</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalQuizzes}</span><span className={styles.detailStatLabel}>Kuis</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalJournals}</span><span className={styles.detailStatLabel}>Jurnal</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalTranscripts}</span><span className={styles.detailStatLabel}>Transkrip</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalAskQuestions}</span><span className={styles.detailStatLabel}>Pertanyaan</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalChallenges}</span><span className={styles.detailStatLabel}>Tantangan</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalDiscussions}</span><span className={styles.detailStatLabel}>Diskusi</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.engagementScore}%</span><span className={styles.detailStatLabel}>Keterlibatan</span></div>
                </div>

                <div className={styles.tabs}>
                  <button className={`${styles.tabBtn} ${activeTab === 'overview' ? styles.tabActive : ''}`} onClick={() => setActiveTab('overview')}>Ringkasan</button>
                  <button className={`${styles.tabBtn} ${activeTab === 'activity' ? styles.tabActive : ''}`} onClick={() => setActiveTab('activity')}>Lini Masa</button>
                </div>

                {activityLoading && <div className={styles.loading}>Memuat aktivitas...</div>}
                {activityError && <div className={styles.error}><FiAlertCircle /> {activityError}</div>}

                {activeTab === 'overview' && !activityLoading && (
                  <div className={styles.activityGrid}>
                    <article className={styles.activityCard}>
                      <h4>Diskusi</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.discussions ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentDiscussion ? `Terakhir: ${new Date(activitySummary.recentDiscussion.updatedAt).toLocaleString('id-ID')}` : 'Belum ada diskusi'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>Jurnal</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.journals ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentJournal ? (activitySummary.recentJournal.title ?? 'Jurnal terbaru') : 'Belum ada jurnal'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>Transkrip</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.transcripts ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentTranscript ? (activitySummary.recentTranscript.title ?? 'Transkrip terbaru') : 'Belum ada transkrip'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>Pertanyaan</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.askQuestions ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentAskQuestion ? activitySummary.recentAskQuestion.question.slice(0, 50) : 'Belum ada pertanyaan'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>Tantangan</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.challenges ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentChallenge ? `Tipe: ${activitySummary.recentChallenge.challengeType ?? 'N/A'}` : 'Belum ada tantangan'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>Kuis</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.quizzes ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentQuiz ? `Terakhir: ${activitySummary.recentQuiz.isCorrect ? 'Benar' : 'Salah'}` : 'Belum ada kuis'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>Umpan Balik</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.feedbacks ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentFeedback ? `Penilaian: ${activitySummary.recentFeedback.rating ?? 'N/A'}` : 'Belum ada umpan balik'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>Kursus</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.courses ?? 0}</p>
                      <p className={styles.activityLabel}>Penyelesaian: {selectedUser.courseCompletionRate}%</p>
                    </article>
                  </div>
                )}

                {activeTab === 'activity' && !activityLoading && (
                  <div className={styles.timelineWrap}>
                    {timelineEntries.length === 0 ? (
                      <p className={styles.noData}>Belum ada aktivitas terbaru.</p>
                    ) : (
                      <ul className={styles.timelineList}>
                        {timelineEntries.map((item, index) => (
                          <li key={`${item.label}-${index}`}>
                            <div>
                              <strong>{item.icon} {item.label}</strong>
                              <p>{item.title}</p>
                              {item.detail && <small>{item.detail}</small>}
                            </div>
                            <time>{item.timestamp ? new Date(item.timestamp).toLocaleString('id-ID') : 'N/A'}</time>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            )}
          </section>
        </section>
      )}
    </div>
  )
}
