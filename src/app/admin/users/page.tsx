// src/app/admin/users/page.tsx
'use client'

import React, { useEffect, useMemo, useState, useCallback } from 'react'
import styles from './page.module.scss'
import { useRouter } from 'next/navigation'
import {
  FiTrash2,
  FiAlertCircle,
  FiBookOpen,
  FiCheckSquare,
  FiMessageCircle,
  FiFileText,
  FiSearch,
  FiUsers,
  FiClock,
  FiTrendingUp,
  FiExternalLink,
  FiDownload,
  FiZap,
  FiHelpCircle,
  FiTarget,
  FiStar,
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

export default function AdminUsersPage() {
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
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [exportLoading, setExportLoading] = useState(false)

  // Fetch users
  useEffect(() => {
    if (authLoading) return
    if (!admin) { router.push('/admin/login'); return }
    setIsLoading(true)
    setError(null)
    fetch('/api/admin/users', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Failed to fetch users') }
        return res.json()
      })
      .then(setUsers)
      .catch((err) => { console.error(err); setError(err.message) })
      .finally(() => setIsLoading(false))
  }, [admin, authLoading, router])

  // Fetch activity summary
  useEffect(() => {
    if (!selectedUserId) { setActivitySummary(null); return }
    setActivityLoading(true)
    setActivityError(null)
    fetch(`/api/admin/users/${selectedUserId}/activity-summary`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.message || 'Failed') }
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
    if (!last) return { label: 'No Activity', tone: 'cold' as const }
    const days = (Date.now() - last.getTime()) / 86400000
    if (days <= 2) return { label: 'Active', tone: 'hot' as const }
    if (days <= 7) return { label: 'Warm', tone: 'warm' as const }
    return { label: 'Idle', tone: 'cold' as const }
  }

  const formatDate = (s: string) => new Date(s).toLocaleDateString()

  const handleDelete = async (id: string, email: string) => {
    if (!confirm(`Delete user ${email}? ALL data will be permanently removed.`)) return
    try {
      setDeleteInProgress(id)
      const res = await fetch(`/api/admin/users/${id}`, { method: 'DELETE', credentials: 'include' })
      if (!res.ok) { const d = await res.json(); throw new Error(d.error || 'Failed') }
      setUsers((prev) => prev.filter((u) => u.id !== id))
      if (selectedUserId === id) setSelectedUserId(null)
      alert(`User ${email} deleted.`)
    } catch (err: any) {
      alert(`Failed: ${err.message}`)
    } finally {
      setDeleteInProgress(null)
    }
  }

  const handleExport = useCallback(async (format: 'csv' | 'json') => {
    try {
      setExportLoading(true)
      const res = await fetch(`/api/admin/users/export?format=${format}`, { credentials: 'include' })
      if (!res.ok) { const d = await res.json().catch(() => ({})); throw new Error(d.error || 'Export failed') }
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `students_${new Date().toISOString().split('T')[0]}.${format}`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err: any) {
      alert(`Export failed: ${err.message}`)
    } finally {
      setExportLoading(false)
    }
  }, [])

  // Computed
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
    if (activitySummary.recentDiscussion) entries.push({ label: 'Discussion', icon: '💬', title: 'Latest discussion', timestamp: activitySummary.recentDiscussion.updatedAt, detail: `Phase ${activitySummary.recentDiscussion.phase ?? 'N/A'} · ${activitySummary.recentDiscussion.goalCount} goals` })
    if (activitySummary.recentJournal) entries.push({ label: 'Journal', icon: '📓', title: activitySummary.recentJournal.title ?? 'Latest journal', timestamp: activitySummary.recentJournal.createdAt, detail: activitySummary.recentJournal.snippet })
    if (activitySummary.recentTranscript) entries.push({ label: 'Transcript', icon: '📝', title: activitySummary.recentTranscript.title ?? 'Latest transcript', timestamp: activitySummary.recentTranscript.createdAt })
    if (activitySummary.recentAskQuestion) entries.push({ label: 'Ask Question', icon: '❓', title: 'Latest question', timestamp: activitySummary.recentAskQuestion.createdAt, detail: activitySummary.recentAskQuestion.question })
    if (activitySummary.recentChallenge) entries.push({ label: 'Challenge', icon: '🧩', title: 'Latest challenge', timestamp: activitySummary.recentChallenge.createdAt, detail: activitySummary.recentChallenge.challengeType ? `Type: ${activitySummary.recentChallenge.challengeType}` : null })
    if (activitySummary.recentQuiz) entries.push({ label: 'Quiz', icon: '✅', title: `Quiz — ${activitySummary.recentQuiz.isCorrect ? 'Correct' : 'Incorrect'}`, timestamp: activitySummary.recentQuiz.createdAt })
    if (activitySummary.recentFeedback) entries.push({ label: 'Feedback', icon: '⭐', title: 'Latest feedback', timestamp: activitySummary.recentFeedback.createdAt, detail: activitySummary.recentFeedback.rating != null ? `Rating: ${activitySummary.recentFeedback.rating}/5` : null })
    return entries.sort((a, b) => (parseDate(b.timestamp)?.getTime() ?? 0) - (parseDate(a.timestamp)?.getTime() ?? 0))
  }, [activitySummary])

  // Auto-select first user
  useEffect(() => {
    if (displayedUsers.length === 0) { setSelectedUserId(null); return }
    if (!selectedUserId || !displayedUsers.some((u) => u.id === selectedUserId)) setSelectedUserId(displayedUsers[0].id)
  }, [displayedUsers, selectedUserId])

  if (authLoading) return <div className={styles.loading}>Loading...</div>
  if (!admin) return null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Students Workspace</h1>
          <p className={styles.pageSubtitle}>Monitor engagement, inspect learning traces, and manage student data.</p>
        </div>
        <div className={styles.headerActions}>
          <button className={styles.exportBtn} onClick={() => handleExport('csv')} disabled={exportLoading}>
            <FiDownload /> {exportLoading ? 'Exporting...' : 'Export CSV'}
          </button>
          <button className={styles.exportBtn} onClick={() => handleExport('json')} disabled={exportLoading}>
            <FiDownload /> JSON
          </button>
        </div>
      </header>

      <section className={styles.controlBar}>
        <label className={styles.searchInput}>
          <FiSearch />
          <input type="text" placeholder="Search by email or name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
        </label>
        <select className={styles.select} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as any)}>
          <option value="ALL">All Roles</option>
          <option value="USER">Students</option>
          <option value="ADMIN">Admins</option>
        </select>
        <select className={styles.select} value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
          <option value="recent">Sort: Recent Activity</option>
          <option value="engagement">Sort: Engagement</option>
          <option value="completion">Sort: Completion</option>
          <option value="email">Sort: Email A-Z</option>
        </select>
      </section>

      <section className={styles.statGrid}>
        <article className={styles.statCard}>
          <span className={styles.statIcon}><FiUsers /></span>
          <div><p className={styles.statLabel}>Total Students</p><h3>{studentUsers.length}</h3></div>
        </article>
        <article className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.statIconGreen}`}><FiTrendingUp /></span>
          <div><p className={styles.statLabel}>Active (2 Days)</p><h3>{activeCount}</h3></div>
        </article>
        <article className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.statIconGray}`}><FiClock /></span>
          <div><p className={styles.statLabel}>Idle (7+ Days)</p><h3>{idleCount}</h3></div>
        </article>
        <article className={styles.statCard}>
          <span className={`${styles.statIcon} ${styles.statIconOrange}`}><FiActivity /></span>
          <div><p className={styles.statLabel}>Avg Engagement</p><h3>{avgEngagement}%</h3></div>
        </article>
      </section>

      {isLoading ? (
        <div className={styles.loading}>Loading students...</div>
      ) : error ? (
        <div className={styles.error}><FiAlertCircle /> {error}</div>
      ) : (
        <section className={styles.workspace}>
          <aside className={styles.studentRail}>
            <div className={styles.railHeader}>
              <h3>Student List</h3>
              <span>{displayedUsers.length} records</span>
            </div>
            {displayedUsers.length === 0 ? (
              <p className={styles.noData}>No users matched your filter.</p>
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
                          <h4>{u.name !== 'Unknown' ? u.name : u.email}</h4>
                          {u.name !== 'Unknown' && <span className={styles.emailSub}>{u.email}</span>}
                        </div>
                        <div className={styles.badgeGroup}>
                          <span className={styles.stageBadge} style={{ color: stageConfig.color, background: stageConfig.bg }}>{stageConfig.label}</span>
                          <span className={`${styles.roleBadge} ${u.role.toUpperCase() === 'ADMIN' ? styles.adminBadge : styles.userBadge}`}>{u.role}</span>
                        </div>
                      </div>
                      <div className={styles.metaRow}>
                        <span className={`${styles.statusPill} ${styles[`status_${status.tone}`]}`}>{status.label}</span>
                        <span>Joined {formatDate(u.createdAt)}</span>
                      </div>
                      <div className={styles.progressRow}>
                        <div className={styles.miniProgress}>
                          <span className={styles.miniLabel}>Eng</span>
                          <div className={styles.miniBar}><div className={styles.miniFill} style={{ width: `${u.engagementScore}%` }} /></div>
                          <span className={styles.miniValue}>{u.engagementScore}%</span>
                        </div>
                        <div className={styles.miniProgress}>
                          <span className={styles.miniLabel}>Comp</span>
                          <div className={styles.miniBar}><div className={styles.miniFillGreen} style={{ width: `${u.courseCompletionRate}%` }} /></div>
                          <span className={styles.miniValue}>{u.courseCompletionRate}%</span>
                        </div>
                      </div>
                      <div className={styles.countGrid}>
                        <span title="Courses"><FiFileText /> {u.totalCourses}</span>
                        <span title="Quizzes"><FiCheckSquare /> {u.totalQuizzes}</span>
                        <span title="Journals"><FiBookOpen /> {u.totalJournals}</span>
                        <span title="Transcripts"><FiMessageCircle /> {u.totalTranscripts}</span>
                        <span title="Questions"><FiHelpCircle /> {u.totalAskQuestions}</span>
                        <span title="Challenges"><FiTarget /> {u.totalChallenges}</span>
                        <span title="Discussions"><FiZap /> {u.totalDiscussions}</span>
                        <span title="Feedbacks"><FiStar /> {u.totalFeedbacks}</span>
                      </div>
                      <div className={styles.cardFooter}>
                        <small>Last: {u.lastActivity || 'N/A'}</small>
                        <div className={styles.footerActions}>
                          <button className={styles.viewDetailBtn} onClick={(e) => { e.stopPropagation(); router.push(`/admin/users/${u.id}`) }} title="View detail">
                            <FiExternalLink />
                          </button>
                          <button
                            className={`${styles.deleteBtn} ${u.role.toUpperCase() === 'ADMIN' ? styles.disabled : ''}`}
                            onClick={(e) => { e.stopPropagation(); if (u.role.toUpperCase() !== 'ADMIN') handleDelete(u.id, u.email) }}
                            disabled={u.role.toUpperCase() === 'ADMIN' || deleteInProgress === u.id}
                            title="Delete user"
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
              <div className={styles.emptyDetail}>Select a student to inspect activity.</div>
            ) : (
              <>
                <header className={styles.detailHeader}>
                  <div>
                    <h2>{selectedUser.name !== 'Unknown' ? selectedUser.name : selectedUser.email}</h2>
                    <p>{selectedUser.name !== 'Unknown' ? `${selectedUser.email} · ` : ''}Role {selectedUser.role} · Joined {formatDate(selectedUser.createdAt)}</p>
                  </div>
                  <button className={styles.viewDetailFullBtn} onClick={() => router.push(`/admin/users/${selectedUser.id}`)}>
                    <FiExternalLink /> Full Detail
                  </button>
                </header>

                <div className={styles.detailStatsGrid}>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalCourses}</span><span className={styles.detailStatLabel}>Courses</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalQuizzes}</span><span className={styles.detailStatLabel}>Quizzes</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalJournals}</span><span className={styles.detailStatLabel}>Journals</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalTranscripts}</span><span className={styles.detailStatLabel}>Transcripts</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalAskQuestions}</span><span className={styles.detailStatLabel}>Questions</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalChallenges}</span><span className={styles.detailStatLabel}>Challenges</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.totalDiscussions}</span><span className={styles.detailStatLabel}>Discussions</span></div>
                  <div className={styles.detailStatItem}><span className={styles.detailStatNum}>{selectedUser.engagementScore}%</span><span className={styles.detailStatLabel}>Engagement</span></div>
                </div>

                <div className={styles.tabs}>
                  <button className={activeTab === 'overview' ? styles.tabActive : ''} onClick={() => setActiveTab('overview')}>Overview</button>
                  <button className={activeTab === 'activity' ? styles.tabActive : ''} onClick={() => setActiveTab('activity')}>Timeline</button>
                </div>

                {activityLoading && <div className={styles.loading}>Loading activity...</div>}
                {activityError && <div className={styles.error}><FiAlertCircle /> {activityError}</div>}

                {activeTab === 'overview' && !activityLoading && (
                  <div className={styles.activityGrid}>
                    <article className={styles.activityCard}>
                      <h4>💬 Discussions</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.discussions ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentDiscussion ? `Last: ${new Date(activitySummary.recentDiscussion.updatedAt).toLocaleString()}` : 'No discussions'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>📓 Journals</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.journals ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentJournal ? (activitySummary.recentJournal.title ?? 'Latest journal') : 'No journals'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>📝 Transcripts</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.transcripts ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentTranscript ? (activitySummary.recentTranscript.title ?? 'Latest transcript') : 'No transcripts'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>❓ Questions</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.askQuestions ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentAskQuestion ? activitySummary.recentAskQuestion.question.slice(0, 50) : 'No questions'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>🧩 Challenges</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.challenges ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentChallenge ? `Type: ${activitySummary.recentChallenge.challengeType ?? 'N/A'}` : 'No challenges'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>✅ Quizzes</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.quizzes ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentQuiz ? `Last: ${activitySummary.recentQuiz.isCorrect ? 'Correct ✓' : 'Incorrect ✗'}` : 'No quizzes'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>⭐ Feedback</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.feedbacks ?? 0}</p>
                      <p className={styles.activityLabel}>{activitySummary?.recentFeedback ? `Rating: ${activitySummary.recentFeedback.rating ?? 'N/A'}` : 'No feedback'}</p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>📚 Courses</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals?.courses ?? 0}</p>
                      <p className={styles.activityLabel}>Completion: {selectedUser.courseCompletionRate}%</p>
                    </article>
                  </div>
                )}

                {activeTab === 'activity' && !activityLoading && (
                  <div className={styles.timelineWrap}>
                    {timelineEntries.length === 0 ? (
                      <p className={styles.noData}>No recent activity available.</p>
                    ) : (
                      <ul className={styles.timelineList}>
                        {timelineEntries.map((item, index) => (
                          <li key={`${item.label}-${index}`}>
                            <div>
                              <strong>{item.icon} {item.label}</strong>
                              <p>{item.title}</p>
                              {item.detail && <small>{item.detail}</small>}
                            </div>
                            <time>{item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A'}</time>
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
