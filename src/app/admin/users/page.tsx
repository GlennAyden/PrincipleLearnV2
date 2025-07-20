// src/app/admin/users/page.tsx
'use client'

import React, { useEffect, useState } from 'react'
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

export default function AdminUsersPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { admin, loading: authLoading } = useAdmin()
  const [users, setUsers] = useState<UserRow[]>([])
  const [filterUser, setFilterUser] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deleteInProgress, setDeleteInProgress] = useState<string | null>(null)

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

  const displayedUsers = filterUser
    ? users.filter((u) => u.id === filterUser)
    : users;
    
  // Format date string to local format
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString();
  };

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
                    <tr key={u.id} className={u.role === 'ADMIN' ? styles.adminRow : ''}>
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
      </main>
    </div>
  )
}
