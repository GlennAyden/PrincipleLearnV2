'use client'

// src/components/admin/ActivityTimeline/ActivityTimeline.tsx
// Pure-SVG horizontal activity timeline for the student detail page.
// 6 swim lanes: Session, Tanya AI, Quiz, Challenge, Jurnal, Artifact.
// Dot animation on first render, vertical hover guideline, zoom controls.

import React, { useCallback, useEffect, useRef, useState } from 'react'
import styles from './ActivityTimeline.module.scss'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface TimelineEvent {
  kind: 'session' | 'ask' | 'quiz' | 'challenge' | 'jurnal' | 'artifact'
  at: string
  label: string
  sublabel?: string
  metadata?: Record<string, unknown>
}

type Range = 'day' | 'week' | 'all'

interface ActivityTimelineProps {
  userId: string
}

// ─── Lane config ─────────────────────────────────────────────────────────────

const LANES: {
  kind: TimelineEvent['kind']
  label: string
  color: string
  trackColor: string
}[] = [
  { kind: 'session',   label: 'Sesi',      color: '#3b82f6', trackColor: '#dbeafe' },
  { kind: 'ask',       label: 'Tanya AI',  color: '#8b5cf6', trackColor: '#ede9fe' },
  { kind: 'quiz',      label: 'Quiz',      color: '#22c55e', trackColor: '#dcfce7' },
  { kind: 'challenge', label: 'Challenge', color: '#f97316', trackColor: '#ffedd5' },
  { kind: 'jurnal',    label: 'Jurnal',    color: '#ec4899', trackColor: '#fce7f3' },
  { kind: 'artifact',  label: 'Artefak',  color: '#06b6d4', trackColor: '#cffafe' },
]

const LANE_HEIGHT = 44
const LABEL_WIDTH = 80
const PADDING_V = 12
const DOT_R = 6
const SVG_HEIGHT = LANES.length * LANE_HEIGHT + PADDING_V * 2

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string) {
  try {
    return new Date(iso).toLocaleString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

function formatDateShort(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
    })
  } catch {
    return iso
  }
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ActivityTimeline({ userId }: ActivityTimelineProps) {
  const [range, setRange] = useState<Range>('all')
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [animated, setAnimated] = useState(false)

  // Tooltip state
  const [tooltip, setTooltip] = useState<{
    event: TimelineEvent
    x: number
    y: number
  } | null>(null)
  const [guideX, setGuideX] = useState<number | null>(null)

  const svgRef = useRef<SVGSVGElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [svgWidth, setSvgWidth] = useState(800)

  // Observe container width for responsive SVG
  useEffect(() => {
    if (!wrapRef.current) return
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width
      if (w && w > 0) setSvgWidth(w)
    })
    obs.observe(wrapRef.current)
    return () => obs.disconnect()
  }, [])

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    setError(null)
    setAnimated(false)
    try {
      const res = await fetch(
        `/api/admin/siswa/${userId}/timeline?range=${range}`,
        { credentials: 'include' }
      )
      if (!res.ok) {
        const d = await res.json().catch(() => ({}))
        throw new Error(d.error || `HTTP ${res.status}`)
      }
      const data = await res.json()
      setEvents(data.events ?? [])
      // Trigger animation after a small delay
      setTimeout(() => setAnimated(true), 80)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat timeline')
    } finally {
      setLoading(false)
    }
  }, [userId, range])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  // Compute time domain
  const chartWidth = svgWidth - LABEL_WIDTH - 16
  const timestamps = events.map((e) => new Date(e.at).getTime())
  const minT = timestamps.length > 0 ? Math.min(...timestamps) : Date.now() - 3600_000
  const maxT = timestamps.length > 0 ? Math.max(...timestamps) : Date.now()
  const domainSpan = Math.max(maxT - minT, 60_000) // at least 1 minute

  const toX = (iso: string) => {
    const t = new Date(iso).getTime()
    return LABEL_WIDTH + ((t - minT) / domainSpan) * chartWidth
  }

  const toLane = (kind: TimelineEvent['kind']) => LANES.findIndex((l) => l.kind === kind)

  const laneCY = (laneIdx: number) => PADDING_V + laneIdx * LANE_HEIGHT + LANE_HEIGHT / 2

  // X-axis tick marks
  const NUM_TICKS = Math.max(2, Math.min(6, Math.floor(chartWidth / 100)))
  const ticks = Array.from({ length: NUM_TICKS + 1 }, (_, i) => {
    const t = minT + (i / NUM_TICKS) * domainSpan
    return { t, x: LABEL_WIDTH + (i / NUM_TICKS) * chartWidth }
  })

  // Mouse handlers on SVG
  const handleSvgMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const svgX = ((e.clientX - rect.left) / rect.width) * svgWidth
    setGuideX(svgX > LABEL_WIDTH ? svgX : null)
  }
  const handleSvgMouseLeave = () => {
    setGuideX(null)
    setTooltip(null)
  }

  const handleDotMouseEnter = (
    ev: React.MouseEvent<SVGCircleElement>,
    event: TimelineEvent
  ) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect) return
    const x = ev.clientX - rect.left
    const y = ev.clientY - rect.top
    setTooltip({ event, x, y })
  }
  const handleDotMouseLeave = () => setTooltip(null)

  if (loading) return <div className={styles.loading}>Memuat timeline...</div>
  if (error) return <div className={styles.error}>{error}</div>

  return (
    <div className={styles.root}>
      {/* Controls */}
      <div className={styles.controls}>
        <span className={styles.controlLabel}>Rentang:</span>
        {(['day', 'week', 'all'] as Range[]).map((r) => (
          <button
            key={r}
            className={`${styles.rangeBtn} ${range === r ? styles.rangeBtnActive : ''}`}
            onClick={() => setRange(r)}
          >
            {r === 'day' ? 'Hari Ini' : r === 'week' ? '7 Hari' : 'Semua'}
          </button>
        ))}
        <span className={styles.eventCount}>{events.length} event</span>
      </div>

      {events.length === 0 ? (
        <div className={styles.empty}>Tidak ada aktivitas dalam rentang ini.</div>
      ) : (
        <div className={styles.svgWrap} ref={wrapRef}>
          <svg
            ref={svgRef}
            width={svgWidth}
            height={SVG_HEIGHT}
            className={styles.svg}
            onMouseMove={handleSvgMouseMove}
            onMouseLeave={handleSvgMouseLeave}
            aria-label="Timeline aktivitas siswa"
          >
            {/* Lane tracks */}
            {LANES.map((lane, idx) => (
              <g key={lane.kind}>
                {/* Lane background */}
                <rect
                  x={LABEL_WIDTH}
                  y={laneCY(idx) - LANE_HEIGHT / 2 + 2}
                  width={chartWidth}
                  height={LANE_HEIGHT - 4}
                  fill={lane.trackColor}
                  rx={6}
                  className={styles.laneTrack}
                />
                {/* Lane center line */}
                <line
                  x1={LABEL_WIDTH}
                  y1={laneCY(idx)}
                  x2={LABEL_WIDTH + chartWidth}
                  y2={laneCY(idx)}
                  stroke={lane.color}
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.4}
                />
                {/* Lane label */}
                <text
                  x={LABEL_WIDTH - 8}
                  y={laneCY(idx)}
                  textAnchor="end"
                  dominantBaseline="middle"
                  className={styles.laneLabel}
                  fill={lane.color}
                >
                  {lane.label}
                </text>
              </g>
            ))}

            {/* X-axis ticks */}
            {ticks.map(({ t, x }, i) => (
              <g key={i}>
                <line
                  x1={x}
                  y1={PADDING_V}
                  x2={x}
                  y2={SVG_HEIGHT - PADDING_V}
                  stroke="#e2e8f0"
                  strokeWidth={1}
                />
                <text
                  x={x}
                  y={SVG_HEIGHT - 2}
                  textAnchor="middle"
                  className={styles.tickLabel}
                  fill="#94a3b8"
                >
                  {formatDateShort(new Date(t).toISOString())}
                </text>
              </g>
            ))}

            {/* Hover guideline */}
            {guideX != null && (
              <line
                x1={guideX}
                y1={PADDING_V}
                x2={guideX}
                y2={SVG_HEIGHT - PADDING_V}
                stroke="#6366f1"
                strokeWidth={1}
                strokeDasharray="4 2"
                opacity={0.6}
                className={styles.guideline}
              />
            )}

            {/* Event dots */}
            {events.map((ev, i) => {
              const laneIdx = toLane(ev.kind)
              if (laneIdx < 0) return null
              const cx = toX(ev.at)
              const cy = laneCY(laneIdx)
              const lane = LANES[laneIdx]
              return (
                <circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={DOT_R}
                  fill={lane.color}
                  stroke="white"
                  strokeWidth={2}
                  className={`${styles.dot} ${animated ? styles.dotVisible : ''}`}
                  style={{ animationDelay: `${i * 18}ms` }}
                  onMouseEnter={(e) => handleDotMouseEnter(e, ev)}
                  onMouseLeave={handleDotMouseLeave}
                />
              )
            })}
          </svg>

          {/* Tooltip */}
          {tooltip && (
            <div
              className={styles.tooltip}
              style={{
                left: Math.min(tooltip.x + 12, svgWidth - 220),
                top: Math.max(tooltip.y - 60, 0),
              }}
            >
              <div className={styles.tooltipKind}
                style={{ color: LANES.find((l) => l.kind === tooltip.event.kind)?.color }}
              >
                {tooltip.event.label}
              </div>
              <div className={styles.tooltipTime}>{formatDateTime(tooltip.event.at)}</div>
              {tooltip.event.sublabel && (
                <div className={styles.tooltipSub}>{tooltip.event.sublabel}</div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Legend */}
      <div className={styles.legend}>
        {LANES.map((lane) => (
          <span key={lane.kind} className={styles.legendItem}>
            <span className={styles.legendDot} style={{ background: lane.color }} />
            {lane.label}
          </span>
        ))}
      </div>
    </div>
  )
}
