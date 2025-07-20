// src/app/admin/dashboard/page.tsx
'use client'

import React, { useEffect, useState } from 'react'
import styles from './page.module.scss'
import {
  LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from 'recharts'
import {
  FiHome, FiUsers, FiActivity,
  FiLogOut, FiFileText, FiMessageCircle,
  FiCheckSquare, FiBook, FiCalendar,
  FiChevronLeft, FiChevronRight
} from 'react-icons/fi'
import { useRouter, usePathname } from 'next/navigation'
import { useAdmin } from '@/hooks/useAdmin'

interface Metric { label: string; value: number; icon: React.ReactNode }
interface ChartPoint {
  date: string
  totalGenerateCourse: number
  transcriptQnA: number
  soalOtomatis: number
  jurnalRefleksi: number
}

const formatDate = (date: Date) => {
  return date.toISOString().split('T')[0];
};

export default function AdminDashboardPage() {
  const router = useRouter()
  const pathname = usePathname()
  const { admin, loading: authLoading } = useAdmin()
  const [metrics, setMetrics] = useState<Metric[]>([])
  const [chartData, setChartData] = useState<ChartPoint[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  
  // Date range state
  const [startDate, setStartDate] = useState(() => {
    const date = new Date();
    date.setDate(date.getDate() - 6); // Default to 7-day window
    return formatDate(date);
  });
  const [endDate, setEndDate] = useState(() => formatDate(new Date()));

  // 1) Redirect jika sudah selesai loading tapi bukan admin
  useEffect(() => {
    if (!authLoading && !admin) {
      router.push('/admin/login')
    }
  }, [authLoading, admin, router])

  // 2) Fetch data dashboard setelah admin tersedia
  useEffect(() => {
    if (authLoading || !admin) return

    const fetchDashboardData = async () => {
      setDataLoading(true)
      setError(null)
      
      try {
        console.log('[Dashboard] Fetching dashboard data...')
        
        // Build URL with date range parameters
        const url = `/api/admin/dashboard?startDate=${startDate}&endDate=${endDate}`;
        
        const res = await fetch(url, { 
          credentials: 'include',
          cache: 'no-store',
          headers: {
            'Cache-Control': 'no-cache'
          }
        })
        
        if (!res.ok) {
          const errorData = await res.json();
          throw new Error(errorData.message || `Failed to fetch dashboard data: ${res.status}`);
        }
        
        const data = await res.json()
        console.log('[Dashboard] Received data:', data)
        
        // Cek data yang diterima
        if (!data.metrics) {
          throw new Error('Invalid dashboard data format: missing metrics')
        }
        
        setMetrics([
          { 
            label: 'Total Generate Course', 
            value: data.metrics.totalGenerateCourse || 0,
            icon: <FiFileText size={24} />
          },
          { 
            label: 'Transkrip QnA', 
            value: data.metrics.transcriptQnA || 0,
            icon: <FiMessageCircle size={24} />
          },
          { 
            label: 'Soal Otomatis', 
            value: data.metrics.soalOtomatis || 0,
            icon: <FiCheckSquare size={24} />
          },
          { 
            label: 'Jurnal Refleksi', 
            value: data.metrics.jurnalRefleksi || 0,
            icon: <FiBook size={24} />
          },
        ])
        
        setChartData(data.chart || [])
        setDataLoading(false)
      } catch (err) {
        console.error('[Dashboard] Error fetching dashboard data:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setMetrics([
          { 
            label: 'Total Generate Course', 
            value: 0,
            icon: <FiFileText size={24} />
          },
          { 
            label: 'Transkrip QnA', 
            value: 0,
            icon: <FiMessageCircle size={24} />
          },
          { 
            label: 'Soal Otomatis', 
            value: 0,
            icon: <FiCheckSquare size={24} />
          },
          { 
            label: 'Jurnal Refleksi', 
            value: 0,
            icon: <FiBook size={24} />
          },
        ])
        setChartData([])
        setDataLoading(false)
      }
    }
    
    fetchDashboardData()
    
    // Remove automatic polling since we're now using date filters
    // Let the user manually refresh when they change dates
  }, [authLoading, admin, startDate, endDate])

  // Validate date range when dates change
  useEffect(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // Check if start date is after end date
    if (start > end) {
      setError('Start date cannot be after end date');
      return;
    }
    
    // Check if range exceeds 31 days (1 month)
    const maxDate = new Date(start);
    maxDate.setDate(start.getDate() + 31);
    
    if (end > maxDate) {
      setError('Date range cannot exceed 31 days');
      return;
    }
    
    // Clear error if everything is valid
    if (error === 'Start date cannot be after end date' || error === 'Date range cannot exceed 31 days') {
      setError(null);
    }
  }, [startDate, endDate, error]);

  // 3) Tampilkan loading sementara
  if (authLoading) {
    return <div className={styles.loading}>Loading...</div>
  }

  // 4) Render setelah admin terautentikasi
  const handleLogout = async () => {
    await fetch('/api/admin/logout', { method: 'POST', credentials: 'include' })
    router.push('/admin/login')
  }
  
  // Function to set previous week
  const handlePreviousWeek = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setDate(start.getDate() - 7);
    end.setDate(end.getDate() - 7);
    setStartDate(formatDate(start));
    setEndDate(formatDate(end));
  };
  
  // Function to set next week (up to current date)
  const handleNextWeek = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const today = new Date();
    
    start.setDate(start.getDate() + 7);
    end.setDate(end.getDate() + 7);
    
    // Don't allow going past today
    if (end > today) {
      end.setTime(today.getTime());
      // If end date is now today, adjust start date to maintain a consistent range
      const newStart = new Date(end);
      newStart.setDate(end.getDate() - (end.getDay() + 6) % 7);
      setStartDate(formatDate(newStart));
    } else {
      setStartDate(formatDate(start));
    }
    
    setEndDate(formatDate(end < today ? end : today));
  };
  
  // Get the max value for any data point to set domain for YAxis
  const getMaxValue = () => {
    if (!chartData || chartData.length === 0) return 10;
    
    const max = Math.max(
      ...chartData.map(d => Math.max(
        d.totalGenerateCourse,
        d.transcriptQnA,
        d.soalOtomatis,
        d.jurnalRefleksi
      ))
    );
    
    // Add 20% padding to the max value and round up
    return Math.ceil(max * 1.2);
  };

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>Principle Learn</div>
        <nav>
          <ul className={styles.navList}>
            <li
              className={`${styles.navItem} ${
                pathname === '/admin/dashboard' ? styles.active : ''
              }`}
              onClick={() => router.push('/admin/dashboard')}
            >
              <FiHome className={styles.navIcon} /> Dashboard
            </li>
            <li
              className={`${styles.navItem} ${
                pathname === '/admin/users' ? styles.active : ''
              }`}
              onClick={() => router.push('/admin/users')}
            >
              <FiUsers className={styles.navIcon} /> Users
            </li>
            <li
              className={`${styles.navItem} ${
                pathname === '/admin/activity' ? styles.active : ''
              }`}
              onClick={() => router.push('/admin/activity')}
            >
              <FiActivity className={styles.navIcon} /> Activity
            </li>
          </ul>
        </nav>
      </aside>

      <main className={styles.main}>
        <header className={styles.header}>
          <h2>Welcome, {admin?.email}</h2>
          <button className={styles.logout} onClick={handleLogout}>
            <FiLogOut /> Log out
          </button>
        </header>

        {error && (
          <div className={styles.errorCard}>
            <p>{error}</p>
            <button onClick={() => typeof window !== 'undefined' && window.location.reload()}>Refresh</button>
          </div>
        )}
        
        {/* Date Filter Controls */}
        <section className={styles.dateFilterControls}>
          <div className={styles.dateNavigator}>
            <button
              className={styles.navButton}
              onClick={handlePreviousWeek}
              title="Previous period"
            >
              <FiChevronLeft />
            </button>
            
            <div className={styles.dateInputs}>
              <div className={styles.dateInputGroup}>
                <label htmlFor="startDate">
                  <FiCalendar /> From:
                </label>
                <input
                  type="date"
                  id="startDate"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className={styles.dateInput}
                />
              </div>
              
              <div className={styles.dateInputGroup}>
                <label htmlFor="endDate">
                  <FiCalendar /> To:
                </label>
                <input
                  type="date"
                  id="endDate"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  max={formatDate(new Date())}
                  className={styles.dateInput}
                />
              </div>
            </div>
            
            <button
              className={styles.navButton}
              onClick={handleNextWeek}
              title="Next period"
              disabled={new Date(endDate) >= new Date()}
            >
              <FiChevronRight />
            </button>
          </div>
        </section>

        <section className={styles.chartCard}>
          {dataLoading ? (
            <div className={styles.loading}>Loading chart data...</div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis domain={[0, getMaxValue()]} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="totalGenerateCourse"
                  name="Total Generate Course"
                  stroke="#f6a01b"
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="transcriptQnA"
                  name="Transkrip QnA"
                  stroke="#e03a3e"
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="soalOtomatis"
                  name="Soal Otomatis"
                  stroke="#d75cd1"
                  dot={{ r: 4 }}
                />
                <Line
                  type="monotone"
                  dataKey="jurnalRefleksi"
                  name="Jurnal Refleksi"
                  stroke="#228be6"
                  dot={{ r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </section>

        <section className={styles.metricsGrid}>
          {metrics.map((m) => (
            <div key={m.label} className={styles.metricCard}>
              <div className={styles.metricIcon}>
                {m.icon}
              </div>
              <div>
                <div className={styles.metricValue}>{m.value}</div>
                <div className={styles.metricLabel}>{m.label}</div>
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  )
}
