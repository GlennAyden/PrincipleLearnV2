// src/app/admin/insights/page.tsx
'use client';
import React, { useState, useEffect } from 'react';
import styles from './page.module.scss';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import {
  FiTrendingUp, FiTarget, FiMessageCircle,
  FiStar, FiUsers, FiBarChart2,
} from 'react-icons/fi';
import { useRouter } from 'next/navigation';
import { useAdmin } from '@/hooks/useAdmin';

interface InsightsSummary {
  totalPrompts: number;
  avgComponentsUsed: number;
  reasoningRate: number;
  quizAccuracy: number;
  quizTotal: number;
  quizWithReasoning: number;
  reflectionTotal: number;
  structuredReflections: number;
  avgContentRating: number;
  ctIndicators: number;
  challengeTotal: number;
  challengesWithReasoning: number;
}

interface EvolutionPoint {
  session: string;
  totalPrompts: number;
  avgComponents: number;
  reasoningRate: number;
}

interface StudentRow {
  userId: string;
  email: string;
  totalPrompts: number;
  totalQuizzes: number;
  quizAccuracy: number;
  totalReflections: number;
  totalChallenges: number;
  joinedAt: string;
}

const CHART_COLORS = {
  prompts: '#6366f1',
  components: '#22c55e',
  reasoning: '#f59e0b',
};

export default function InsightsPage() {
  const router = useRouter();
  const { admin, loading: authLoading } = useAdmin();

  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [evolutionChart, setEvolutionChart] = useState<EvolutionPoint[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [users, setUsers] = useState<{ id: string; email: string }[]>([]);
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([]);
  const [selectedUser, setSelectedUser] = useState('');
  const [selectedCourse, setSelectedCourse] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!authLoading && !admin) router.push('/admin/login');
  }, [authLoading, admin, router]);

  useEffect(() => {
    if (authLoading || !admin) return;
    fetchInsights();
  }, [authLoading, admin, selectedUser, selectedCourse]);

  const fetchInsights = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (selectedUser) params.set('userId', selectedUser);
      if (selectedCourse) params.set('courseId', selectedCourse);
      const res = await fetch(`/api/admin/insights?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to load insights');
      const data = await res.json();
      setSummary(data.summary || null);
      setEvolutionChart(data.promptEvolutionChart || []);
      setStudents(data.studentSummary || []);
      setUsers(data.users || []);
      setCourses(data.courses || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (email: string) => {
    return email.split('@')[0].substring(0, 2).toUpperCase();
  };

  if (authLoading) {
    return (
      <div className={styles.page}>
        <div className={styles.loading}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      {/* Header */}
      <header className={styles.header}>
        <div>
          <h2>
            <span className={styles.headerIcon}>
              <FiBarChart2 />
            </span>
            Teacher Insight Dashboard
          </h2>
          <p className={styles.headerSub}>
            Analisis data RM2 (Prompt Evolution) & RM3 (Critical Thinking)
          </p>
        </div>
      </header>

      {/* Filters */}
      <section className={styles.filters}>
        <div className={styles.filterGroup}>
          <label>Siswa</label>
          <select value={selectedUser} onChange={e => setSelectedUser(e.target.value)}>
            <option value="">Semua Siswa</option>
            {users.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
          </select>
        </div>
        <div className={styles.filterGroup}>
          <label>Course</label>
          <select value={selectedCourse} onChange={e => setSelectedCourse(e.target.value)}>
            <option value="">Semua Course</option>
            {courses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
          </select>
        </div>
      </section>

      {error && <div className={styles.errorCard}>⚠️ {error}</div>}

      {loading ? (
        <div className={styles.loading}>Memuat data insights...</div>
      ) : summary ? (
        <>
          {/* Summary Cards */}
          <section className={styles.cardsGrid}>
            {/* Total Prompts Card */}
            <div className={`${styles.card} ${styles.cardBlue}`}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIconWrap}>
                  <FiTrendingUp className={styles.cardIcon} />
                </div>
              </div>
              <div className={styles.cardBody}>
                <span className={styles.cardValue}>{summary.totalPrompts}</span>
                <span className={styles.cardLabel}>Total Prompt</span>
              </div>
              <div className={styles.cardMeta}>
                Avg komponen: {summary.avgComponentsUsed}/3
              </div>
            </div>

            {/* Quiz Accuracy Card */}
            <div className={`${styles.card} ${styles.cardGreen}`}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIconWrap}>
                  <FiTarget className={styles.cardIcon} />
                </div>
              </div>
              <div className={styles.cardBody}>
                <span className={styles.cardValue}>{summary.quizAccuracy}%</span>
                <span className={styles.cardLabel}>Akurasi Quiz</span>
              </div>
              <div className={styles.cardMeta}>
                {summary.quizTotal} total • {summary.quizWithReasoning} dengan reasoning
              </div>
            </div>

            {/* Reasoning Rate Card */}
            <div className={`${styles.card} ${styles.cardPurple}`}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIconWrap}>
                  <FiMessageCircle className={styles.cardIcon} />
                </div>
              </div>
              <div className={styles.cardBody}>
                <span className={styles.cardValue}>{summary.reasoningRate}%</span>
                <span className={styles.cardLabel}>Reasoning Rate</span>
              </div>
              <div className={styles.cardMeta}>
                CT indicators: {summary.ctIndicators}
              </div>
            </div>

            {/* Content Satisfaction Card */}
            <div className={`${styles.card} ${styles.cardAmber}`}>
              <div className={styles.cardHeader}>
                <div className={styles.cardIconWrap}>
                  <FiStar className={styles.cardIcon} />
                </div>
              </div>
              <div className={styles.cardBody}>
                <span className={styles.cardValue}>
                  {summary.avgContentRating > 0 ? `${summary.avgContentRating}⭐` : '—'}
                </span>
                <span className={styles.cardLabel}>Kepuasan Konten</span>
              </div>
              <div className={styles.cardMeta}>
                {summary.structuredReflections} refleksi terstruktur
              </div>
            </div>
          </section>

          {/* Prompt Evolution Chart (RM2) */}
          {evolutionChart.length > 0 && (
            <section className={styles.chartSection}>
              <div className={styles.chartHeader}>
                <div className={styles.chartTitleGroup}>
                  <div className={styles.chartIconWrap}>
                    <FiTrendingUp />
                  </div>
                  <div>
                    <h3 className={styles.chartTitle}>Evolusi Prompt per Sesi (RM2)</h3>
                    <p className={styles.chartDesc}>
                      Melacak peningkatan kompleksitas prompt dan kebiasaan reasoning siswa
                    </p>
                  </div>
                </div>
                <div className={styles.chartLegend}>
                  <span className={`${styles.legendItem} ${styles.legendPrompts}`}>Total Prompt</span>
                  <span className={`${styles.legendItem} ${styles.legendComponents}`}>Avg Komponen</span>
                  <span className={`${styles.legendItem} ${styles.legendReasoning}`}>Reasoning %</span>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={evolutionChart} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis
                    dataKey="session"
                    fontSize={12}
                    tickLine={false}
                    axisLine={{ stroke: '#e2e8f0' }}
                  />
                  <YAxis
                    fontSize={12}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      background: '#fff',
                      border: '1px solid #e2e8f0',
                      borderRadius: '12px',
                      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                      padding: '12px 16px',
                    }}
                    labelStyle={{ fontWeight: 600, marginBottom: '8px' }}
                  />
                  <Bar
                    dataKey="totalPrompts"
                    name="Total Prompt"
                    fill={CHART_COLORS.prompts}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={50}
                  />
                  <Bar
                    dataKey="avgComponents"
                    name="Avg Komponen"
                    fill={CHART_COLORS.components}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={50}
                  />
                  <Bar
                    dataKey="reasoningRate"
                    name="Reasoning %"
                    fill={CHART_COLORS.reasoning}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={50}
                  />
                </BarChart>
              </ResponsiveContainer>
            </section>
          )}

          {/* Student Summary Table */}
          {students.length > 0 && (
            <section className={styles.tableSection}>
              <div className={styles.tableHeader}>
                <div className={styles.tableTitleGroup}>
                  <div className={styles.tableIconWrap}>
                    <FiUsers />
                  </div>
                  <div>
                    <h3 className={styles.tableTitle}>Ringkasan per Siswa</h3>
                    <p className={styles.tableSubtitle}>Klik baris untuk filter berdasarkan siswa</p>
                  </div>
                </div>
                <span className={styles.studentCount}>
                  <FiUsers size={14} />
                  {students.length} siswa
                </span>
              </div>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Siswa</th>
                      <th>Prompt</th>
                      <th>Quiz</th>
                      <th>Akurasi</th>
                      <th>Refleksi</th>
                      <th>Challenge</th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr
                        key={s.userId}
                        onClick={() => setSelectedUser(s.userId)}
                        className={styles.clickableRow}
                      >
                        <td className={styles.emailCell}>
                          <span className={styles.avatarSmall}>
                            {getInitials(s.email)}
                          </span>
                          <span>{s.email}</span>
                        </td>
                        <td className={styles.statCell}>{s.totalPrompts}</td>
                        <td className={styles.statCell}>{s.totalQuizzes}</td>
                        <td>
                          <span className={`${styles.accuracyBadge} ${s.quizAccuracy >= 70 ? styles.good :
                              s.quizAccuracy >= 40 ? styles.medium : styles.low
                            }`}>
                            {s.quizAccuracy}%
                          </span>
                        </td>
                        <td className={styles.statCell}>{s.totalReflections}</td>
                        <td className={styles.statCell}>{s.totalChallenges}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Empty state when no students */}
          {students.length === 0 && (
            <div className={styles.emptyState}>
              <div className={styles.emptyIcon}>
                <FiUsers />
              </div>
              <h3>Belum ada data siswa</h3>
              <p>Data akan muncul setelah siswa mulai menggunakan platform</p>
            </div>
          )}
        </>
      ) : (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <FiBarChart2 />
          </div>
          <h3>Tidak ada data</h3>
          <p>Belum ada data insights yang tersedia untuk ditampilkan</p>
        </div>
      )}
    </div>
  );
}
