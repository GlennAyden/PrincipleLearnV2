// src/app/admin/layout.tsx
'use client'

import React, { useState, useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import {
  FiGrid, FiUsers, FiActivity,
  FiLogOut, FiClipboard, FiMenu, FiX,
  FiDownload,
} from 'react-icons/fi'
import { apiFetch } from '@/lib/api-client'
import styles from './layout.module.scss'

interface AdminLayoutProps {
  children: React.ReactNode
}

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dasbor', icon: FiGrid },
  { href: '/admin/siswa', label: 'Siswa', icon: FiUsers },
  { href: '/admin/aktivitas', label: 'Aktivitas', icon: FiActivity },
  { href: '/admin/riset', label: 'Riset', icon: FiClipboard },
  { href: '/admin/ekspor', label: 'Ekspor', icon: FiDownload },
]

export default function AdminLayout({ children }: AdminLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  // Don't show sidebar on login/register pages
  const isAuthPage = pathname === '/admin/login' || pathname === '/admin/register'

  // Close mobile menu on route change
  useEffect(() => {
    setShowMobileMenu(false)
  }, [pathname])

  const handleLogout = async () => {
    await apiFetch('/api/admin/logout', { method: 'POST' })
    router.push('/admin/login')
  }

  if (isAuthPage) {
    return <>{children}</>
  }

  return (
    <div className={styles.adminLayout}>
      {/* Mobile header bar */}
      <div className={styles.mobileHeader}>
        <button
          className={styles.hamburgerBtn}
          onClick={() => setShowMobileMenu(!showMobileMenu)}
          aria-label={showMobileMenu ? 'Tutup menu' : 'Buka menu'}
        >
          {showMobileMenu ? <FiX /> : <FiMenu />}
        </button>
        <span className={styles.mobileTitle}>PrincipleLearn Admin</span>
      </div>

      {/* Overlay */}
      {showMobileMenu && (
        <div
          className={styles.overlay}
          onClick={() => setShowMobileMenu(false)}
        />
      )}

      <aside className={`${styles.sidebar} ${showMobileMenu ? styles.sidebarVisible : ''}`}>
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
            <span>Keluar</span>
          </button>
        </div>
      </aside>

      <main className={styles.mainContent}>
        {children}
      </main>
    </div>
  )
}
