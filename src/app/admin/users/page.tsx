// src/app/admin/users/page.tsx
'use client'

import React, { useEffect, useMemo, useState } from 'react'
import styles from './page.module.scss'
import { useRouter, usePathname } from 'next/navigation'
import { FiTrash2, FiLogOut, FiHome, FiUsers, FiActivity, FiAlertCircle, FiBookOpen, FiCheckSquare, FiMessageCircle, FiFileText } from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'

interface UserRow {
  id: string
  email: string
  role: string
  createdAt: string
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

export default function AdminUsersPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { admin, loading: authLoading } = useAdmin()
  const [users, setUsers] = useState<UserRow[]>([])
  const [filterUser, setFilterUser] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteInProgress, setDeleteInProgress] = useState<string | null>(null)
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [activitySummary, setActivitySummary] = useState<ActivitySummary | null>(null)
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState<string | null>(null)

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

  const handleRowClick = (
    event: React.MouseEvent<HTMLTableRowElement>,
    id: string
  ) => {
    if ((event.target as HTMLElement).closest('button')) {
      return
    }
    setSelectedUserId(id)
  }

  const displayedUsers = useMemo(
    () =>
      filterUser
        ? users.filter((u) => u.id === filterUser)
        : users,
    [filterUser, users]
  )

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

  if (authLoading) return <div className={styles.loading}>Loading...</div>;
  if (!admin) return null;

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>Principle Learn</div>
        <nav>
          <ul className={styles.navList}>
            <li
              className={`${styles.navItem} ${
                pathname === '/admin/dashboard' ? styles.active : ''
              }`}
              onClick={() => router.push('/admin/dashboard')}
            >
              <FiHome className={styles.navIcon} /> Dashboard
            </li>
            <li
              className={`${styles.navItem} ${
                pathname === '/admin/users' ? styles.active : ''
              }`}
              onClick={() => router.push('/admin/users')}
            >
              <FiUsers className={styles.navIcon} /> Users
            </li>
            <li
              className={`${styles.navItem} ${
                pathname === '/admin/activity' ? styles.active : ''
              }`}
              onClick={() => router.push('/admin/activity')}
            >
              <FiActivity className={styles.navIcon} /> Activity
            </li>
          </ul>
        </nav>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <h1 className={styles.pageTitle}>User Management</h1>
          <div className={styles.filters}>
            <select
              className={styles.select}
              value={filterUser}
              onChange={(e) => setFilterUser(e.target.value)}
            >
              <option value="">All Users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.email}
                </option>
              ))}
            </select>
          </div>
          <button className={styles.logout} onClick={() => router.push('/admin/login')}>
            <FiLogOut /> Log out
          </button>
        </header>

        {isLoading ? (
          <div className={styles.loading}>Loading users...</div>
        ) : error ? (
          <div className={styles.error}>
            <FiAlertCircle /> {error}
          </div>
        ) : (
          <section className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Registered</th>
                  <th>
                    <div className={styles.iconHeader}>
                      <FiFileText title="Generated Courses" />
                    </div>
                  </th>
                  <th>
                    <div className={styles.iconHeader}>
                      <FiMessageCircle title="Transcripts" />
                    </div>
                  </th>
                  <th>
                    <div className={styles.iconHeader}>
                      <FiCheckSquare title="Quizzes" />
                    </div>
                  </th>
                  <th>
                    <div className={styles.iconHeader}>
                      <FiBookOpen title="Journals" />
                    </div>
                  </th>
                  <th>Last Activity</th>
                  <th>Actions</th>
                </tr>
              </thead>
                  <tbody>
                    {displayedUsers.length === 0 ? (
                      <tr>
                        <td colSpan={9} className={styles.noData}>No users found</td>
                      </tr>
                    ) : (
                      displayedUsers.map((u) => (
                        <tr
                          key={u.id}
                          className={[
                            styles.userRow,
                            u.role === 'ADMIN' ? styles.adminRow : '',
                            selectedUserId === u.id ? styles.activeRow : '',
                          ].join(' ')}
                          onClick={(event) => handleRowClick(event, u.id)}
                        >
                          <td>{u.email}</td>
                          <td>
                            <span className={`${styles.roleBadge} ${u.role === 'ADMIN' ? styles.adminBadge : styles.userBadge}`}>
                              {u.role}
                            </span>
                          </td>
                          <td>{formatDate(u.createdAt)}</td>
                          <td>{u.totalGenerate}</td>
                          <td>{u.totalTranscripts}</td>
                          <td>{u.totalQuizzes}</td>
                          <td>{u.totalJournals}</td>
                          <td>{u.lastActivity}</td>
                          <td className={styles.actionBtns}>
                            <button 
                              className={`${styles.deleteBtn} ${u.role === 'ADMIN' ? styles.disabled : ''}`} 
                              onClick={() => u.role !== 'ADMIN' && handleDelete(u.id, u.email)}
                              disabled={u.role === 'ADMIN' || deleteInProgress === u.id}
                            >
                              {deleteInProgress === u.id ? 'Deleting...' : (
                                <>
                                  <FiTrash2 /> Delete
                                </>
                              )}
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </section>
            )}
            {selectedUserId && (
              <section className={styles.activityPanel}>
                <header>
                  <h3>Activity Snapshot</h3>
                  <p>Data synced directly from the database tables the user interacts with.</p>
                </header>
                {activityLoading && <div className={styles.loading}>Loading activity details...</div>}
                {activityError && (
                  <div className={styles.error}>
                    <FiAlertCircle /> {activityError}
                  </div>
                )}
                {activitySummary && !activityLoading && !activityError && (
                  <div className={styles.activityGrid}>
                    <div className={styles.activityCard}>
                      <h4>Discussion Sessions</h4>
                      <p className={styles.activityValue}>{activitySummary.totals.discussions}</p>
                      {activitySummary.recentDiscussion ? (
                        <>
                          <p className={styles.activityLabel}>
                            Last session: {new Date(activitySummary.recentDiscussion.updatedAt).toLocaleString()}
                          </p>
                          <p className={styles.activityLabel}>
                            Phase: {activitySummary.recentDiscussion.phase ?? '—'} · Goals {activitySummary.recentDiscussion.goalCount}
                          </p>
                        </>
                      ) : (
                        <p className={styles.activityLabel}>No discussion yet</p>
                      )}
                    </div>
                    <div className={styles.activityCard}>
                      <h4>Journals</h4>
                      <p className={styles.activityValue}>{activitySummary.totals.journals}</p>
                      {activitySummary.recentJournal ? (
                        <>
                          <p className={styles.activityLabel}>
                            Last: {new Date(activitySummary.recentJournal.createdAt).toLocaleString()}
                          </p>
                          <p className={styles.activityLabel}>
                            {activitySummary.recentJournal.title ?? 'Journal entry'}
                          </p>
                          {activitySummary.recentJournal.snippet && (
                            <p className={styles.activityPreview}>
                              {activitySummary.recentJournal.snippet}…
                            </p>
                          )}
                        </>
                      ) : (
                        <p className={styles.activityLabel}>No journal entries</p>
                      )}
                    </div>
                    <div className={styles.activityCard}>
                      <h4>Transcripts</h4>
                      <p className={styles.activityValue}>{activitySummary.totals.transcripts}</p>
                      {activitySummary.recentTranscript ? (
                        <>
                          <p className={styles.activityLabel}>
                            Last: {new Date(activitySummary.recentTranscript.createdAt).toLocaleString()}
                          </p>
                          <p className={styles.activityLabel}>
                            {activitySummary.recentTranscript.title ?? 'Transcript record'}
                          </p>
                        </>
                      ) : (
                        <p className={styles.activityLabel}>No transcripts</p>
                      )}
                    </div>
                  </div>
                )}
              </section>
            )}
          </main>
        </div>
      )
    }
