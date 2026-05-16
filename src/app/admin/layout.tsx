// src/app/admin/layout.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { useRouter, usePathname, useSearchParams } from 'next/navigation'
import {
  FiGrid, FiUsers, FiActivity,
  FiLogOut, FiClipboard, FiMenu, FiX,
  FiDownload, FiBookOpen,
} from 'react-icons/fi'
import { apiFetch } from '@/lib/api-client'
import { AdminModeProvider, useAdminMode } from '@/context/AdminModeContext'
import { AdminModeToggle } from '@/components/admin/AdminModeToggle/AdminModeToggle'
import styles from './layout.module.scss'

interface ModeSwitchStatus {
  currentMode: 'general' | 'research'
  lastSwitch: {
    at: string
    to: string | null
    from: string | null
    adminEmail: string | null
  } | null
}

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(1, Math.floor((now - then) / 1000))
  if (diffSec < 60) return `${diffSec} detik yang lalu`
  const m = Math.floor(diffSec / 60)
  if (m < 60) return `${m} menit yang lalu`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h} jam yang lalu`
  const d = Math.floor(h / 24)
  return `${d} hari yang lalu`
}

interface AdminLayoutProps {
  children: React.ReactNode
}

interface NavItemSpec {
  href: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  // When true, the item is only shown while Mode Penelitian is active.
  // The 5 "always" items (Dasbor, Siswa, Aktivitas, Ekspor) stay visible
  // in both modes so the admin can still operate the app like a normal
  // operator when toggled to Umum.
  researchOnly?: boolean
}

const NAV_ITEMS: NavItemSpec[] = [
  { href: '/admin/dashboard', label: 'Dasbor',    icon: FiGrid },
  { href: '/admin/siswa',     label: 'Siswa',     icon: FiUsers },
  { href: '/admin/aktivitas', label: 'Aktivitas', icon: FiActivity },
  { href: '/admin/riset',     label: 'Riset',     icon: FiClipboard, researchOnly: true },
  { href: '/admin/sumber',    label: 'Sumber',    icon: FiBookOpen,  researchOnly: true },
  { href: '/admin/ekspor',    label: 'Ekspor',    icon: FiDownload },
]

// Research-only routes — when admin is in Mode Umum we redirect away with
// a toast (rendered downstream). Item 10.3 in `rencana-eksekusi-mvr.md`.
const RESEARCH_ONLY_PREFIXES = ['/admin/riset', '/admin/sumber']

function AdminLayoutInner({ children }: AdminLayoutProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { adminMode } = useAdminMode()
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const [modeStatus, setModeStatus] = useState<ModeSwitchStatus | null>(null)

  // Don't show sidebar on login/register pages
  const isAuthPage = pathname === '/admin/login' || pathname === '/admin/register'

  // Close mobile menu on route change
  useEffect(() => {
    setShowMobileMenu(false)
  }, [pathname])

  // Consume `?toast=research-only` set by the URL guard below; show a banner
  // for 5s then strip the param from the URL so refreshes don't re-trigger.
  useEffect(() => {
    if (!searchParams) return
    const flag = searchParams.get('toast')
    if (flag === 'research-only') {
      setToast('Halaman ini hanya tersedia di Mode Penelitian. Aktifkan toggle Penelitian di header.')
      const t = setTimeout(() => {
        setToast(null)
        // Strip query param without triggering a navigation rerender storm.
        router.replace(pathname || '/admin/dashboard')
      }, 5000)
      return () => clearTimeout(t)
    }
  }, [searchParams, router, pathname])

  // URL guard: in Mode Umum, redirect away from research-only pages. The
  // useAdminMode hook seeds from cookie on first client render, so we wait
  // until after that pass to avoid bouncing on the very first paint.
  useEffect(() => {
    if (!pathname) return
    if (adminMode === 'research') return
    const onResearchPath = RESEARCH_ONLY_PREFIXES.some(
      (p) => pathname === p || pathname.startsWith(`${p}/`),
    )
    if (onResearchPath) {
      router.replace('/admin/dashboard?toast=research-only')
    }
  }, [pathname, adminMode, router])

  // Footer audit indicator: fetch the last mode-switch event so the admin
  // can see who toggled the mode and when. Cheap (1 row from api_logs).
  useEffect(() => {
    if (isAuthPage) return
    let cancelled = false
    apiFetch('/api/admin/mode-switch')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setModeStatus(data as ModeSwitchStatus)
      })
      .catch(() => { /* footer is non-critical */ })
    return () => { cancelled = true }
  }, [isAuthPage, adminMode])

  const handleLogout = async () => {
    try {
      const response = await apiFetch('/api/admin/logout', { method: 'POST' })
      if (!response.ok) {
        const detail = await response.json().catch(() => ({}))
        throw new Error(detail.error || 'Gagal keluar dari panel admin')
      }
      router.push('/admin/login')
    } catch (error) {
      console.error('[AdminLayout] Logout failed:', error)
    }
  }

  if (isAuthPage) {
    return <>{children}</>
  }

  const visibleNavItems = NAV_ITEMS.filter(
    (item) => !item.researchOnly || adminMode === 'research',
  )

  return (
    <div className={styles.adminLayout} data-admin-mode={adminMode}>
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
        <div className={styles.mobileToggleWrap}>
          <AdminModeToggle />
        </div>
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
            {visibleNavItems.map((item) => {
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
        {/* Desktop top bar — hosts the mode toggle + persistent banner.
            Hidden on mobile because the mobile header already carries it. */}
        <div className={styles.desktopTopBar}>
          {adminMode === 'research' && (
            <span className={styles.researchBanner}>
              🔬 Mode Penelitian aktif — hanya data dari course <code>mode=&apos;research&apos;</code> yang ditampilkan.
            </span>
          )}
          {adminMode === 'general' && <span className={styles.generalBanner} />}
          <AdminModeToggle />
        </div>
        {toast && (
          <div role="status" className={styles.modeToast}>{toast}</div>
        )}
        {children}
        <footer className={styles.modeFooter}>
          <span>
            Mode aktif: {adminMode === 'research' ? '🔬 Penelitian' : '🌐 Umum'}
          </span>
          {modeStatus?.lastSwitch?.at && (
            <span className={styles.modeFooterMeta}>
              Terakhir diubah {formatRelative(modeStatus.lastSwitch.at)}
              {modeStatus.lastSwitch.adminEmail ? ` oleh ${modeStatus.lastSwitch.adminEmail}` : ''}
            </span>
          )}
        </footer>
      </main>
    </div>
  )
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <AdminModeProvider>
      <AdminLayoutInner>{children}</AdminLayoutInner>
    </AdminModeProvider>
  )
}
