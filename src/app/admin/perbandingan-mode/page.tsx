'use client'

// src/app/admin/perbandingan-mode/page.tsx
// Halaman demo sidang: split-screen 50/50 Mode Umum vs Mode Penelitian.
// Menampilkan comparison table fitur + live stats dari DB.
// Bekerja di branch principle-learn-3.0 (tanpa AdminModeProvider).

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  FiGlobe, FiSearch, FiCheck, FiMinus, FiRefreshCw,
  FiExternalLink, FiArrowRight,
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import { apiFetch } from '@/lib/api-client'
import styles from './page.module.scss'
import type { PerbandinganModeStatsResponse } from '@/app/api/admin/perbandingan-mode/route'

// ─── Comparison data ────────────────────────────────────────────────────────

interface ComparisonRow {
  feature: string
  general: string | null   // null = tidak tersedia
  research: string | null
}

const ROWS: ComparisonRow[] = [
  {
    feature: 'Pembuatan kursus',
    general: 'Custom topic apa saja',
    research: 'Pilih dari 4 template Fase E pre-seeded',
  },
  {
    feature: 'AI Sokratik',
    general: 'Default prompt (tier tunggal)',
    research: 'Graduated tier 1→2→3 + RAG citation dari bank sumber',
  },
  {
    feature: 'Konten subtopik',
    general: 'Generate on-demand, cache key biasa',
    research: 'Pre-generated + locked + QA workflow review (pending/approved/needs_revision)',
  },
  {
    feature: 'Bank sumber',
    general: null,
    research: '14 PDF terupload + 541 material_chunks ter-embed',
  },
  {
    feature: 'Interactive blocks',
    general: null,
    research: '6 komponen di 18+ leaf subtopik (TraceTable, BugHunt, FlowchartBuilder, dll.)',
  },
  {
    feature: 'Research artifacts',
    general: null,
    research: 'Tracked dengan rubric + interaction events per submission',
  },
  {
    feature: 'Pipeline RM2/RM3',
    general: null,
    research: 'Prompt classifications + auto cognitive scoring + triangulation records',
  },
  {
    feature: 'Inter-Rater Reliability',
    general: null,
    research: 'Codebook + rater UI + Cohen κ live counter per coding run',
  },
  {
    feature: 'Ekspor data',
    general: 'Activity log basic (JSON)',
    research: 'Research bundle ZIP (5 CSV + README) — RM2 & RM3 ready',
  },
  {
    feature: 'Admin tooling',
    general: 'Dasbor + Siswa + Aktivitas + Ekspor',
    research: '+ Bukti / Kognitif / Triangulasi / Sumber / Readiness / Ekspor Riset',
  },
]

// ─── Minimal cookie helper (tidak bergantung AdminModeProvider) ───────────────

const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30

function setAdminModeCookie(mode: 'general' | 'research') {
  if (typeof document === 'undefined') return
  const secure =
    typeof window !== 'undefined' && window.location.protocol === 'https:'
      ? '; Secure'
      : ''
  document.cookie =
    `admin_mode=${mode}; Path=/; SameSite=Lax; Max-Age=${THIRTY_DAYS_SECONDS}${secure}`
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function PerbandinganModePage() {
  const router = useRouter()
  const { admin, loading: authLoading } = useAdmin()

  const [stats, setStats] = useState<PerbandinganModeStatsResponse | null>(null)
  const [statsLoading, setStatsLoading] = useState(true)
  const [statsError, setStatsError] = useState<string | null>(null)
  const [rowsVisible, setRowsVisible] = useState(false)

  useEffect(() => {
    if (!authLoading && !admin) router.push('/admin/login')
  }, [authLoading, admin, router])

  const fetchStats = useCallback(async () => {
    setStatsLoading(true)
    setStatsError(null)
    try {
      const res = await apiFetch('/api/admin/perbandingan-mode', { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data: PerbandinganModeStatsResponse = await res.json()
      setStats(data)
    } catch {
      setStatsError('Gagal memuat statistik live. Data statis tetap ditampilkan.')
    } finally {
      setStatsLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!authLoading && admin) {
      fetchStats()
      // Trigger staggered reveal setelah stats selesai
      const t = setTimeout(() => setRowsVisible(true), 200)
      return () => clearTimeout(t)
    }
  }, [authLoading, admin, fetchStats])

  const switchAndGo = (mode: 'general' | 'research') => {
    setAdminModeCookie(mode)
    router.push('/admin/dashboard')
  }

  if (authLoading) {
    return <div className={styles.loading}>Memuat...</div>
  }

  return (
    <div className={styles.page}>
      {/* ── Page header ── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Perbandingan Mode</h1>
          <p className={styles.pageSubtitle}>
            Demonstrasi perbedaan fitur Mode Umum vs Mode Penelitian dalam sistem PrincipleLearn
          </p>
        </div>
        <button
          className={styles.refreshBtn}
          onClick={fetchStats}
          disabled={statsLoading}
          title="Perbarui statistik"
          aria-label="Perbarui statistik live"
        >
          <FiRefreshCw className={statsLoading ? styles.spinning : ''} />
          <span>Perbarui</span>
        </button>
      </div>

      {statsError && (
        <div className={styles.statsError} role="status">
          {statsError}
        </div>
      )}

      {/* ── Split panel headers ── */}
      <div className={styles.panelHeaders} aria-hidden>
        {/* Mode Umum */}
        <div className={`${styles.panelHeader} ${styles.panelHeaderGeneral}`}>
          <div className={styles.panelBadge}>
            <FiGlobe className={styles.panelIcon} />
            <span>Mode Umum</span>
          </div>
          <p className={styles.panelDesc}>
            Platform pembelajaran mandiri — siswa bisa memilih topik bebas &amp; belajar kapan saja
          </p>
          <div className={styles.panelStats}>
            {statsLoading ? (
              <span className={styles.statLoading}>Memuat...</span>
            ) : (
              <>
                <span className={styles.statItem}>
                  <strong>{stats?.general.courses ?? '—'}</strong> kursus
                </span>
                <span className={styles.statSep} />
                <span className={styles.statItem}>
                  <strong>{stats?.general.activeStudents ?? '—'}</strong> siswa aktif
                </span>
              </>
            )}
          </div>
        </div>

        {/* Mode Penelitian */}
        <div className={`${styles.panelHeader} ${styles.panelHeaderResearch}`}>
          <div className={styles.panelBadge}>
            <FiSearch className={styles.panelIcon} />
            <span>Mode Penelitian</span>
          </div>
          <p className={styles.panelDesc}>
            Platform penelitian thesis — konten dikontrol, aktivitas di-track, pipeline RM2 &amp; RM3 aktif
          </p>
          <div className={styles.panelStats}>
            {statsLoading ? (
              <span className={styles.statLoading}>Memuat...</span>
            ) : (
              <>
                <span className={styles.statItem}>
                  <strong>{stats?.research.courses ?? '—'}</strong> kursus
                </span>
                <span className={styles.statSep} />
                <span className={styles.statItem}>
                  <strong>{stats?.research.activeStudents ?? '—'}</strong> siswa pilot
                </span>
                <span className={styles.statSep} />
                <span className={styles.statItem}>
                  <strong>{stats?.materialChunks ?? '—'}</strong> chunks
                </span>
                <span className={styles.statSep} />
                <span className={styles.statItem}>
                  <strong>{stats?.researchArtifacts ?? '—'}</strong> artifacts
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Comparison table ── */}
      <div className={`${styles.comparisonTable} ${rowsVisible ? styles.rowsVisible : ''}`}>
        {/* Column labels (sticky scroll) */}
        <div className={styles.tableHead}>
          <div className={styles.tableHeadFeature}>Fitur</div>
          <div className={`${styles.tableHeadCol} ${styles.tableHeadGeneral}`}>
            <FiGlobe /> Mode Umum
          </div>
          <div className={`${styles.tableHeadCol} ${styles.tableHeadResearch}`}>
            <FiSearch /> Mode Penelitian
          </div>
        </div>

        {/* Rows */}
        {ROWS.map((row, i) => (
          <div
            key={row.feature}
            className={styles.tableRow}
            style={{ '--row-index': i } as React.CSSProperties}
          >
            <div className={styles.cellFeature}>{row.feature}</div>
            <div className={`${styles.cell} ${styles.cellGeneral}`}>
              {row.general ? (
                <>
                  <span className={`${styles.availBadge} ${styles.availGeneral}`}>
                    <FiCheck />
                    <span>Tersedia</span>
                  </span>
                  <span className={styles.cellText}>{row.general}</span>
                </>
              ) : (
                <span className={styles.notAvail}>
                  <FiMinus />
                  <span>Tidak tersedia</span>
                </span>
              )}
            </div>
            <div className={`${styles.cell} ${styles.cellResearch}`}>
              {row.research ? (
                <>
                  <span className={`${styles.availBadge} ${styles.availResearch}`}>
                    <FiCheck />
                    <span>Tersedia</span>
                  </span>
                  <span className={styles.cellText}>{row.research}</span>
                </>
              ) : (
                <span className={styles.notAvail}>
                  <FiMinus />
                  <span>Tidak tersedia</span>
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ── Extra live stats row ── */}
      {!statsLoading && stats && (
        <div className={styles.liveStatsRow}>
          <div className={`${styles.liveStatCard} ${styles.liveStatResearch}`}>
            <span className={styles.liveStatValue}>{stats.materialChunks}</span>
            <span className={styles.liveStatLabel}>material_chunks ter-embed</span>
          </div>
          <div className={`${styles.liveStatCard} ${styles.liveStatResearch}`}>
            <span className={styles.liveStatValue}>{stats.interactiveBlocksLeaves}</span>
            <span className={styles.liveStatLabel}>leaf subtopik dengan interactive blocks</span>
          </div>
          <div className={`${styles.liveStatCard} ${styles.liveStatResearch}`}>
            <span className={styles.liveStatValue}>{stats.researchArtifacts}</span>
            <span className={styles.liveStatLabel}>research artifacts tersimpan</span>
          </div>
        </div>
      )}

      {/* ── Bottom CTA ── */}
      <div className={styles.ctaRow}>
        <div className={styles.ctaCard}>
          <div className={styles.ctaIcon} data-mode="general">
            <FiGlobe />
          </div>
          <div className={styles.ctaBody}>
            <strong>Mode Umum</strong>
            <p>Lihat dashboard dengan filter Mode Umum</p>
          </div>
          <button
            className={`${styles.ctaBtn} ${styles.ctaBtnGeneral}`}
            onClick={() => switchAndGo('general')}
          >
            Buka Dashboard <FiArrowRight />
          </button>
        </div>

        <div className={styles.ctaCard}>
          <div className={styles.ctaIcon} data-mode="research">
            <FiSearch />
          </div>
          <div className={styles.ctaBody}>
            <strong>Mode Penelitian</strong>
            <p>Lihat dashboard dengan filter Mode Penelitian</p>
          </div>
          <button
            className={`${styles.ctaBtn} ${styles.ctaBtnResearch}`}
            onClick={() => switchAndGo('research')}
          >
            Buka Dashboard <FiArrowRight />
          </button>
        </div>

        <div className={styles.ctaCard}>
          <div className={styles.ctaIcon} data-mode="research">
            <FiExternalLink />
          </div>
          <div className={styles.ctaBody}>
            <strong>Pipeline Riset</strong>
            <p>Bukti, kognitif, triangulasi, dan readiness data</p>
          </div>
          <button
            className={`${styles.ctaBtn} ${styles.ctaBtnResearch}`}
            onClick={() => {
              setAdminModeCookie('research')
              router.push('/admin/riset')
            }}
          >
            Buka Riset <FiArrowRight />
          </button>
        </div>
      </div>
    </div>
  )
}
