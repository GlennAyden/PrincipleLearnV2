// src/app/admin/insights/page.tsx
'use client';
import React, { useState, useEffect } from 'react';
import styles from './page.module.scss';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, LineChart, Line,
} from 'recharts';
import {
  FiTrendingUp, FiBarChart2, FiTarget, FiMessageCircle,
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

export default function InsightsPage() {
  const router = useRouter();
  const { admin, loading: authLoading } = useAdmin();

  const [summary, setSummary] = useState<InsightsSummary | null>(null);
  const [evolutionChart, setEvolutionChart] = useState<EvolutionPoint[]>([]);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [users, setUsers] = useState<{id: string; email: string}[]>([]);
  const [courses, setCourses] = useState<{id: string; title: string}[]>([]);
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



  if (authLoading) return <div className={styles.loading}>Loading...</div>;

  return (
    <div className={styles.page}>
        <header className={styles.header}>
          <div>
            <h2>📊 Teacher Insight Dashboard</h2>
            <p className={styles.headerSub}>Analisis data RM2 (Prompt Evolution) & RM3 (Critical Thinking)</p>
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
        ) : summary && (
          <>
            {/* ── Summary Cards ── */}
            <section className={styles.cardsGrid}>
              <div className={`${styles.card} ${styles.cardBlue}`}>
                <FiTrendingUp className={styles.cardIcon} />
                <div className={styles.cardBody}>
                  <span className={styles.cardValue}>{summary.totalPrompts}</span>
                  <span className={styles.cardLabel}>Total Prompt</span>
                </div>
                <div className={styles.cardMeta}>
                  Avg komponen: {summary.avgComponentsUsed}/3
                </div>
              </div>
              <div className={`${styles.card} ${styles.cardGreen}`}>
                <FiTarget className={styles.cardIcon} />
                <div className={styles.cardBody}>
                  <span className={styles.cardValue}>{summary.quizAccuracy}%</span>
                  <span className={styles.cardLabel}>Akurasi Quiz</span>
                </div>
                <div className={styles.cardMeta}>
                  {summary.quizTotal} total • {summary.quizWithReasoning} dengan reasoning
                </div>
              </div>
              <div className={`${styles.card} ${styles.cardPurple}`}>
                <FiMessageCircle className={styles.cardIcon} />
                <div className={styles.cardBody}>
                  <span className={styles.cardValue}>{summary.reasoningRate}%</span>
                  <span className={styles.cardLabel}>Reasoning Rate</span>
                </div>
                <div className={styles.cardMeta}>
                  CT indicators: {summary.ctIndicators}
                </div>
              </div>
              <div className={`${styles.card} ${styles.cardAmber}`}>
                <FiBarChart2 className={styles.cardIcon} />
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

            {/* ── Prompt Evolution Chart (RM2) ── */}
            {evolutionChart.length > 0 && (
              <section className={styles.chartSection}>
                <h3 className={styles.chartTitle}>📈 Evolusi Prompt per Sesi (RM2)</h3>
                <p className={styles.chartDesc}>Melacak peningkatan kompleksitas prompt dan kebiasaan reasoning siswa</p>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={evolutionChart}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="session" fontSize={12} />
                    <YAxis fontSize={12} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="totalPrompts" name="Total Prompt" fill="#6366f1" radius={[4,4,0,0]} />
                    <Bar dataKey="avgComponents" name="Avg Komponen" fill="#22c55e" radius={[4,4,0,0]} />
                    <Bar dataKey="reasoningRate" name="Reasoning %" fill="#f59e0b" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </section>
            )}

            {/* ── Student Summary Table ── */}
            {students.length > 0 && (
              <section className={styles.tableSection}>
                <h3 className={styles.tableTitle}>👥 Ringkasan per Siswa</h3>
                <div className={styles.tableWrap}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Email</th>
                        <th>Prompt</th>
                        <th>Quiz</th>
                        <th>Akurasi</th>
                        <th>Refleksi</th>
                        <th>Challenge</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.userId} onClick={() => setSelectedUser(s.userId)} className={styles.clickableRow}>
                          <td className={styles.emailCell}>{s.email}</td>
                          <td>{s.totalPrompts}</td>
                          <td>{s.totalQuizzes}</td>
                          <td>
                            <span className={`${styles.accuracyBadge} ${s.quizAccuracy >= 70 ? styles.good : s.quizAccuracy >= 40 ? styles.medium : styles.low}`}>
                              {s.quizAccuracy}%
                            </span>
                          </td>
                          <td>{s.totalReflections}</td>
                          <td>{s.totalChallenges}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
    </div>
  );
}
