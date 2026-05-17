'use client';
// src/components/admin/TokenMeter/TokenMeter.tsx

import React, { useEffect, useRef, useState, useCallback } from 'react';
import styles from './TokenMeter.module.scss';
import { apiFetch } from '@/lib/api-client';

// ─── Types ─────────────────────────────────────────────────────────────────

type Period = 'today' | 'week' | 'month' | 'all';

interface EndpointStat {
  key: string;
  label: string;
  tokens: number;
  calls: number;
  costUsd: number;
  costIdr: number;
}

interface DayPoint {
  date: string;
  tokens: number;
  costUsd: number;
  costIdr: number;
}

interface TokenMeterData {
  totalTokens: number;
  totalCalls: number;
  estimatedCostUSD: number;
  estimatedCostIDR: number;
  byEndpoint: EndpointStat[];
  byDay: DayPoint[];
  meta: {
    period: string;
    hasRealTokenData: boolean;
    kursIdr: number;
    pricePerMillionUSD: number;
  };
}

interface TokenMeterProps {
  /** Initial period filter — dapat di-override oleh user melalui dropdown. */
  defaultPeriod?: Period;
  /** Tampilkan dalam mode dark (untuk halaman /admin/live). */
  dark?: boolean;
  /** Sembunyikan header card (jika embed di sektor live yang sudah punya title). */
  compact?: boolean;
}

// ─── Konstanta ─────────────────────────────────────────────────────────────

const PERIOD_OPTIONS: { value: Period; label: string }[] = [
  { value: 'today', label: 'Hari ini' },
  { value: 'week',  label: '7 hari' },
  { value: 'month', label: '30 hari' },
  { value: 'all',   label: 'Semua' },
];

/** Refresh otomatis setiap 60 detik */
const AUTO_REFRESH_MS = 60_000;

// ─── Helpers ───────────────────────────────────────────────────────────────

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000)     return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

function fmtUsd(n: number): string {
  if (n < 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

function fmtIdr(n: number): string {
  if (n < 1) return `Rp ${n.toFixed(2)}`;
  return `Rp ${Math.round(n).toLocaleString('id-ID')}`;
}

function fmtDateShort(iso: string): string {
  const [, month, day] = iso.split('-');
  return `${parseInt(day)}/${parseInt(month)}`;
}

// ─── Count-up hook ─────────────────────────────────────────────────────────

function useCountUp(target: number, durationMs = 900): number {
  const [value, setValue] = useState(0);
  const prevTarget = useRef(0);

  useEffect(() => {
    const start = prevTarget.current;
    prevTarget.current = target;

    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (reduced || target === start) {
      setValue(target);
      return;
    }

    let raf: number;
    let startTime: number | null = null;

    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // easeOutCubic
      setValue(Math.round(start + eased * (target - start)));
      if (progress < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);

  return value;
}

// ─── Sparkline SVG ─────────────────────────────────────────────────────────

function Sparkline({ data, dark }: { data: DayPoint[]; dark: boolean }) {
  const [hovIdx, setHovIdx] = useState<number | null>(null);

  const W = 240;
  const H = 52;
  const PAD = 6;

  const maxT = Math.max(...data.map((d) => d.tokens), 1);
  const pts = data.map((d, i) => ({
    x: PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2),
    y: H - PAD - (d.tokens / maxT) * (H - PAD * 2),
    ...d,
  }));

  const line = pts.map((p) => `${p.x},${p.y}`).join(' ');
  const area = pts.length > 0
    ? `M${pts[0].x},${H} ${pts.map((p) => `L${p.x},${p.y}`).join(' ')} L${pts[pts.length - 1].x},${H} Z`
    : '';

  const fillColor = dark ? '#818cf8' : '#6366f1';
  const dotColor  = dark ? '#c7d2fe' : '#a5b4fc';

  return (
    <div className={styles.sparkWrap}>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className={styles.sparkSvg}
        aria-label="Grafik token 7 hari terakhir"
        onMouseLeave={() => setHovIdx(null)}
      >
        <defs>
          <linearGradient id="tmGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={fillColor} stopOpacity={dark ? 0.35 : 0.2} />
            <stop offset="100%" stopColor={fillColor} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#tmGrad)" />
        <polyline
          points={line}
          fill="none"
          stroke={fillColor}
          strokeWidth="1.75"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={hovIdx === i ? 4 : 2.5}
            fill={hovIdx === i ? fillColor : dotColor}
            className={styles.sparkDot}
            onMouseEnter={() => setHovIdx(i)}
          />
        ))}
        {/* X-axis date labels */}
        {pts
          .filter((_, i) => i === 0 || i === pts.length - 1 || i === Math.floor(pts.length / 2))
          .map((p, i) => (
            <text
              key={i}
              x={p.x}
              y={H + 12}
              textAnchor="middle"
              fontSize="8"
              fill={dark ? '#6b7280' : '#94a3b8'}
            >
              {fmtDateShort(p.date)}
            </text>
          ))}
      </svg>
      {hovIdx !== null && (
        <div
          className={`${styles.sparkTip} ${dark ? styles.sparkTipDark : ''}`}
          style={{ left: `${(pts[hovIdx].x / W) * 100}%` }}
        >
          <strong>{fmtDateShort(data[hovIdx].date)}</strong>
          <span>{fmtTokens(data[hovIdx].tokens)} token</span>
          <span>{fmtIdr(data[hovIdx].costIdr)}</span>
        </div>
      )}
    </div>
  );
}

// ─── Endpoint bar chart ────────────────────────────────────────────────────

function EndpointBars({ data, totalTokens, dark }: {
  data: EndpointStat[];
  totalTokens: number;
  dark: boolean;
}) {
  const max = Math.max(...data.map((d) => d.tokens), 1);

  const BAR_COLORS = [
    '#6366f1', '#8b5cf6', '#ec4899', '#3b82f6', '#06b6d4', '#10b981',
  ];

  return (
    <div className={styles.epBars}>
      {data.map((ep, i) => {
        const pct = Math.round((ep.tokens / max) * 100);
        const share = totalTokens > 0 ? Math.round((ep.tokens / totalTokens) * 100) : 0;
        return (
          <div key={ep.key} className={styles.epRow}>
            <span className={`${styles.epLabel} ${dark ? styles.epLabelDark : ''}`}>
              {ep.label}
            </span>
            <div className={styles.epTrack}>
              <div
                className={styles.epFill}
                style={{ width: `${pct}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}
              />
            </div>
            <span className={`${styles.epStat} ${dark ? styles.epStatDark : ''}`}>
              {fmtTokens(ep.tokens)}
              <span className={styles.epShare}>{share}%</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export default function TokenMeter({
  defaultPeriod = 'today',
  dark = false,
  compact = false,
}: TokenMeterProps) {
  const [period, setPeriod] = useState<Period>(defaultPeriod);
  const [data, setData] = useState<TokenMeterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/token-meter?period=${period}`);
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error((e as { error?: string }).error ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as TokenMeterData;
      setData(json);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Gagal memuat data token');
    } finally {
      setLoading(false);
    }
  }, [period]);

  // Fetch saat mount atau period berubah
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh 60 detik
  useEffect(() => {
    const schedule = () => {
      timerRef.current = setTimeout(async () => {
        if (document.visibilityState === 'visible') await fetchData();
        schedule();
      }, AUTO_REFRESH_MS);
    };

    const handleVis = () => {
      if (document.visibilityState === 'visible') {
        if (timerRef.current) clearTimeout(timerRef.current);
        fetchData().then(schedule);
      }
    };

    schedule();
    document.addEventListener('visibilitychange', handleVis);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener('visibilitychange', handleVis);
    };
  }, [fetchData]);

  // Animasi angka
  const animTokens  = useCountUp(data?.totalTokens ?? 0);
  const animCalls   = useCountUp(data?.totalCalls ?? 0);
  const animCostCents = useCountUp(Math.round((data?.estimatedCostUSD ?? 0) * 10_000));
  const animCostIdr   = useCountUp(Math.round(data?.estimatedCostIDR ?? 0));

  const rootClass = [
    styles.card,
    dark ? styles.cardDark : '',
    compact ? styles.cardCompact : '',
  ].filter(Boolean).join(' ');

  // ── Loading state ──
  if (loading && !data) {
    return (
      <div className={rootClass}>
        {!compact && (
          <div className={styles.header}>
            <div className={styles.headerLeft}>
              <span className={`${styles.liveDot} ${dark ? styles.liveDotDark : ''}`} />
              <span className={`${styles.liveLabel} ${dark ? styles.liveLabelDark : ''}`}>LIVE</span>
              <span className={`${styles.title} ${dark ? styles.titleDark : ''}`}>Token & Biaya AI</span>
            </div>
          </div>
        )}
        <div className={`${styles.skeleton} ${dark ? styles.skeletonDark : ''}`} />
      </div>
    );
  }

  // ── Error state ──
  if (error) {
    return (
      <div className={`${rootClass} ${styles.cardErr}`}>
        {!compact && (
          <div className={styles.header}>
            <span className={`${styles.title} ${dark ? styles.titleDark : ''}`}>Token & Biaya AI</span>
          </div>
        )}
        <p className={styles.errMsg}>{error}</p>
        <button className={styles.retryBtn} onClick={fetchData}>Coba lagi</button>
      </div>
    );
  }

  const isEmpty = !data || data.totalTokens === 0;
  const hasReal = data?.meta.hasRealTokenData ?? false;

  return (
    <div className={rootClass}>

      {/* ── Header ── */}
      {!compact && (
        <div className={styles.header}>
          <div className={styles.headerLeft}>
            <span className={`${styles.liveDot} ${dark ? styles.liveDotDark : ''}`} />
            <span className={`${styles.liveLabel} ${dark ? styles.liveLabelDark : ''}`}>LIVE</span>
            <span className={`${styles.title} ${dark ? styles.titleDark : ''}`}>Token &amp; Biaya AI</span>
            {!hasReal && !isEmpty && (
              <span className={styles.estBadge}>estimasi</span>
            )}
          </div>
          <div className={styles.headerRight}>
            {lastRefresh && (
              <span className={`${styles.refreshTime} ${dark ? styles.refreshTimeDark : ''}`}>
                {lastRefresh.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
            )}
            <select
              className={`${styles.periodSelect} ${dark ? styles.periodSelectDark : ''}`}
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              aria-label="Pilih periode"
            >
              {PERIOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <button
              className={`${styles.refreshBtn} ${dark ? styles.refreshBtnDark : ''}`}
              onClick={fetchData}
              disabled={loading}
              title="Refresh"
              aria-label="Refresh data token"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={loading ? styles.spinning : undefined}>
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* ── Compact header (periode selector saja) ── */}
      {compact && (
        <div className={styles.compactControls}>
          <select
            className={`${styles.periodSelect} ${dark ? styles.periodSelectDark : ''}`}
            value={period}
            onChange={(e) => setPeriod(e.target.value as Period)}
            aria-label="Pilih periode"
          >
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      )}

      {isEmpty ? (
        <p className={`${styles.emptyMsg} ${dark ? styles.emptyMsgDark : ''}`}>
          Belum ada panggilan AI tercatat untuk periode ini
        </p>
      ) : (
        <>
          {/* ── 4 Stat besar ── */}
          <div className={styles.statsGrid}>
            <div className={`${styles.statCard} ${dark ? styles.statCardDark : ''}`}>
              <span className={`${styles.statValue} ${dark ? styles.statValueDark : ''}`}>
                {fmtTokens(animTokens)}
              </span>
              <span className={`${styles.statLabel} ${dark ? styles.statLabelDark : ''}`}>
                Total Token
              </span>
            </div>
            <div className={`${styles.statCard} ${dark ? styles.statCardDark : ''}`}>
              <span className={`${styles.statValue} ${dark ? styles.statValueDark : ''}`}>
                {animCalls}
              </span>
              <span className={`${styles.statLabel} ${dark ? styles.statLabelDark : ''}`}>
                AI Calls
              </span>
            </div>
            <div className={`${styles.statCard} ${dark ? styles.statCardDark : ''} ${styles.statCardAccent}`}>
              <span className={`${styles.statValue} ${styles.statValueUsd} ${dark ? styles.statValueDark : ''}`}>
                {fmtUsd(animCostCents / 10_000)}
              </span>
              <span className={`${styles.statLabel} ${dark ? styles.statLabelDark : ''}`}>
                Biaya USD
              </span>
            </div>
            <div className={`${styles.statCard} ${dark ? styles.statCardDark : ''} ${styles.statCardAccent}`}>
              <span className={`${styles.statValue} ${styles.statValueIdr} ${dark ? styles.statValueDark : ''}`}>
                {fmtIdr(animCostIdr)}
              </span>
              <span className={`${styles.statLabel} ${dark ? styles.statLabelDark : ''}`}>
                Biaya IDR
              </span>
            </div>
          </div>

          {/* ── Breakdown per endpoint ── */}
          {data.byEndpoint.length > 0 && (
            <div className={styles.section}>
              <h4 className={`${styles.sectionTitle} ${dark ? styles.sectionTitleDark : ''}`}>
                Breakdown per Endpoint
              </h4>
              <EndpointBars
                data={data.byEndpoint}
                totalTokens={data.totalTokens}
                dark={dark}
              />
            </div>
          )}

          {/* ── Sparkline 7 hari ── */}
          {data.byDay.length > 0 && (
            <div className={styles.section}>
              <h4 className={`${styles.sectionTitle} ${dark ? styles.sectionTitleDark : ''}`}>
                7 Hari Terakhir
              </h4>
              <Sparkline data={data.byDay} dark={dark} />
            </div>
          )}

          {/* ── Footer ── */}
          <p className={`${styles.footnote} ${dark ? styles.footnoteDark : ''}`}>
            {hasReal
              ? `Data token aktual dari metadata api_logs · kurs Rp${data.meta.kursIdr.toLocaleString('id-ID')}/USD`
              : `Estimasi ${data.meta.pricePerMillionUSD.toFixed(2)}/1M token · kurs Rp${data.meta.kursIdr.toLocaleString('id-ID')}/USD`
            }
          </p>
        </>
      )}
    </div>
  );
}
