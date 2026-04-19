// src/app/admin/dashboard/page.tsx
'use client'

import React, { useEffect, useState, useCallback } from 'react'
import styles from './page.module.scss'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis,
} from 'recharts'
import {
  FiUsers, FiBook, FiCheckSquare, FiTarget, FiMessageCircle,
  FiTrendingUp, FiFileText, FiHelpCircle, FiStar, FiClock,
  FiRefreshCw, FiAlertTriangle, FiActivity, FiGrid,
  FiEdit3, FiDatabase, FiArrowRight, FiClipboard, FiEye,
} from 'react-icons/fi'
import { useRouter } from 'next/navigation'
import { useAdmin } from '@/hooks/useAdmin'
import { apiFetch } from '@/lib/api-client'
import type {
  DashboardTab, TimeRange, DashboardKPI, RM2Data, RM3Data,
  ActivityItem, StudentRow, SystemHealth, DashboardAPIResponse,
} from '@/types/dashboard'

const STAGE_COLORS: Record<string, string> = { SCP: '#ef4444', SRP: '#f59e0b', MQP: '#3b82f6', REFLECTIVE: '#10b981' }
const STAGE_LABELS: Record<string, string> = { SCP: 'Simple Copy-Paste', SRP: 'Structured Prompt', MQP: 'Multi-Quality Prompt', REFLECTIVE: 'Reflective Prompt' }

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  course: <FiBook />, ask: <FiHelpCircle />, challenge: <FiTarget />, quiz: <FiCheckSquare />,
  journal: <FiEdit3 />, transcript: <FiFileText />, feedback: <FiStar />, discussion: <FiMessageCircle />, example: <FiEye />,
}
const ACTIVITY_COLORS: Record<string, string> = {
  course: '#6366f1', ask: '#3b82f6', challenge: '#ec4899', quiz: '#f59e0b',
  journal: '#8b5cf6', transcript: '#06b6d4', feedback: '#f97316', discussion: '#10b981', example: '#64748b',
}
const ACTIVITY_LABELS: Record<string, string> = {
  course: 'Kursus', ask: 'Tanya Jawab', challenge: 'Tantangan', quiz: 'Kuis',
  journal: 'Jurnal', transcript: 'Transkrip', feedback: 'Umpan Balik', discussion: 'Diskusi', example: 'Contoh',
}

const TABS: { id: DashboardTab; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Ringkasan', icon: <FiGrid /> },
  { id: 'system', label: 'Sistem', icon: <FiActivity /> },
]
const TIME_RANGES: { value: TimeRange; label: string }[] = [
  { value: '7d', label: '7 Hari' }, { value: '30d', label: '30 Hari' },
  { value: '90d', label: '90 Hari' }, { value: 'all', label: 'Semua' },
]

function formatTime(ts: string): string {
  const d = new Date(ts)
  if (isNaN(d.getTime())) return '—'
  const ms = Date.now() - d.getTime()
  const mins = Math.floor(ms / 60000)
  if (mins < 1) return 'baru saja'
  if (mins < 60) return `${mins} menit lalu`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} jam lalu`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} hari lalu`
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const { admin, loading: authLoading } = useAdmin()
  const [activeTab, setActiveTab] = useState<DashboardTab>('overview')
  const [timeRange, setTimeRange] = useState<TimeRange>('all')
  const [kpi, setKpi] = useState<DashboardKPI | null>(null)
  const [rm2, setRm2] = useState<RM2Data | null>(null)
  const [rm3, setRm3] = useState<RM3Data | null>(null)
  const [, setStudents] = useState<StudentRow[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null)
  const [meta, setMeta] = useState<{ generatedAt: string; queryTimeMs: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => { if (!authLoading && !admin) router.push('/admin/login') }, [authLoading, admin, router])

  const fetchDashboard = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const res = await apiFetch(`/api/admin/dashboard?range=${timeRange}`, { cache: 'no-store' })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.message || `HTTP ${res.status}`) }
      const data: DashboardAPIResponse = await res.json()
      setKpi(data.kpi); setRm2(data.rm2); setRm3(data.rm3)
      setStudents(data.studentSummary || []); setRecentActivity(data.recentActivity || [])
      setMeta(data.meta ? { generatedAt: data.meta.generatedAt, queryTimeMs: data.meta.queryTimeMs } : null)
    } catch (err) { setError(err instanceof Error ? err.message : 'Unknown error') }
    finally { setLoading(false) }
  }, [timeRange])

  const fetchSystemHealth = useCallback(async () => {
    try {
      const res = await apiFetch('/api/admin/monitoring/logging?days=7', { cache: 'no-store' })
      if (!res.ok) return
      const d = await res.json()
      const t = d.totals?.total || 0, f = d.totals?.failed || 0
      setSystemHealth({
        periodDays: d.periodDays || 7, totalRequests: t, totalFailures: f, totalSuccess: t - f,
        failureRate: t > 0 ? Math.round((f / t) * 1000) / 10 : 0,
        alerts: d.alerts || [], topFailingEndpoints: d.topFailingEndpoints || [],
      })
    } catch { /* non-critical */ }
  }, [])

  useEffect(() => { if (!authLoading && admin) fetchDashboard() }, [authLoading, admin, fetchDashboard])
  useEffect(() => { if (!authLoading && admin && activeTab === 'system') fetchSystemHealth() }, [authLoading, admin, activeTab, fetchSystemHealth])

  if (authLoading) return <div className={styles.loadingScreen}>Memuat...</div>

  const stageData = rm2 ? Object.entries(rm2.stages).map(([s, c]) => ({
    name: s, fullName: STAGE_LABELS[s] || s, count: c,
    percentage: rm2.totalPrompts > 0 ? Math.round((c / rm2.totalPrompts) * 100) : 0,
  })) : []

  const ctRadar = rm3?.ctBreakdown ? [
    { dim: 'Decomp.', val: rm3.ctBreakdown.decomposition },
    { dim: 'Pattern', val: rm3.ctBreakdown.pattern_recognition },
    { dim: 'Abstract.', val: rm3.ctBreakdown.abstraction },
    { dim: 'Algo.', val: rm3.ctBreakdown.algorithm_design },
    { dim: 'Eval/Debug', val: rm3.ctBreakdown.evaluation_debugging },
    { dim: 'General.', val: rm3.ctBreakdown.generalization },
  ] : null

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Ringkasan Riset</h1>
          <p className={styles.subtitle}>RM2 (Prompt Evolution) &amp; RM3 (Critical Thinking) Dashboard</p>
        </div>
        <div className={styles.headerMeta}>
          {meta && <span className={styles.queryTime}>{meta.queryTimeMs}ms</span>}
          <button className={styles.refreshBtn} onClick={() => { fetchDashboard(); if (activeTab === 'system') fetchSystemHealth() }} disabled={loading} title="Perbarui">
            <FiRefreshCw className={loading ? styles.spinning : ''} />
          </button>
          <span className={styles.adminBadge}>{admin?.email}</span>
        </div>
      </header>

      <nav className={styles.tabNav}>
        <div className={styles.tabList}>
          {TABS.map(t => (
            <button key={t.id} className={`${styles.tabBtn} ${activeTab === t.id ? styles.tabActive : ''}`} onClick={() => setActiveTab(t.id)}>
              {t.icon}<span>{t.label}</span>
            </button>
          ))}
        </div>
        <div className={styles.timeFilter}>
          {TIME_RANGES.map(tr => (
            <button key={tr.value} className={`${styles.timeBtn} ${timeRange === tr.value ? styles.timeActive : ''}`} onClick={() => setTimeRange(tr.value)}>
              {tr.label}
            </button>
          ))}
        </div>
      </nav>

      {error && <div className={styles.errorBanner}><p><FiAlertTriangle style={{ display: 'inline', marginRight: 6 }} />{error}</p><button onClick={fetchDashboard}>Coba Lagi</button></div>}

      {loading ? <div className={styles.loadingScreen}>Memuat data dashboard...</div> : (
        <>
          {/* ═══ OVERVIEW TAB ═══ */}
          {activeTab === 'overview' && (
            <>
              {/* Primary KPIs — hero row */}
              <div className={styles.kpiPrimary}>
                <div className={`${styles.kpiPrimaryCard} ${styles.kpiIndigo}`}><div className={styles.kpiIcon}><FiUsers /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{kpi?.activeStudents || 0}</span><span className={styles.kpiLabel}>Siswa Aktif</span></div></div>
                <div className={`${styles.kpiPrimaryCard} ${styles.kpiBlue}`}><div className={styles.kpiIcon}><FiBook /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{kpi?.totalCourses || 0}</span><span className={styles.kpiLabel}>Total Kursus</span></div></div>
                <div className={`${styles.kpiPrimaryCard} ${styles.kpiGreen}`}><div className={styles.kpiIcon}><FiCheckSquare /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{kpi?.quizAccuracy || 0}%</span><span className={styles.kpiLabel}>Akurasi Kuis</span></div></div>
              </div>

              {/* Secondary KPIs — supporting metrics */}
              <div className={styles.kpiSecondary}>
                <div className={`${styles.kpiCard} ${styles.kpiAmber}`}><div className={styles.kpiIcon}><FiTarget /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{kpi?.ctCoverageRate || 0}%</span><span className={styles.kpiLabel}>Cakupan CT</span></div></div>
                <div className={`${styles.kpiCard} ${styles.kpiPurple}`}><div className={styles.kpiIcon}><FiMessageCircle /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{kpi?.totalDiscussions || 0}</span><span className={styles.kpiLabel}>Diskusi</span></div></div>
                <div className={`${styles.kpiCard} ${styles.kpiRose}`}><div className={styles.kpiIcon}><FiTrendingUp /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{rm2?.totalPrompts || 0}</span><span className={styles.kpiLabel}>Total Prompt</span></div></div>
                <div className={`${styles.kpiCard} ${styles.kpiCyan}`}><div className={styles.kpiIcon}><FiHelpCircle /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{kpi?.totalAskQuestions || 0}</span><span className={styles.kpiLabel}>Tanya Jawab</span></div></div>
                <div className={`${styles.kpiCard} ${styles.kpiOrange}`}><div className={styles.kpiIcon}><FiStar /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{kpi?.avgRating || 0}/5</span><span className={styles.kpiLabel}>Rating ({kpi?.totalFeedbacks || 0})</span></div></div>
                <div className={`${styles.kpiCard} ${styles.kpiTeal}`}><div className={styles.kpiIcon}><FiEdit3 /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{kpi?.totalJournals || 0}</span><span className={styles.kpiLabel}>Jurnal</span></div></div>
                <div className={`${styles.kpiCard} ${styles.kpiSlate}`}><div className={styles.kpiIcon}><FiTarget /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{kpi?.totalChallenges || 0}</span><span className={styles.kpiLabel}>Tantangan</span></div></div>
                <div className={`${styles.kpiCard} ${styles.kpiIndigo}`}><div className={styles.kpiIcon}><FiFileText /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{kpi?.totalTranscripts || 0}</span><span className={styles.kpiLabel}>Transkrip</span></div></div>
                <div className={`${styles.kpiCard} ${styles.kpiBlue}`}><div className={styles.kpiIcon}><FiDatabase /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{kpi?.totalLearningProfiles || 0}</span><span className={styles.kpiLabel}>Profil Belajar</span></div></div>
                <div className={`${styles.kpiCard} ${styles.kpiGreen}`}><div className={styles.kpiIcon}><FiTrendingUp /></div><div className={styles.kpiBody}><span className={styles.kpiValue}>{kpi?.onboardingCompletionRate || 0}%</span><span className={styles.kpiLabel}>Tingkat Onboarding</span></div></div>
              </div>

              {rm2 && (
                <div className={styles.researchBadgeRow}>
                  <span className={`${styles.researchBadge} ${rm2.hasResearchData ? styles.researchActive : styles.researchFallback}`}>
                    <FiDatabase /> {rm2.hasResearchData ? 'RM2: Data riset' : 'RM2: Fallback heuristik'}
                  </span>
                  {rm3 && (
                    <span className={`${styles.researchBadge} ${rm3.hasResearchData ? styles.researchActive : styles.researchFallback}`}>
                      <FiDatabase /> {rm3.hasResearchData ? 'RM3: Data riset' : 'RM3: Fallback heuristik'}
                    </span>
                  )}
                  {rm2.avgStageScore > 0 && <span className={styles.avgScoreBadge}>Skor Rata-rata: {rm2.avgStageScore}/4</span>}
                </div>
              )}

              <section className={styles.chartsRow}>
                <div className={styles.chartPanel}>
                  <div className={styles.chartHeader}><h2>RM2 — Prompt Stages</h2><p>SCP → SRP → MQP → REFLECTIVE</p></div>
                  <div className={styles.chartBody}>
                    {stageData.some(d => d.count > 0) ? (
                      <>
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={stageData} barCategoryGap="20%">
                            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                            <XAxis dataKey="name" fontSize={13} fontWeight={600} />
                            <YAxis fontSize={12} />
                            <Tooltip formatter={(v) => [v, 'Jumlah']} labelFormatter={(l) => STAGE_LABELS[l as string] || l} />
                            <Bar dataKey="count" name="Prompts" radius={[6, 6, 0, 0]}>
                              {stageData.map(e => <Cell key={e.name} fill={STAGE_COLORS[e.name] || '#94a3b8'} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                        <div className={styles.stageLegend}>
                          {stageData.map(e => (
                            <div key={e.name} className={styles.stageLegendItem}>
                              <span className={styles.stageDot} style={{ background: STAGE_COLORS[e.name] }} />
                              <span className={styles.stageName}>{e.name}</span>
                              <span className={styles.stageCount}>{e.count} ({e.percentage}%)</span>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : <p className={styles.emptyChart}>Belum ada data prompt</p>}
                  </div>
                </div>

                <div className={styles.chartPanel}>
                  <div className={styles.chartHeader}><h2>RM3 — Critical Thinking</h2><p>CT &amp; CTh Indicators</p></div>
                  <div className={styles.chartBody}>
                    {rm3?.hasResearchData && rm3.avgCTScore !== undefined ? (
                      <>
                        <div className={styles.ctScores}>
                          <div className={styles.ctScoreCard}><span className={styles.ctScoreValue}>{rm3.avgCTScore}</span><span className={styles.ctScoreMax}>/12</span><span className={styles.ctScoreLabel}>Skor CT</span></div>
                          {rm3.avgCThScore !== undefined && <div className={styles.ctScoreCard}><span className={styles.ctScoreValue}>{rm3.avgCThScore}</span><span className={styles.ctScoreMax}>/12</span><span className={styles.ctScoreLabel}>Skor CTh</span></div>}
                        </div>
                        {ctRadar && (
                          <ResponsiveContainer width="100%" height={200}>
                            <RadarChart data={ctRadar}>
                              <PolarGrid stroke="#e2e8f0" />
                              <PolarAngleAxis dataKey="dim" fontSize={10} />
                              <PolarRadiusAxis domain={[0, 2]} fontSize={9} />
                              <Radar name="CT" dataKey="val" stroke="#6366f1" fill="#6366f1" fillOpacity={0.3} />
                            </RadarChart>
                          </ResponsiveContainer>
                        )}
                      </>
                    ) : (
                      <>
                        <div className={styles.ctMetrics}>
                          <div className={styles.ctMetricCard}>
                            <div className={styles.ctRing} style={{ background: `conic-gradient(#6366f1 ${rm3?.quizAccuracy || 0}%, #e2e8f0 0%)` }}><span>{rm3?.quizAccuracy || 0}%</span></div>
                            <span className={styles.ctLabel}>Akurasi Kuis</span>
                          </div>
                          <div className={styles.ctMetricCard}>
                            <div className={styles.ctRing} style={{ background: `conic-gradient(#10b981 ${rm3?.ctCoverageRate || 0}%, #e2e8f0 0%)` }}><span>{rm3?.ctCoverageRate || 0}%</span></div>
                            <span className={styles.ctLabel}>Cakupan CT</span>
                            <small>{rm3?.coveredGoals || 0}/{rm3?.totalGoals || 0} tujuan</small>
                          </div>
                        </div>
                        <div className={styles.ctStats}>
                          <div className={styles.ctStatItem}><FiTarget className={styles.ctStatIcon} /><div><strong>{kpi?.totalChallenges || 0}</strong><span>Tantangan</span></div></div>
                          <div className={styles.ctStatItem}><FiFileText className={styles.ctStatIcon} /><div><strong>{kpi?.totalJournals || 0}</strong><span>Jurnal</span></div></div>
                          <div className={styles.ctStatItem}><FiStar className={styles.ctStatIcon} /><div><strong>{kpi?.avgRating || 0}/5</strong><span>Rating</span></div></div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </section>

              {rm2?.microMarkerDistribution && Object.keys(rm2.microMarkerDistribution).length > 0 && (
                <section className={styles.microMarkersSection}>
                  <h3>Micro Marker Distribution</h3>
                  <div className={styles.microMarkerCards}>
                    {Object.entries(rm2.microMarkerDistribution).map(([m, c]) => (
                      <div key={m} className={styles.microMarkerCard}><span className={styles.microMarkerName}>{m}</span><span className={styles.microMarkerCount}>{c}</span></div>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          {/* ═══ QUICK NAVIGATION + RECENT ACTIVITY (on overview) ═══ */}
          {activeTab === 'overview' && (
            <>
              <section className={styles.quickNav}>
                <div className={styles.quickNavCard} onClick={() => router.push('/admin/siswa')}>
                  <FiUsers className={styles.quickNavIcon} />
                  <div><strong>Siswa</strong><p>Kelola dan inspeksi siswa</p></div>
                  <FiArrowRight />
                </div>
                <div className={styles.quickNavCard} onClick={() => router.push('/admin/aktivitas')}>
                  <FiActivity className={styles.quickNavIcon} />
                  <div><strong>Aktivitas</strong><p>Lihat log interaksi belajar</p></div>
                  <FiArrowRight />
                </div>
                <div className={styles.quickNavCard} onClick={() => router.push('/admin/riset')}>
                  <FiClipboard className={styles.quickNavIcon} />
                  <div><strong>Riset</strong><p>Analisis RM2 & RM3</p></div>
                  <FiArrowRight />
                </div>
              </section>

              <section className={styles.activityTab}>
                <div className={styles.activityHeader}><h2>Aktivitas Terbaru</h2><span className={styles.activityCount}>{recentActivity.length} item</span></div>
                <div className={styles.activityList}>
                  {recentActivity.length === 0 ? <p className={styles.emptyActivity}>Belum ada aktivitas</p> : recentActivity.slice(0, 10).map((item, i) => (
                    <div key={i} className={styles.activityItem}>
                      <div className={styles.activityDot} style={{ background: ACTIVITY_COLORS[item.type] || '#94a3b8' }}>{ACTIVITY_ICONS[item.type] || <FiClock />}</div>
                      <div className={styles.activityContent}>
                        <span className={styles.activityEmail}>{item.email}</span>
                        <span className={styles.activityDetail}>{item.detail || item.type}</span>
                      </div>
                      <div className={styles.activityRight}>
                        <span className={styles.activityTypeBadge} style={{ color: ACTIVITY_COLORS[item.type] }}>{ACTIVITY_LABELS[item.type] || item.type}</span>
                        <span className={styles.activityTime}>{formatTime(item.timestamp)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </>
          )}

          {/* ═══ SYSTEM HEALTH TAB ═══ */}
          {activeTab === 'system' && (
            <section className={styles.systemTab}>
              <div className={styles.systemHeader}>
                <h2>Kesehatan Sistem</h2>
                <button className={styles.refreshBtn} onClick={fetchSystemHealth}><FiRefreshCw /> Perbarui</button>
              </div>
              {!systemHealth ? <div className={styles.loadingScreen}>Memuat kesehatan sistem...</div> : (
                <>
                  <div className={styles.systemKpiRow}>
                    <div className={styles.systemKpiCard}><span className={styles.systemKpiValue}>{systemHealth.totalRequests}</span><span className={styles.systemKpiLabel}>Total Permintaan ({systemHealth.periodDays}d)</span></div>
                    <div className={styles.systemKpiCard}><span className={styles.systemKpiValue}>{systemHealth.totalSuccess}</span><span className={styles.systemKpiLabel}>Berhasil</span></div>
                    <div className={`${styles.systemKpiCard} ${systemHealth.failureRate > 5 ? styles.systemKpiDanger : ''}`}><span className={styles.systemKpiValue}>{systemHealth.totalFailures}</span><span className={styles.systemKpiLabel}>Gagal ({systemHealth.failureRate}%)</span></div>
                  </div>
                  {systemHealth.alerts.length > 0 && (
                    <div className={styles.alertsSection}>
                      <h3><FiAlertTriangle /> Peringatan</h3>
                      <div className={styles.alertsList}>
                        {systemHealth.alerts.map((a, i) => (
                          <div key={i} className={`${styles.alertItem} ${a.severity === 'high' ? styles.alertHigh : styles.alertMedium}`}>
                            <span className={styles.alertPath}>{a.path}</span>
                            <span className={styles.alertMsg}>{a.message}</span>
                            <span className={styles.alertRate}>{a.failureRate}% fail</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {systemHealth.topFailingEndpoints.length > 0 && (
                    <div className={styles.failingEndpointsSection}>
                      <h3>Endpoint Paling Sering Gagal</h3>
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead><tr><th>Endpoint</th><th>Total</th><th>Berhasil</th><th>Gagal</th><th>Tingkat Gagal</th></tr></thead>
                          <tbody>
                            {systemHealth.topFailingEndpoints.map((ep, i) => (
                              <tr key={i}>
                                <td className={styles.emailCell}>{ep.path}</td>
                                <td>{ep.total}</td>
                                <td>{ep.success}</td>
                                <td>{ep.failed}</td>
                                <td><span className={`${styles.accuracyBadge} ${ep.failureRate > 20 ? styles.accLow : ep.failureRate > 5 ? styles.accMedium : styles.accGood}`}>{ep.failureRate}%</span></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                  {systemHealth.alerts.length === 0 && systemHealth.topFailingEndpoints.length === 0 && (
                    <div className={styles.systemOk}><p>Semua sistem berjalan normal. Tidak ada peringatan.</p></div>
                  )}
                </>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
