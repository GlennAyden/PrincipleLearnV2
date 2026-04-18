// src/app/admin/siswa/[id]/page.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import styles from './page.module.scss'
import {
  FiArrowLeft,
  FiAlertCircle,
  FiBookOpen,
  FiCheckSquare,
  FiMessageCircle,
  FiFileText,
  FiHelpCircle,
  FiTarget,
  FiZap,
  FiStar,
  FiUser,
  FiActivity,
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import type { StudentDetail } from '@/types/student'

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  SCP: { label: 'Klarifikasi Sederhana', color: '#b45309', bg: 'rgba(245,158,11,0.14)' },
  SRP: { label: 'Reformulasi Terstruktur', color: '#0369a1', bg: 'rgba(14,165,233,0.14)' },
  MQP: { label: 'Multi-Pertanyaan', color: '#7c3aed', bg: 'rgba(124,58,237,0.14)' },
  REFLECTIVE: { label: 'Reflective', color: '#059669', bg: 'rgba(16,185,129,0.14)' },
  'N/A': { label: 'Tidak Tersedia', color: '#64748b', bg: '#f1f5f9' },
}

const TYPE_ICONS: Record<string, string> = {
  course: '📚', quiz: '✅', journal: '📓', transcript: '📝',
  reflection: '📓', ask: '❓', challenge: '🧩', discussion: '💬', feedback: '⭐',
}

const TYPE_LABELS: Record<string, string> = {
  course: 'Kursus',
  quiz: 'Percobaan Kuis',
  journal: 'Jurnal',
  reflection: 'Refleksi',
  transcript: 'Transkrip',
  ask: 'Pertanyaan',
  challenge: 'Tantangan',
  discussion: 'Diskusi',
  feedback: 'Rating',
}

// ─── Constants ────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  ask_question: 'Tanya Jawab',
  challenge_response: 'Tantangan',
  quiz_submission: 'Kuis',
  journal: 'Refleksi',
  discussion: 'Diskusi',
}

const CT_INDICATORS = [
  { key: 'ct_decomposition', label: 'Dekomposisi' },
  { key: 'ct_pattern_recognition', label: 'Pengenalan Pola' },
  { key: 'ct_abstraction', label: 'Abstraksi' },
  { key: 'ct_algorithm_design', label: 'Desain Algoritma' },
  { key: 'ct_evaluation_debugging', label: 'Evaluasi & Debugging' },
  { key: 'ct_generalization', label: 'Generalisasi' },
]

const CRT_INDICATORS = [
  { key: 'cth_interpretation', label: 'Interpretasi' },
  { key: 'cth_analysis', label: 'Analisis' },
  { key: 'cth_evaluation', label: 'Evaluasi' },
  { key: 'cth_inference', label: 'Inferensi' },
  { key: 'cth_explanation', label: 'Eksplanasi' },
  { key: 'cth_self_regulation', label: 'Regulasi Diri' },
]

// ─── Types for Kognitif ────────────────────────────────────────────

interface KognitifSourceSummary {
  count: number
  avg_ct: number
  avg_crt: number
  avg_depth: number
}

interface KognitifSummary {
  by_source: Record<string, KognitifSourceSummary>
  overall: {
    total_count: number
    avg_ct: number
    avg_crt: number
    indicator_breakdown: Record<string, number> | null
  }
  progression: Array<{ date: string; ct_total: number; crt_total: number; source: string }>
  follow_up_comparison: {
    follow_up_count: number
    follow_up_avg_crt: number
    non_follow_up_count: number
    non_follow_up_avg_crt: number
  } | null
  stage_correlation: Array<{ stage: string; count: number; avg_ct: number; avg_crt: number; avg_depth: number }> | null
}

// ─── Types for Evolusi Prompt ──────────────────────────────────────

interface EvolusiSession {
  session_number: number
  dominant_stage: string
  total_prompts: number
  started_at: string | null
  ended_at: string | null
}

interface EvolusiStageProgression {
  stage: string
  count: number
  percentage: number
}

interface EvolusiPromptItem {
  id: string
  question: string
  prompt_stage: string
  resolved_prompt_stage?: string | null
  session_number: number | null
  micro_markers: Record<string, unknown> | null
  resolved_micro_markers?: Record<string, unknown> | null
  created_at: string
}

interface EvolusiData {
  sessions: EvolusiSession[]
  stageProgression: EvolusiStageProgression[]
  promptHistory: EvolusiPromptItem[]
}

export default function StudentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { admin, loading: authLoading } = useAdmin()
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'activity' | 'evolusi' | 'kognitif' | 'courses' | 'profile'>('activity')

  // Evolusi Prompt state
  const [evolusiData, setEvolusiData] = useState<EvolusiData | null>(null)
  const [evolusiLoading, setEvolusiLoading] = useState(false)
  const [evolusiError, setEvolusiError] = useState<string | null>(null)

  // Kognitif (auto-scored CT/CrT) state
  const [kognitifData, setKognitifData] = useState<KognitifSummary | null>(null)
  const [kognitifLoading, setKognitifLoading] = useState(false)
  const [kognitifError, setKognitifError] = useState<string | null>(null)

  const userId = params?.id as string

  useEffect(() => {
    if (authLoading) return
    if (!admin) { router.push('/admin/login'); return }
    if (!userId) return

    setIsLoading(true)
    setError(null)

    fetch(`/api/admin/users/${userId}/detail`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.message || 'Gagal memuat data siswa')
        }
        return res.json()
      })
      .then(setStudent)
      .catch((err) => { console.error(err); setError(err.message) })
      .finally(() => setIsLoading(false))
  }, [admin, authLoading, userId, router])

  // Fetch evolusi data when tab is active
  useEffect(() => {
    if (activeSection !== 'evolusi' || !userId || !admin) return
    if (evolusiData) return // already loaded

    setEvolusiLoading(true)
    setEvolusiError(null)

    fetch(`/api/admin/siswa/${userId}/evolusi`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.error || 'Gagal memuat data evolusi prompt')
        }
        return res.json()
      })
      .then(setEvolusiData)
      .catch((err) => { console.error(err); setEvolusiError(err.message) })
      .finally(() => setEvolusiLoading(false))
  }, [activeSection, userId, admin, evolusiData])

  // Fetch kognitif data when tab is active
  useEffect(() => {
    if (activeSection !== 'kognitif' || kognitifData || kognitifLoading) return
    setKognitifLoading(true)
    setKognitifError(null)
    fetch(`/api/admin/research/auto-scores/summary?user_id=${params.id}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(data.error || data.message || 'Gagal memuat data kognitif')
        }
        return data
      })
      .then(data => {
        if (data.success !== false && data.overall) {
          setKognitifData(data)
        } else {
          setKognitifError(data.error || 'Gagal memuat data kognitif')
        }
      })
      .catch((err) => setKognitifError(err instanceof Error ? err.message : 'Gagal memuat data kognitif'))
      .finally(() => setKognitifLoading(false))
  }, [activeSection, kognitifData, kognitifLoading, params.id])

  const formatDate = (s: string) => {
    try { return new Date(s).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) }
    catch { return s }
  }

  const formatDateTime = (s: string) => {
    try { return new Date(s).toLocaleString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return s }
  }

  if (authLoading) return <div className={styles.loading}>Memuat...</div>
  if (!admin) return null

  return (
    <div className={styles.page}>
      {/* Tombol kembali */}
      <button className={styles.backBtn} onClick={() => router.push('/admin/siswa')}>
        <FiArrowLeft /> Kembali ke Siswa
      </button>

      {isLoading ? (
        <div className={styles.loading}>Memuat data siswa...</div>
      ) : error ? (
        <div className={styles.error}><FiAlertCircle /> {error}</div>
      ) : !student ? (
        <div className={styles.error}><FiAlertCircle /> Siswa tidak ditemukan</div>
      ) : (
        <>
          {/* Header */}
          <header className={styles.header}>
            <div className={styles.headerInfo}>
              <div className={styles.avatar}><FiUser /></div>
              <div>
                <h2>{student.name !== 'Unknown' && student.name !== 'Tidak Diketahui' ? student.name : student.email}</h2>
                {student.name !== 'Unknown' && student.name !== 'Tidak Diketahui' && <p className={styles.emailText}>{student.email}</p>}
                <div className={styles.headerMeta}>
                  <span className={styles.roleBadge}>{student.role}</span>
                  <span
                    className={styles.stageBadge}
                    style={{
                      color: (STAGE_CONFIG[student.promptStage] ?? STAGE_CONFIG['N/A']).color,
                      background: (STAGE_CONFIG[student.promptStage] ?? STAGE_CONFIG['N/A']).bg,
                    }}
                  >
                    {(STAGE_CONFIG[student.promptStage] ?? STAGE_CONFIG['N/A']).label}
                  </span>
                  <span className={styles.joinDate}>Bergabung {formatDate(student.createdAt)}</span>
                </div>
              </div>
            </div>
          </header>

          {/* Grid Statistik */}
          <section className={styles.statsGrid}>
            <div className={styles.statItem}><FiFileText className={styles.statIconPurple} /><div><span className={styles.statNum}>{student.totalCourses}</span><span className={styles.statLabel}>Kursus</span></div></div>
            <div className={styles.statItem}><FiCheckSquare className={styles.statIconGreen} /><div><span className={styles.statNum}>{student.totalQuizzes}</span><span className={styles.statLabel}>Percobaan Kuis</span></div></div>
            <div className={styles.statItem}><FiBookOpen className={styles.statIconBlue} /><div><span className={styles.statNum}>{student.totalReflections ?? student.totalJournals}</span><span className={styles.statLabel}>Refleksi</span></div></div>
            <div className={styles.statItem}><FiMessageCircle className={styles.statIconTeal} /><div><span className={styles.statNum}>{student.totalTranscripts}</span><span className={styles.statLabel}>Transkrip</span></div></div>
            <div className={styles.statItem}><FiHelpCircle className={styles.statIconOrange} /><div><span className={styles.statNum}>{student.totalAskQuestions}</span><span className={styles.statLabel}>Pertanyaan</span></div></div>
            <div className={styles.statItem}><FiTarget className={styles.statIconRed} /><div><span className={styles.statNum}>{student.totalChallenges}</span><span className={styles.statLabel}>Tantangan</span></div></div>
            <div className={styles.statItem}><FiZap className={styles.statIconYellow} /><div><span className={styles.statNum}>{student.totalDiscussions}</span><span className={styles.statLabel}>Diskusi</span></div></div>
            <div className={styles.statItem}><FiStar className={styles.statIconPink} /><div><span className={styles.statNum}>{student.totalFeedbacks}</span><span className={styles.statLabel}>Rating Refleksi</span></div></div>
          </section>

          {/* Keterlibatan & Penyelesaian */}
          <section className={styles.progressSection}>
            <div className={styles.progressCard}>
              <div className={styles.progressHeader}>
                <FiActivity />
                <span>Skor Keterlibatan</span>
              </div>
              <div className={styles.progressBarOuter}>
                <div className={styles.progressBarFill} style={{ width: `${student.engagementScore}%` }} />
              </div>
              <span className={styles.progressValue}>{student.engagementScore}%</span>
            </div>
            <div className={styles.progressCard}>
              <div className={styles.progressHeader}>
                <FiCheckSquare />
                <span>Penyelesaian Kursus</span>
              </div>
              <div className={styles.progressBarOuter}>
                <div className={styles.progressBarFillGreen} style={{ width: `${student.courseCompletionRate}%` }} />
              </div>
              <span className={styles.progressValue}>{student.courseCompletionRate}%</span>
            </div>
          </section>

          {/* Tab Bagian */}
          <div className={styles.tabs}>
            <button className={`${styles.tabBtn} ${activeSection === 'activity' ? styles.tabActive : ''}`} onClick={() => setActiveSection('activity')}>
              Aktivitas Terbaru
            </button>
            <button className={`${styles.tabBtn} ${activeSection === 'evolusi' ? styles.tabActive : ''}`} onClick={() => setActiveSection('evolusi')}>
              Evolusi Prompt
            </button>
            <button className={`${styles.tabBtn} ${activeSection === 'kognitif' ? styles.tabActive : ''}`} onClick={() => setActiveSection('kognitif')}>
              <FiActivity size={14} />
              Kognitif
            </button>
            <button className={`${styles.tabBtn} ${activeSection === 'courses' ? styles.tabActive : ''}`} onClick={() => setActiveSection('courses')}>
              Kursus ({student.courses.length})
            </button>
            <button className={`${styles.tabBtn} ${activeSection === 'profile' ? styles.tabActive : ''}`} onClick={() => setActiveSection('profile')}>
              Profil Belajar
            </button>
          </div>

          {/* Bagian Aktivitas */}
          {activeSection === 'activity' && (
            <section className={styles.activitySection}>
              {student.recentActivity.length === 0 ? (
                <p className={styles.noData}>Belum ada aktivitas tercatat.</p>
              ) : (
                <div className={styles.activityList}>
                  {student.recentActivity.map((item, idx) => (
                    <article key={`${item.id}-${idx}`} className={styles.activityItem}>
                      <span className={styles.activityIcon}>{TYPE_ICONS[item.type] ?? '📌'}</span>
                      <div className={styles.activityContent}>
                        <div className={styles.activityTop}>
                          <span className={styles.activityType}>{TYPE_LABELS[item.type] ?? item.type}</span>
                          <time>{formatDateTime(item.timestamp)}</time>
                        </div>
                        <p className={styles.activityTitle}>{item.title}</p>
                        {item.detail && <p className={styles.activityDetail}>{item.detail}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Bagian Evolusi Prompt */}
          {activeSection === 'evolusi' && (
            <section className={styles.evolusiSection}>
              {evolusiLoading ? (
                <div className={styles.loading}>Memuat data evolusi prompt...</div>
              ) : evolusiError ? (
                <div className={styles.error}><FiAlertCircle /> {evolusiError}</div>
              ) : !evolusiData || (evolusiData.sessions.length === 0 && evolusiData.promptHistory.length === 0) ? (
                <p className={styles.noData}>Belum ada data evolusi prompt untuk siswa ini.</p>
              ) : (
                <>
                  {/* Distribusi Tahap */}
                  {evolusiData.stageProgression.length > 0 && (
                    <div className={styles.evolusiDistribution}>
                      <h3 className={styles.evolusiSubtitle}>Distribusi Tahap Prompt</h3>
                      <div className={styles.stageBarContainer}>
                        {evolusiData.stageProgression.map((sp) => {
                          const cfg = STAGE_CONFIG[sp.stage] ?? STAGE_CONFIG['N/A']
                          return (
                            <div key={sp.stage} className={styles.stageBarItem}>
                              <div className={styles.stageBarLabel}>
                                <span className={styles.stageTag} style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                                <span className={styles.stageCount}>{sp.count} ({sp.percentage}%)</span>
                              </div>
                              <div className={styles.stageBarTrack}>
                                <div className={styles.stageBarFill} style={{ width: `${sp.percentage}%`, background: cfg.color }} />
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Tabel Sesi */}
                  {evolusiData.sessions.length > 0 && (
                    <div className={styles.evolusiSessions}>
                      <h3 className={styles.evolusiSubtitle}>Sesi Pembelajaran</h3>
                      <div className={styles.tableWrap}>
                        <table className={styles.evolusiTable}>
                          <thead>
                            <tr>
                              <th>Sesi</th>
                              <th>Tahap Dominan</th>
                              <th>Total Prompt</th>
                              <th>Mulai</th>
                              <th>Selesai</th>
                            </tr>
                          </thead>
                          <tbody>
                            {evolusiData.sessions.map((s) => {
                              const cfg = STAGE_CONFIG[s.dominant_stage] ?? STAGE_CONFIG['N/A']
                              return (
                                <tr key={s.session_number}>
                                  <td>{s.session_number}</td>
                                  <td>
                                    <span className={styles.stageTag} style={{ color: cfg.color, background: cfg.bg }}>
                                      {cfg.label}
                                    </span>
                                  </td>
                                  <td>{s.total_prompts}</td>
                                  <td>{s.started_at ? formatDateTime(s.started_at) : '-'}</td>
                                  <td>{s.ended_at ? formatDateTime(s.ended_at) : '-'}</td>
                                </tr>
                              )
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Riwayat Prompt */}
                  {evolusiData.promptHistory.length > 0 && (
                    <div className={styles.evolusiHistory}>
                      <h3 className={styles.evolusiSubtitle}>Riwayat Prompt ({evolusiData.promptHistory.length})</h3>
                      <div className={styles.promptList}>
                        {evolusiData.promptHistory.map((p) => {
                          const promptStage = p.resolved_prompt_stage || p.prompt_stage || 'N/A'
                          const microMarkers = p.resolved_micro_markers || p.micro_markers
                          const cfg = STAGE_CONFIG[promptStage] ?? STAGE_CONFIG['N/A']
                          return (
                            <article key={p.id} className={styles.promptItem}>
                              <div className={styles.promptMeta}>
                                <span className={styles.stageTag} style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
                                {p.session_number != null && <span className={styles.promptSession}>Sesi {p.session_number}</span>}
                                <time>{formatDateTime(p.created_at)}</time>
                              </div>
                              <p className={styles.promptText}>{p.question}</p>
                              {microMarkers && Object.keys(microMarkers).length > 0 && (
                                <div className={styles.microMarkers}>
                                  {Object.entries(microMarkers).map(([key, val]) => (
                                    <span key={key} className={styles.markerChip}>{key}: {String(val)}</span>
                                  ))}
                                </div>
                              )}
                            </article>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </section>
          )}

          {/* Bagian Kognitif */}
          {activeSection === 'kognitif' && (
            <div className={styles.sectionContent}>
              {kognitifLoading ? (
                <div className={styles.loadingState}>Memuat data kognitif...</div>
              ) : kognitifError ? (
                <div className={styles.errorState}>{kognitifError}</div>
              ) : !kognitifData?.overall || kognitifData.overall.total_count === 0 ? (
                <div className={styles.emptyState}>Belum ada data skor kognitif otomatis untuk siswa ini.</div>
              ) : (
                <>
                  {/* Overall Summary Cards */}
                  <div className={styles.kognitifOverview}>
                    <div className={styles.kognitifCard}>
                      <span className={styles.kognitifLabel}>Total Interaksi Diskor</span>
                      <span className={styles.kognitifValue}>{kognitifData.overall.total_count}</span>
                    </div>
                    <div className={styles.kognitifCard}>
                      <span className={styles.kognitifLabel}>Rata-rata CT</span>
                      <span className={`${styles.kognitifValue} ${kognitifData.overall.avg_ct >= 8 ? styles.scoreGreen : kognitifData.overall.avg_ct >= 4 ? styles.scoreAmber : styles.scoreRed}`}>
                        {kognitifData.overall.avg_ct}/12
                      </span>
                    </div>
                    <div className={styles.kognitifCard}>
                      <span className={styles.kognitifLabel}>Rata-rata CrT</span>
                      <span className={`${styles.kognitifValue} ${kognitifData.overall.avg_crt >= 8 ? styles.scoreGreen : kognitifData.overall.avg_crt >= 4 ? styles.scoreAmber : styles.scoreRed}`}>
                        {kognitifData.overall.avg_crt}/12
                      </span>
                    </div>
                  </div>

                  {/* Per-Source Breakdown */}
                  <h3 className={styles.subHeading}>Skor per Fitur</h3>
                  <div className={styles.tableWrap}>
                    <table className={styles.dataTable}>
                      <thead>
                        <tr>
                          <th>Sumber</th>
                          <th>Jumlah</th>
                          <th>Avg CT</th>
                          <th>Avg CrT</th>
                          <th>Avg Depth</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(kognitifData.by_source).map(([src, val]) => (
                          <tr key={src}>
                            <td>{SOURCE_LABELS[src] || src}</td>
                            <td>{val.count}</td>
                            <td>{val.avg_ct}</td>
                            <td>{val.avg_crt}</td>
                            <td>{val.avg_depth}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  {/* 12-Indicator Breakdown */}
                  {kognitifData.overall.indicator_breakdown && (
                    <>
                      <h3 className={styles.subHeading}>Breakdown 12 Indikator</h3>
                      <div className={styles.indicatorGrid}>
                        <div className={styles.indicatorGroup}>
                          <h4 className={styles.indicatorGroupTitle}>Computational Thinking</h4>
                          {CT_INDICATORS.map(ind => (
                            <div key={ind.key} className={styles.indicatorRow}>
                              <span className={styles.indicatorName}>{ind.label}</span>
                              <div className={styles.indicatorBar}>
                                <div
                                  className={styles.indicatorFill}
                                  data-level={Math.round(kognitifData.overall.indicator_breakdown![ind.key] || 0)}
                                  style={{ width: `${((kognitifData.overall.indicator_breakdown![ind.key] || 0) / 2) * 100}%` }}
                                />
                              </div>
                              <span className={styles.indicatorScore}>
                                {(kognitifData.overall.indicator_breakdown![ind.key] || 0).toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                        <div className={styles.indicatorGroup}>
                          <h4 className={styles.indicatorGroupTitle}>Critical Thinking</h4>
                          {CRT_INDICATORS.map(ind => (
                            <div key={ind.key} className={styles.indicatorRow}>
                              <span className={styles.indicatorName}>{ind.label}</span>
                              <div className={styles.indicatorBar}>
                                <div
                                  className={styles.indicatorFill}
                                  data-level={Math.round(kognitifData.overall.indicator_breakdown![ind.key] || 0)}
                                  style={{ width: `${((kognitifData.overall.indicator_breakdown![ind.key] || 0) / 2) * 100}%` }}
                                />
                              </div>
                              <span className={styles.indicatorScore}>
                                {(kognitifData.overall.indicator_breakdown![ind.key] || 0).toFixed(1)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  {/* Follow-up Comparison */}
                  {kognitifData.follow_up_comparison && kognitifData.follow_up_comparison.follow_up_count > 0 && (
                    <>
                      <h3 className={styles.subHeading}>Analisis Follow-up (CrT)</h3>
                      <div className={styles.followUpGrid}>
                        <div className={styles.followUpCard}>
                          <span className={styles.followUpLabel}>Pertanyaan Baru</span>
                          <span className={styles.followUpCount}>{kognitifData.follow_up_comparison.non_follow_up_count}×</span>
                          <span className={styles.followUpScore}>CrT: {kognitifData.follow_up_comparison.non_follow_up_avg_crt}</span>
                        </div>
                        <div className={styles.followUpCard} data-highlight="true">
                          <span className={styles.followUpLabel}>Follow-up</span>
                          <span className={styles.followUpCount}>{kognitifData.follow_up_comparison.follow_up_count}×</span>
                          <span className={styles.followUpScore}>CrT: {kognitifData.follow_up_comparison.follow_up_avg_crt}</span>
                        </div>
                      </div>
                    </>
                  )}

                  {/* Stage Correlation */}
                  {kognitifData.stage_correlation && kognitifData.stage_correlation.length > 0 && (
                    <>
                      <h3 className={styles.subHeading}>Korelasi Tahap Prompt × Skor Kognitif</h3>
                      <div className={styles.tableWrap}>
                        <table className={styles.dataTable}>
                          <thead>
                            <tr>
                              <th>Tahap</th>
                              <th>Jumlah</th>
                              <th>Avg CT</th>
                              <th>Avg CrT</th>
                              <th>Avg Depth</th>
                            </tr>
                          </thead>
                          <tbody>
                            {kognitifData.stage_correlation.map(row => (
                              <tr key={row.stage}>
                                <td>
                                  <span className={styles.stageBadge} style={{
                                    color: STAGE_CONFIG[row.stage]?.color || '#64748b',
                                    background: STAGE_CONFIG[row.stage]?.bg || '#f1f5f9',
                                  }}>
                                    {STAGE_CONFIG[row.stage]?.label || row.stage}
                                  </span>
                                </td>
                                <td>{row.count}</td>
                                <td>{row.avg_ct}</td>
                                <td>{row.avg_crt}</td>
                                <td>{row.avg_depth}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>
          )}

          {/* Bagian Kursus */}
          {activeSection === 'courses' && (
            <section className={styles.coursesSection}>
              {student.courses.length === 0 ? (
                <p className={styles.noData}>Belum ada kursus yang dibuat.</p>
              ) : (
                <div className={styles.courseGrid}>
                  {student.courses.map((course) => {
                    const completionPct = course.subtopicCount > 0
                      ? Math.round((course.completedSubtopics / course.subtopicCount) * 100)
                      : 0
                    const quizPct = course.quizAnswerCount > 0
                      ? Math.round((course.quizCorrectAnswerCount / course.quizAnswerCount) * 100)
                      : 0
                    return (
                      <article key={course.id} className={styles.courseCard}>
                        <h4>{course.title}</h4>
                        <p className={styles.courseDate}>Dibuat {formatDate(course.createdAt)}</p>
                        <div className={styles.courseStats}>
                          <div>
                            <span className={styles.courseStatNum}>{course.completedSubtopics}/{course.subtopicCount}</span>
                            <span className={styles.courseStatLabel}>Subtopik</span>
                            <div className={styles.courseBar}>
                              <div className={styles.courseBarFill} style={{ width: `${completionPct}%` }} />
                            </div>
                          </div>
                          <div>
                            <span className={styles.courseStatNum}>{course.quizCorrectAnswerCount}/{course.quizAnswerCount}</span>
                            <span className={styles.courseStatLabel}>Jawaban Benar ({course.quizAttemptCount} percobaan)</span>
                            <div className={styles.courseBar}>
                              <div className={styles.courseBarFillGreen} style={{ width: `${quizPct}%` }} />
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* Bagian Profil Belajar */}
          {activeSection === 'profile' && (
            <section className={styles.profileSection}>
              {!student.learningProfile ? (
                <p className={styles.noData}>Profil belajar belum tersedia. Siswa belum menyelesaikan onboarding.</p>
              ) : (
                <div className={styles.profileGrid}>
                  <div className={styles.profileField}>
                    <label>Nama Tampilan</label>
                    <p>{student.learningProfile.displayName || '-'}</p>
                  </div>
                  <div className={styles.profileField}>
                    <label>Pengalaman Pemrograman</label>
                    <p>{student.learningProfile.programmingExperience || '-'}</p>
                  </div>
                  <div className={styles.profileField}>
                    <label>Gaya Belajar</label>
                    <p>{student.learningProfile.learningStyle || '-'}</p>
                  </div>
                  <div className={styles.profileField}>
                    <label>Tujuan Belajar</label>
                    <p>{student.learningProfile.learningGoals || '-'}</p>
                  </div>
                  <div className={styles.profileField}>
                    <label>Tantangan</label>
                    <p>{student.learningProfile.challenges || '-'}</p>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
