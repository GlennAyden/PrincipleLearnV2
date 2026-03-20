// src/app/admin/layout.tsx
'use client'

import React from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  FiGrid, FiUsers, FiActivity,
  FiBarChart2, FiMessageCircle,
  FiLogOut, FiClipboard
} from 'react-icons/fi'
import styles from './layout.module.scss'

interface AdminLayoutProps {
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Overview', icon: FiGrid },
  { href: '/admin/users', label: 'Students', icon: FiUsers },
  { href: '/admin/activity', label: 'Activity', icon: FiActivity },
  { href: '/admin/insights', label: 'Insights', icon: FiBarChart2 },
  { href: '/admin/discussions', label: 'Discussions', icon: FiMessageCircle },
  { href: '/admin/research', label: 'Research', icon: FiClipboard },
]

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()

  // Don't show sidebar on login/register pages
  const isAuthPage = pathname === '/admin/login' || pathname === '/admin/register'

  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
    router.push('/admin/login')
  }

  if (isAuthPage) {
    return <>{children}</>
  }

  return (
    <div className={styles.adminLayout}>
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.logo}>
            <div className={styles.logoIcon}>
              <svg width="22" height="22" viewBox="0 0 28 28" fill="none">
                <path d="M8 14L12 18L20 10" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <span className={styles.logoText}>PrincipleLearn</span>
          </div>
          <span className={styles.logoSub}>Research Admin</span>
        </div>

        <nav className={styles.nav}>
          <ul className={styles.navList}>
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + '/')
              return (
                <li
                  key={item.href}
                  className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                  onClick={() => router.push(item.href)}
                >
                  <item.icon className={styles.navIcon} />
                  <span>{item.label}</span>
                </li>
              )
            })}
          </ul>
        </nav>

        <div className={styles.sidebarFooter}>
          <button className={styles.logoutBtn} onClick={handleLogout}>
            <FiLogOut />
            <span>Log out</span>
          </button>
        </div>
      </aside>

      <main className={styles.mainContent}>
        {children}
      </main>
    </div>
  )
}
