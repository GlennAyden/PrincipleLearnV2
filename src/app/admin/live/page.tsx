// src/app/admin/live/page.tsx
'use client'

import React, { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { useAdmin } from '@/hooks/useAdmin'
import { apiFetch } from '@/lib/api-client'
import TokenMeter from '@/components/admin/TokenMeter/TokenMeter'
import styles from './page.module.scss'

const REFRESH_INTERVAL_MS = 10_000

interface BloomDistribution {
  apply: number
  analyze: number
  evaluate: number
  create: number
}

interface LatestEvent {
  label: string
  user_email: string
  status_code: number | null
  created_at: string
}

interface LiveMetrics {
  activeSessions: number
  activeUsers: number
  tokensToday: number | null
  bloomDistribution: BloomDistribution
  latestEvents: LatestEvent[]
  generatedAt: string
}

const BLOOM_LABELS: Record<keyof BloomDistribution, string> = {
  apply:    'Apply',
  analyze:  'Analyze',
  evaluate: 'Evaluate',
  create:   'Create',
}

const BLOOM_COLORS: Record<keyof BloomDistribution, string> = {
  apply:    '#60a5fa',
  analyze:  '#34d399',
  evaluate: '#fbbf24',
  create:   '#a78bfa',
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  if (isNaN(d.getTime())) return '—'
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  const s = String(d.getSeconds()).padStart(2, '0')
  return `${h}:${m}:${s}`
}

function BloomBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0
  return (
    <div className={styles.bloomRow}>
      <span className={styles.bloomLabel}>{label}</span>
      <div className={styles.bloomTrack}>
        <div className={styles.bloomFill} style={{ width: `${pct}%`, background: color }} />
      </div>
      <span className={styles.bloomCount}>{value}</span>
    </div>
  )
}

export default function AdminLivePage() {
  const router = useRouter()
  const { admin, loading: authLoading } = useAdmin()
  const [metrics, setMetrics] = useState<LiveMetrics | null>(null)
  const [newEventKeys, setNewEventKeys] = useState<Set<string>>(new Set())
  const [lastFetch, setLastFetch] = useState<Date | null>(null)
  const [fetchError, setFetchError] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Store previous events in a ref so the polling callback doesn't need to be recreated
  const prevEventsRef = useRef<LatestEvent[]>([])

  useEffect(() => {
    if (!authLoading && !admin) router.push('/admin/login')
  }, [authLoading, admin, router])

  const fetchMetrics = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/live/metrics', { cache: 'no-store' })
      if (!res.ok) { setFetchError(true); return }
      const data: LiveMetrics = await res.json()

      // Detect new event rows by comparing created_at+label of first items
      const prev = prevEventsRef.current
      if (prev.length > 0 && data.latestEvents.length > 0) {
        const prevFirstKey = prev[0].created_at + prev[0].label
        const newKeys = new Set<string>()
        for (const ev of data.latestEvents) {
          const key = ev.created_at + ev.label
          if (key === prevFirstKey) break
          newKeys.add(key)
        }
        if (newKeys.size > 0) {
          setNewEventKeys(newKeys)
          setTimeout(() => setNewEventKeys(new Set()), 1200)
        }
      }

      prevEventsRef.current = data.latestEvents
      setMetrics(data)
      setLastFetch(new Date())
      setFetchError(false)
    } catch {
      setFetchError(true)
    }
  }, [])

  // Polling loop — stable callback via useCallback([], [])
  useEffect(() => {
    if (authLoading || !admin) return

    fetchMetrics()

    const schedule = () => {
      timerRef.current = setTimeout(async () => {
        if (document.visibilityState === 'visible') {
          await fetchMetrics()
        }
        schedule()
      }, REFRESH_INTERVAL_MS)
    }

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        if (timerRef.current) clearTimeout(timerRef.current)
        fetchMetrics().then(schedule)
      }
    }

    schedule()
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [authLoading, admin, fetchMetrics])

  if (authLoading) {
    return <div className={styles.bootScreen}>Memuat...</div>
  }

  const bloom = metrics?.bloomDistribution
  const bloomMax = bloom ? Math.max(...Object.values(bloom), 1) : 1

  return (
    <div className={styles.page}>
      {/* Header bar */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.liveDot} />
          <span className={styles.liveLabel}>LIVE</span>
          <span className={styles.headerTitle}>PrincipleLearn — Monitor Sidang</span>
        </div>
        <div className={styles.headerRight}>
          {fetchError && <span className={styles.errorChip}>Gagal memuat</span>}
          {lastFetch && (
            <span className={styles.lastFetch}>
              Diperbarui {formatTime(lastFetch.toISOString())}
            </span>
          )}
          <span className={styles.adminEmail}>{admin?.email}</span>
        </div>
      </header>

      {/* 2×2 grid */}
      <div className={styles.grid}>

        {/* Sektor 1 — Aktivitas Saat Ini */}
        <div className={styles.sector}>
          <h2 className={styles.sectorTitle}>Aktivitas Saat Ini</h2>
          <div className={styles.metricPair}>
            <div className={styles.bigMetric}>
              <span className={styles.bigNumber}>{metrics?.activeSessions ?? '—'}</span>
              <span className={styles.bigLabel}>Sesi Aktif</span>
              <span className={styles.bigSub}>started &lt;30 menit lalu</span>
            </div>
            <div className={styles.bigMetric}>
              <span className={styles.bigNumber}>{metrics?.activeUsers ?? '—'}</span>
              <span className={styles.bigLabel}>Siswa Online</span>
              <span className={styles.bigSub}>user unik dalam sesi aktif</span>
            </div>
          </div>
        </div>

        {/* Sektor 2 — Token & Cost (TokenMeter komponen) */}
        <div className={styles.sector}>
          <h2 className={styles.sectorTitle}>Token &amp; Estimasi Biaya</h2>
          <div className={styles.tokenMeterWrap}>
            <TokenMeter dark compact defaultPeriod="today" />
          </div>
        </div>

        {/* Sektor 3 — Bloom Distribution */}
        <div className={styles.sector}>
          <h2 className={styles.sectorTitle}>Bloom Distribution</h2>
          <p className={styles.sectorSub}>prompt_classifications — 24 jam terakhir</p>
          {bloom ? (
            <div className={styles.bloomChart}>
              {(Object.keys(BLOOM_LABELS) as (keyof BloomDistribution)[]).map(key => (
                <BloomBar
                  key={key}
                  label={BLOOM_LABELS[key]}
                  value={bloom[key]}
                  max={bloomMax}
                  color={BLOOM_COLORS[key]}
                />
              ))}
              <p className={styles.bloomTotal}>
                Total: {Object.values(bloom).reduce((a, b) => a + b, 0)} prompt diklasifikasi
              </p>
            </div>
          ) : (
            <p className={styles.emptyNote}>Memuat...</p>
          )}
        </div>

        {/* Sektor 4 — Latest Events */}
        <div className={styles.sector}>
          <h2 className={styles.sectorTitle}>Latest Events</h2>
          <p className={styles.sectorSub}>api_logs — 10 baris terbaru · refresh 10d</p>
          <div className={styles.eventList}>
            {metrics?.latestEvents.length === 0 && (
              <p className={styles.emptyNote}>Belum ada event</p>
            )}
            {metrics?.latestEvents.map((ev, i) => {
              const key = ev.created_at + ev.label
              const isNew = newEventKeys.has(key)
              const isError = ev.status_code !== null && ev.status_code >= 400
              return (
                <div
                  key={`${key}-${i}`}
                  className={`${styles.eventRow} ${isNew ? styles.eventNew : ''} ${isError ? styles.eventError : ''}`}
                >
                  <span className={styles.eventTime}>{formatTime(ev.created_at)}</span>
                  <span className={styles.eventPath}>{ev.label}</span>
                  <span className={styles.eventEmail}>{ev.user_email}</span>
                  {ev.status_code && (
                    <span className={isError ? styles.statusErr : styles.statusOk}>
                      {ev.status_code}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>

      </div>
    </div>
  )
}
