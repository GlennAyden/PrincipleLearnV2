// src/app/admin/dashboard/page.tsx
'use client'

import React, { useEffect, useState } from 'react'
import styles from './page.module.scss'
import {
  BarChart, Bar, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, PieChart, Pie,
} from 'recharts'
import {
  FiUsers, FiBook, FiCheckSquare,
  FiTarget, FiMessageCircle, FiTrendingUp,
  FiFileText, FiHelpCircle, FiStar,
  FiClock
} from 'react-icons/fi'
import { useRouter } from 'next/navigation'
import { useAdmin } from '@/hooks/useAdmin'

interface KPI {
  activeStudents: number
  totalCourses: number
  quizAccuracy: number
  totalDiscussions: number
  completedDiscussions: number
  totalJournals: number
  totalChallenges: number
  totalAskQuestions: number
  totalFeedbacks: number
  avgRating: number
  ctCoverageRate: number
}

interface RM2Data {
  stages: { SCP: number; SRP: number; MQP: number; Reflektif: number }
  totalPrompts: number
}

interface RM3Data {
  totalGoals: number
  coveredGoals: number
  ctCoverageRate: number
  quizAccuracy: number
  totalChallenges: number
}

interface StudentRow {
  id: string
  email: string
  courses: number
  quizzes: number
  quizAccuracy: number
  journals: number
  challenges: number
  discussions: number
  promptStage: string
}

interface ActivityItem {
  type: string
  email: string
  detail: string
  timestamp: string
}

const STAGE_COLORS: Record<string, string> = {
  SCP: '#ef4444',
  SRP: '#f59e0b',
  MQP: '#3b82f6',
  Reflektif: '#10b981',
}

const STAGE_LABELS: Record<string, string> = {
  SCP: 'Simple Copy-Paste',
  SRP: 'Structured Prompt',
  MQP: 'Multi-Quality Prompt',
  Reflektif: 'Reflective Prompt',
}

const ACTIVITY_ICONS: Record<string, React.ReactNode> = {
  course: <FiBook />,
  ask: <FiHelpCircle />,
  challenge: <FiTarget />,
  quiz: <FiCheckSquare />,
}

const ACTIVITY_COLORS: Record<string, string> = {
  course: '#6366f1',
  ask: '#3b82f6',
  challenge: '#ec4899',
  quiz: '#f59e0b',
}

export default function AdminDashboardPage() {
  const router = useRouter()
  const { admin, loading: authLoading } = useAdmin()
  const [kpi, setKpi] = useState<KPI | null>(null)
  const [rm2, setRm2] = useState<RM2Data | null>(null)
  const [rm3, setRm3] = useState<RM3Data | null>(null)
  const [students, setStudents] = useState<StudentRow[]>([])
  const [recentActivity, setRecentActivity] = useState<ActivityItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!authLoading && !admin) {
      router.push('/admin/login')
    }
  }, [authLoading, admin, router])

  useEffect(() => {
    if (authLoading || !admin) return

    const fetchData = async () => {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch('/api/admin/dashboard', {
          credentials: 'include',
          cache: 'no-store',
        })
        if (!res.ok) throw new Error('Failed to fetch dashboard data')
        const data = await res.json()
        setKpi(data.kpi)
        setRm2(data.rm2)
        setRm3(data.rm3)
        setStudents(data.studentSummary || [])
        setRecentActivity(data.recentActivity || [])
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      } finally {
        setLoading(false)
      }
    }
    fetchData()
  }, [authLoading, admin])

  if (authLoading) return <div className={styles.loadingScreen}>Loading...</div>

  // Prepare chart data for RM2 stages
  const stageChartData = rm2
    ? Object.entries(rm2.stages).map(([stage, count]) => ({
        name: stage,
        fullName: STAGE_LABELS[stage],
        count,
        percentage: rm2.totalPrompts > 0
          ? Math.round((count / rm2.totalPrompts) * 100)
          : 0,
      }))
    : []

  // Prepare CT indicator data for RM3
  const ctChartData = rm3
    ? [
        { name: 'Quiz Accuracy', value: rm3.quizAccuracy, color: '#6366f1' },
        { name: 'CT Goal Coverage', value: rm3.ctCoverageRate, color: '#10b981' },
      ]
    : []

  const formatTime = (timestamp: string) => {
    const d = new Date(timestamp)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    const diffDays = Math.floor(diffHours / 24)
    return `${diffDays}d ago`
  }

  const getStageClass = (stage: string) => {
    switch (stage) {
      case 'SCP': return styles.stageSCP
      case 'SRP': return styles.stageSRP
      case 'MQP': return styles.stageMQP
      case 'Reflektif': return styles.stageReflektif
      default: return styles.stageNA
    }
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>Research Overview</h1>
          <p className={styles.subtitle}>
            RM2 (Prompt Evolution) & RM3 (Critical Thinking) Dashboard
          </p>
        </div>
        <div className={styles.headerMeta}>
          <span className={styles.adminBadge}>{admin?.email}</span>
        </div>
      </header>

      {error && (
        <div className={styles.errorBanner}>
          <p>⚠️ {error}</p>
          <button onClick={() => window.location.reload()}>Refresh</button>
        </div>
      )}

      {loading ? (
        <div className={styles.loadingScreen}>Loading dashboard data...</div>
      ) : (
        <>
          {/* KPI Cards */}
          <section className={styles.kpiGrid}>
            <div className={`${styles.kpiCard} ${styles.kpiIndigo}`}>
              <div className={styles.kpiIcon}><FiUsers /></div>
              <div className={styles.kpiBody}>
                <span className={styles.kpiValue}>{kpi?.activeStudents || 0}</span>
                <span className={styles.kpiLabel}>Active Students</span>
              </div>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiBlue}`}>
              <div className={styles.kpiIcon}><FiBook /></div>
              <div className={styles.kpiBody}>
                <span className={styles.kpiValue}>{kpi?.totalCourses || 0}</span>
                <span className={styles.kpiLabel}>Total Courses</span>
              </div>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiGreen}`}>
              <div className={styles.kpiIcon}><FiCheckSquare /></div>
              <div className={styles.kpiBody}>
                <span className={styles.kpiValue}>{kpi?.quizAccuracy || 0}%</span>
                <span className={styles.kpiLabel}>Quiz Accuracy</span>
              </div>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiAmber}`}>
              <div className={styles.kpiIcon}><FiTarget /></div>
              <div className={styles.kpiBody}>
                <span className={styles.kpiValue}>{kpi?.ctCoverageRate || 0}%</span>
                <span className={styles.kpiLabel}>CT Goal Coverage</span>
              </div>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiPurple}`}>
              <div className={styles.kpiIcon}><FiMessageCircle /></div>
              <div className={styles.kpiBody}>
                <span className={styles.kpiValue}>{kpi?.totalDiscussions || 0}</span>
                <span className={styles.kpiLabel}>Discussion Sessions</span>
              </div>
            </div>

            <div className={`${styles.kpiCard} ${styles.kpiRose}`}>
              <div className={styles.kpiIcon}><FiTrendingUp /></div>
              <div className={styles.kpiBody}>
                <span className={styles.kpiValue}>{rm2?.totalPrompts || 0}</span>
                <span className={styles.kpiLabel}>Total Prompts</span>
              </div>
            </div>
          </section>

          {/* RM2 + RM3 Charts Row */}
          <section className={styles.chartsRow}>
            {/* RM2 — Prompt Stage Distribution */}
            <div className={styles.chartPanel}>
              <div className={styles.chartHeader}>
                <h2>📈 RM2 — Prompt Stage Distribution</h2>
                <p>Classifies student prompts into development stages (SCP → SRP → MQP → Reflektif)</p>
              </div>
              <div className={styles.chartBody}>
                {stageChartData.length > 0 ? (
                  <>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={stageChartData} barCategoryGap="20%">
                        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                        <XAxis dataKey="name" fontSize={13} fontWeight={600} />
                        <YAxis fontSize={12} />
                        <Tooltip
                          formatter={(value: number, name: string) => [value, 'Count']}
                          labelFormatter={(label) => STAGE_LABELS[label] || label}
                        />
                        <Bar dataKey="count" name="Prompts" radius={[6, 6, 0, 0]}>
                          {stageChartData.map((entry) => (
                            <Cell key={entry.name} fill={STAGE_COLORS[entry.name]} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                    <div className={styles.stageLegend}>
                      {stageChartData.map((entry) => (
                        <div key={entry.name} className={styles.stageLegendItem}>
                          <span
                            className={styles.stageDot}
                            style={{ background: STAGE_COLORS[entry.name] }}
                          />
                          <span className={styles.stageName}>{entry.name}</span>
                          <span className={styles.stageCount}>
                            {entry.count} ({entry.percentage}%)
                          </span>
                        </div>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className={styles.emptyChart}>No prompt data yet</p>
                )}
              </div>
            </div>

            {/* RM3 — CT Indicators */}
            <div className={styles.chartPanel}>
              <div className={styles.chartHeader}>
                <h2>🧠 RM3 — Critical Thinking Indicators</h2>
                <p>Measures CT manifestation through quiz accuracy and discussion goal coverage</p>
              </div>
              <div className={styles.chartBody}>
                <div className={styles.ctMetrics}>
                  <div className={styles.ctMetricCard}>
                    <div
                      className={styles.ctRing}
                      style={{
                        background: `conic-gradient(#6366f1 ${rm3?.quizAccuracy || 0}%, #e2e8f0 0%)`
                      }}
                    >
                      <span>{rm3?.quizAccuracy || 0}%</span>
                    </div>
                    <span className={styles.ctLabel}>Quiz Accuracy</span>
                    <small>Based on {kpi?.totalCourses || 0} submissions</small>
                  </div>
                  <div className={styles.ctMetricCard}>
                    <div
                      className={styles.ctRing}
                      style={{
                        background: `conic-gradient(#10b981 ${rm3?.ctCoverageRate || 0}%, #e2e8f0 0%)`
                      }}
                    >
                      <span>{rm3?.ctCoverageRate || 0}%</span>
                    </div>
                    <span className={styles.ctLabel}>CT Goal Coverage</span>
                    <small>{rm3?.coveredGoals || 0}/{rm3?.totalGoals || 0} goals met</small>
                  </div>
                </div>
                <div className={styles.ctStats}>
                  <div className={styles.ctStatItem}>
                    <FiTarget className={styles.ctStatIcon} />
                    <div>
                      <strong>{kpi?.totalChallenges || 0}</strong>
                      <span>Challenge Responses</span>
                    </div>
                  </div>
                  <div className={styles.ctStatItem}>
                    <FiFileText className={styles.ctStatIcon} />
                    <div>
                      <strong>{kpi?.totalJournals || 0}</strong>
                      <span>Reflective Journals</span>
                    </div>
                  </div>
                  <div className={styles.ctStatItem}>
                    <FiStar className={styles.ctStatIcon} />
                    <div>
                      <strong>{kpi?.avgRating || 0}/5</strong>
                      <span>Content Rating</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* Student Summary + Recent Activity */}
          <section className={styles.bottomRow}>
            {/* Student Summary Table */}
            <div className={styles.tablePanel}>
              <div className={styles.tablePanelHeader}>
                <h2>👥 Student Summary</h2>
                <button
                  className={styles.viewAllBtn}
                  onClick={() => router.push('/admin/users')}
                >
                  View All →
                </button>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Student</th>
                      <th>Stage</th>
                      <th>Courses</th>
                      <th>Quiz Acc.</th>
                      <th>Discussions</th>
                      <th>Journals</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.length === 0 ? (
                      <tr>
                        <td colSpan={6} className={styles.emptyRow}>No students yet</td>
                      </tr>
                    ) : (
                      students.map((s) => (
                        <tr
                          key={s.id}
                          className={styles.studentRow}
                          onClick={() => router.push('/admin/users')}
                        >
                          <td className={styles.emailCell}>{s.email}</td>
                          <td>
                            <span className={`${styles.stageBadge} ${getStageClass(s.promptStage)}`}>
                              {s.promptStage}
                            </span>
                          </td>
                          <td>{s.courses}</td>
                          <td>
                            <span className={`${styles.accuracyBadge} ${
                              s.quizAccuracy >= 70 ? styles.accGood
                                : s.quizAccuracy >= 40 ? styles.accMedium
                                : styles.accLow
                            }`}>
                              {s.quizAccuracy}%
                            </span>
                          </td>
                          <td>{s.discussions}</td>
                          <td>{s.journals}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Recent Activity Feed */}
            <div className={styles.activityPanel}>
              <div className={styles.activityHeader}>
                <h2>🕐 Recent Activity</h2>
              </div>
              <div className={styles.activityList}>
                {recentActivity.length === 0 ? (
                  <p className={styles.emptyActivity}>No recent activity</p>
                ) : (
                  recentActivity.map((item, i) => (
                    <div key={i} className={styles.activityItem}>
                      <div
                        className={styles.activityDot}
                        style={{ background: ACTIVITY_COLORS[item.type] || '#94a3b8' }}
                      >
                        {ACTIVITY_ICONS[item.type] || <FiClock />}
                      </div>
                      <div className={styles.activityContent}>
                        <span className={styles.activityEmail}>{item.email}</span>
                        <span className={styles.activityDetail}>
                          {item.detail || item.type}
                        </span>
                      </div>
                      <span className={styles.activityTime}>
                        {formatTime(item.timestamp)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
