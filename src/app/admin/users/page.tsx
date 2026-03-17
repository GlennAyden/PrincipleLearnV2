// src/app/admin/users/page.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'
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
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'

interface UserRow {
  id: string
  email: string
  role: string
  createdAt: string
  created_at?: string
  totalGenerate: number
  totalTranscripts: number
  totalQuizzes: number
  totalJournals: number
  totalSoalOtomatis: number
  lastActivity: string
}

interface ActivitySummary {
  userId: string
  email: string
  recentDiscussion: {
    sessionId: string
    status: string
    phase: string | null
    updatedAt: string
    goalCount: number
  } | null
  recentJournal: {
    id: string
    title?: string
    snippet?: string | null
    createdAt: string
  } | null
  recentTranscript: {
    id: string
    title?: string
    createdAt: string
  } | null
  totals: {
    discussions: number
    journals: number
    transcripts: number
  }
}

interface CourseSubtopicSummary {
  courseId: string
  courseTitle: string
  subtopics: Array<{
    subtopicId: string
    title: string
    orderIndex: number
  }>
}

interface DeleteLogEntry {
  id: string
  subtopicId: string | null
  subtopicTitle: string
  courseId: string
  adminEmail: string | null
  createdAt: string
  note?: string | null
}

export default function AdminUsersPage() {
  const router = useRouter()
  const { admin, loading: authLoading } = useAdmin()
  const [users, setUsers] = useState<UserRow[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'USER' | 'ADMIN'>('ALL')
  const [sortBy, setSortBy] = useState<'recent' | 'email' | 'engagement'>('recent')
  const [activeTab, setActiveTab] = useState<'overview' | 'activity' | 'subtopics'>('overview')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteInProgress, setDeleteInProgress] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)
  const [subtopicData, setSubtopicData] = useState<{ courses: CourseSubtopicSummary[]; deleteLogs: DeleteLogEntry[] } | null>(null)
  const [subtopicLoading, setSubtopicLoading] = useState(false)
  const [subtopicError, setSubtopicError] = useState<string | null>(null)
  const [subtopicAction, setSubtopicAction] = useState<string | null>(null)

  // Fetch users data
  useEffect(() => {
    if (authLoading) return;
    
    if (!admin) {
      router.push('/admin/login');
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    fetch('/api/admin/users', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || 'Failed to fetch users');
        }
        return res.json();
      })
      .then(setUsers)
      .catch(err => {
        console.error('Error fetching users:', err);
        setError(err.message || 'Failed to fetch users');
      })
      .finally(() => setIsLoading(false));
  }, [admin, authLoading, router])

  const handleDelete = async (id: string, email: string) => {
    if (typeof window !== 'undefined' && !confirm(`Are you sure you want to delete user ${email}? This will permanently delete all their data including courses, quizzes, transcripts, and journals.`)) {
      return;
    }
    
    try {
      setDeleteInProgress(id);
      
      const response = await fetch(`/api/admin/users/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete user');
      }
      
      // Remove user from the list
      setUsers((prev) => prev.filter((u) => u.id !== id));
      if (typeof window !== 'undefined') {
        alert(`User ${email} has been successfully deleted.`);
      }
    } catch (error: any) {
      console.error('Error deleting user:', error);
      if (typeof window !== 'undefined') {
        alert(`Failed to delete user: ${error.message}`);
      }
    } finally {
      setDeleteInProgress(null);
    }
  }

  const parseDate = (value?: string | null) => {
    if (!value) return null
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return null
    return parsed
  }

  const getActivityStatus = (lastActivity?: string | null) => {
    const last = parseDate(lastActivity)
    if (!last) {
      return { label: 'No Activity', tone: 'cold' as const }
    }

    const diffMs = Date.now() - last.getTime()
    const diffDays = diffMs / (1000 * 60 * 60 * 24)

    if (diffDays <= 2) return { label: 'Active', tone: 'hot' as const }
    if (diffDays <= 7) return { label: 'Warm', tone: 'warm' as const }
    return { label: 'Idle', tone: 'cold' as const }
  }

  const getCreatedAt = (user: UserRow) => user.createdAt || user.created_at || ''

  const getEngagementScore = (user: UserRow) => {
    return user.totalGenerate * 3 + user.totalQuizzes * 2 + user.totalJournals * 2 + user.totalTranscripts
  }

  const isSubtopicLogged = (subtopicId: string) => {
    return subtopicData?.deleteLogs.some((log) => log.subtopicId === subtopicId) ?? false
  }

  const handleLogSubtopicDelete = async (courseId: string, subtopicId: string, title: string) => {
    if (!selectedUserId) return
    if (typeof window !== 'undefined') {
      const confirm = window.confirm(`Log delete untuk subtopik "${title}"? Ini tidak akan menghapus data siswa.`)
      if (!confirm) return
    }

    try {
      setSubtopicAction(subtopicId)
      const response = await fetch(`/api/admin/users/${selectedUserId}/subtopics`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ courseId, subtopicId }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to log delete' }))
        throw new Error(error.message || 'Failed to log delete')
      }
      const data: DeleteLogEntry = await response.json()
      setSubtopicData((prev) =>
        prev
          ? {
              courses: prev.courses,
              deleteLogs: [data, ...prev.deleteLogs],
            }
          : prev
      )
    } catch (error: any) {
      console.error('Error logging delete action:', error)
      if (typeof window !== 'undefined') {
        window.alert(error.message || 'Gagal mencatat delete log')
      }
    } finally {
      setSubtopicAction(null)
    }
  }

  const displayedUsers = useMemo(
    () => {
      const normalizedSearch = searchTerm.trim().toLowerCase()
      const list = users
        .filter((user) => (roleFilter === 'ALL' ? true : user.role.toUpperCase() === roleFilter))
        .filter((user) => {
          if (!normalizedSearch) return true
          return user.email.toLowerCase().includes(normalizedSearch)
        })

      const sorted = [...list]
      if (sortBy === 'email') {
        sorted.sort((a, b) => a.email.localeCompare(b.email))
      }
      if (sortBy === 'engagement') {
        sorted.sort((a, b) => getEngagementScore(b) - getEngagementScore(a))
      }
      if (sortBy === 'recent') {
        sorted.sort((a, b) => {
          const aTime = parseDate(a.lastActivity)?.getTime() ?? 0
          const bTime = parseDate(b.lastActivity)?.getTime() ?? 0
          return bTime - aTime
        })
      }

      return sorted
    },
    [roleFilter, searchTerm, sortBy, users]
  )

  const studentUsers = useMemo(
    () => users.filter((u) => u.role.toUpperCase() === 'USER'),
    [users]
  )

  const activeCount = useMemo(
    () => studentUsers.filter((u) => getActivityStatus(u.lastActivity).tone === 'hot').length,
    [studentUsers]
  )

  const idleCount = useMemo(
    () => studentUsers.filter((u) => getActivityStatus(u.lastActivity).tone === 'cold').length,
    [studentUsers]
  )

  const selectedUser = useMemo(
    () => users.find((u) => u.id === selectedUserId) ?? null,
    [selectedUserId, users]
  )

  const timelineEntries = useMemo(() => {
    if (!activitySummary) return []
    const entries: Array<{ label: string; title: string; timestamp?: string | null; detail?: string | null }> = []
    if (activitySummary.recentDiscussion) {
      entries.push({
        label: 'Discussion',
        title: 'Latest discussion session',
        timestamp: activitySummary.recentDiscussion.updatedAt,
        detail: `Phase ${activitySummary.recentDiscussion.phase ?? 'N/A'} · Goals ${activitySummary.recentDiscussion.goalCount}`,
      })
    }
    if (activitySummary.recentJournal) {
      entries.push({
        label: 'Journal',
        title: activitySummary.recentJournal.title ?? 'Latest journal entry',
        timestamp: activitySummary.recentJournal.createdAt,
        detail: activitySummary.recentJournal.snippet ?? null,
      })
    }
    if (activitySummary.recentTranscript) {
      entries.push({
        label: 'Transcript',
        title: activitySummary.recentTranscript.title ?? 'Latest transcript',
        timestamp: activitySummary.recentTranscript.createdAt,
      })
    }

    return entries.sort((a, b) => {
      const aTime = parseDate(a.timestamp)?.getTime() ?? 0
      const bTime = parseDate(b.timestamp)?.getTime() ?? 0
      return bTime - aTime
    })
  }, [activitySummary])

  useEffect(() => {
    if (displayedUsers.length === 0) {
      setSelectedUserId(null)
      return
    }

    if (!selectedUserId || !displayedUsers.some((u) => u.id === selectedUserId)) {
      setSelectedUserId(displayedUsers[0].id)
    }
  }, [displayedUsers, selectedUserId])
    
  // Format date string to local format
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

  useEffect(() => {
    if (!selectedUserId) {
      setActivitySummary(null)
      return
    }

    setActivityLoading(true)
    setActivityError(null)

    fetch(`/api/admin/users/${selectedUserId}/activity-summary`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ message: 'Failed to load details' }))
          throw new Error(errorData.message || 'Failed to load activity data')
        }
        return res.json()
      })
      .then((data) => setActivitySummary(data))
      .catch((err) => {
        console.error('Error loading activity summary:', err)
        setActivityError(err.message || 'Unable to load activity detail')
      })
      .finally(() => setActivityLoading(false))
  }, [selectedUserId])

  useEffect(() => {
    if (!selectedUserId) {
      setSubtopicData(null)
      return
    }
    setSubtopicLoading(true)
    setSubtopicError(null)

    fetch(`/api/admin/users/${selectedUserId}/subtopics`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({ message: 'Failed to load subtopics' }))
          throw new Error(errorData.message || 'Failed to load subtopics')
        }
        return res.json()
      })
      .then((data) => setSubtopicData(data))
      .catch((err) => {
        console.error('Error loading subtopic list:', err)
        setSubtopicError(err.message || 'Unable to load subtopic data')
      })
      .finally(() => setSubtopicLoading(false))
  }, [selectedUserId])

  if (authLoading) return <div className={styles.loading}>Loading...</div>
  if (!admin) return null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.pageTitle}>Students Workspace</h1>
          <p className={styles.pageSubtitle}>Monitor engagement, inspect learning traces, and manage student actions in one place.</p>
        </div>
      </header>

      <section className={styles.controlBar}>
        <label className={styles.searchInput}>
          <FiSearch />
          <input
            type="text"
            placeholder="Search by email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </label>
        <select className={styles.select} value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'ALL' | 'USER' | 'ADMIN')}>
          <option value="ALL">All Roles</option>
          <option value="USER">Students</option>
          <option value="ADMIN">Admins</option>
        </select>
        <select className={styles.select} value={sortBy} onChange={(e) => setSortBy(e.target.value as 'recent' | 'email' | 'engagement')}>
          <option value="recent">Sort: Recent Activity</option>
          <option value="engagement">Sort: Engagement</option>
          <option value="email">Sort: Email A-Z</option>
        </select>
      </section>

      <section className={styles.statGrid}>
        <article className={styles.statCard}>
          <span className={styles.statIcon}><FiUsers /></span>
          <div>
            <p className={styles.statLabel}>Total Students</p>
            <h3>{studentUsers.length}</h3>
          </div>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statIcon}><FiTrendingUp /></span>
          <div>
            <p className={styles.statLabel}>Active (2 Days)</p>
            <h3>{activeCount}</h3>
          </div>
        </article>
        <article className={styles.statCard}>
          <span className={styles.statIcon}><FiClock /></span>
          <div>
            <p className={styles.statLabel}>Idle (7+ Days)</p>
            <h3>{idleCount}</h3>
          </div>
        </article>
      </section>

      {isLoading ? (
        <div className={styles.loading}>Loading students...</div>
      ) : error ? (
        <div className={styles.error}>
          <FiAlertCircle /> {error}
        </div>
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
                  return (
                    <article
                      key={u.id}
                      className={`${styles.studentCard} ${isActive ? styles.studentCardActive : ''}`}
                      onClick={() => setSelectedUserId(u.id)}
                    >
                      <div className={styles.studentCardTop}>
                        <h4>{u.email}</h4>
                        <span className={`${styles.roleBadge} ${u.role.toUpperCase() === 'ADMIN' ? styles.adminBadge : styles.userBadge}`}>
                          {u.role}
                        </span>
                      </div>

                      <div className={styles.metaRow}>
                        <span className={`${styles.statusPill} ${styles[`status_${status.tone}`]}`}>{status.label}</span>
                        <span>Joined {formatDate(getCreatedAt(u))}</span>
                      </div>

                      <div className={styles.countGrid}>
                        <span><FiFileText /> {u.totalGenerate}</span>
                        <span><FiCheckSquare /> {u.totalQuizzes}</span>
                        <span><FiBookOpen /> {u.totalJournals}</span>
                        <span><FiMessageCircle /> {u.totalTranscripts}</span>
                      </div>

                      <div className={styles.cardFooter}>
                        <small>Last activity: {u.lastActivity || 'N/A'}</small>
                        <button
                          className={`${styles.deleteBtn} ${u.role.toUpperCase() === 'ADMIN' ? styles.disabled : ''}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            if (u.role.toUpperCase() !== 'ADMIN') {
                              handleDelete(u.id, u.email)
                            }
                          }}
                          disabled={u.role.toUpperCase() === 'ADMIN' || deleteInProgress === u.id}
                        >
                          {deleteInProgress === u.id ? 'Deleting...' : <FiTrash2 />}
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </aside>

          <section className={styles.detailPanel}>
            {!selectedUser ? (
              <div className={styles.emptyDetail}>Select a student to inspect activity and actions.</div>
            ) : (
              <>
                <header className={styles.detailHeader}>
                  <div>
                    <h2>{selectedUser.email}</h2>
                    <p>
                      Role {selectedUser.role} · Joined {formatDate(getCreatedAt(selectedUser))}
                    </p>
                  </div>
                  <div className={styles.detailStats}>
                    <span>Courses {selectedUser.totalGenerate}</span>
                    <span>Quizzes {selectedUser.totalQuizzes}</span>
                    <span>Journals {selectedUser.totalJournals}</span>
                  </div>
                </header>

                <div className={styles.tabs}>
                  <button className={activeTab === 'overview' ? styles.tabActive : ''} onClick={() => setActiveTab('overview')}>Overview</button>
                  <button className={activeTab === 'activity' ? styles.tabActive : ''} onClick={() => setActiveTab('activity')}>Timeline</button>
                  <button className={activeTab === 'subtopics' ? styles.tabActive : ''} onClick={() => setActiveTab('subtopics')}>Subtopic Actions</button>
                </div>

                {activityLoading && activeTab !== 'subtopics' && <div className={styles.loading}>Loading activity details...</div>}
                {activityError && activeTab !== 'subtopics' && (
                  <div className={styles.error}>
                    <FiAlertCircle /> {activityError}
                  </div>
                )}

                {activeTab === 'overview' && (
                  <div className={styles.activityGrid}>
                    <article className={styles.activityCard}>
                      <h4>Discussion Sessions</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals.discussions ?? 0}</p>
                      <p className={styles.activityLabel}>
                        {activitySummary?.recentDiscussion
                          ? `Last: ${new Date(activitySummary.recentDiscussion.updatedAt).toLocaleString()}`
                          : 'No discussion yet'}
                      </p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>Journals</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals.journals ?? 0}</p>
                      <p className={styles.activityLabel}>
                        {activitySummary?.recentJournal
                          ? activitySummary.recentJournal.title ?? 'Latest journal'
                          : 'No journal entries'}
                      </p>
                    </article>
                    <article className={styles.activityCard}>
                      <h4>Transcripts</h4>
                      <p className={styles.activityValue}>{activitySummary?.totals.transcripts ?? 0}</p>
                      <p className={styles.activityLabel}>
                        {activitySummary?.recentTranscript
                          ? activitySummary.recentTranscript.title ?? 'Latest transcript'
                          : 'No transcript records'}
                      </p>
                    </article>
                  </div>
                )}

                {activeTab === 'activity' && (
                  <div className={styles.timelineWrap}>
                    {timelineEntries.length === 0 ? (
                      <p className={styles.noData}>No recent activity available.</p>
                    ) : (
                      <ul className={styles.timelineList}>
                        {timelineEntries.map((item, index) => (
                          <li key={`${item.label}-${index}`}>
                            <div>
                              <strong>{item.label}</strong>
                              <p>{item.title}</p>
                              {item.detail ? <small>{item.detail}</small> : null}
                            </div>
                            <time>{item.timestamp ? new Date(item.timestamp).toLocaleString() : 'N/A'}</time>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {activeTab === 'subtopics' && (
                  <section className={styles.subtopicPanel}>
                    <header>
                      <h3>Subtopic Admin Actions</h3>
                      <p>Catat permintaan delete subtopic tanpa menghapus data siswa.</p>
                    </header>
                    {subtopicLoading && <div className={styles.loading}>Loading subtopics...</div>}
                    {subtopicError && (
                      <div className={styles.error}>
                        <FiAlertCircle /> {subtopicError}
                      </div>
                    )}
                    {!subtopicLoading && !subtopicError && (
                      <>
                        {subtopicData && subtopicData.courses.length > 0 ? (
                          <div className={styles.subtopicCourses}>
                            {subtopicData.courses.map((course) => (
                              <article key={course.courseId} className={styles.courseCard}>
                                <div className={styles.courseHeader}>
                                  <div>
                                    <h4>{course.courseTitle}</h4>
                                    <span>{course.subtopics.length} subtopic</span>
                                  </div>
                                </div>
                                {course.subtopics.length === 0 ? (
                                  <p className={styles.noData}>Course belum memiliki subtopic</p>
                                ) : (
                                  <ul className={styles.subtopicList}>
                                    {course.subtopics.map((subtopic) => {
                                      const logged = isSubtopicLogged(subtopic.subtopicId)
                                      const isBusy = subtopicAction === subtopic.subtopicId
                                      return (
                                        <li key={subtopic.subtopicId} className={styles.subtopicItem}>
                                          <div className={styles.subtopicMeta}>
                                            <strong>{subtopic.title}</strong>
                                            <span>Order #{subtopic.orderIndex + 1}</span>
                                          </div>
                                          <button
                                            className={`${styles.subtopicActionBtn} ${logged ? styles.deleteLogged : ''}`}
                                            disabled={logged || isBusy}
                                            onClick={() =>
                                              handleLogSubtopicDelete(course.courseId, subtopic.subtopicId, subtopic.title)
                                            }
                                          >
                                            {logged ? 'Logged' : isBusy ? 'Saving…' : 'Log Delete'}
                                          </button>
                                        </li>
                                      )
                                    })}
                                  </ul>
                                )}
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className={styles.noData}>User ini belum memiliki course.</p>
                        )}
                        {subtopicData && subtopicData.deleteLogs.length > 0 && (
                          <div className={styles.logList}>
                            <h4>Riwayat Delete Terbaru</h4>
                            <ul>
                              {subtopicData.deleteLogs.slice(0, 6).map((log) => (
                                <li key={log.id}>
                                  <div>
                                    <strong>{log.subtopicTitle}</strong>
                                    <span>{new Date(log.createdAt).toLocaleString()}</span>
                                  </div>
                                  <small>{log.adminEmail ?? 'Admin'}</small>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </>
                    )}
                  </section>
                )}
              </>
            )}
          </section>
        </section>
      )}
    </div>
  )
}
