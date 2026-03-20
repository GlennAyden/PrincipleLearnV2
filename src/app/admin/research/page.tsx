'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiClipboard, FiUsers, FiLayers, FiBarChart2,
    FiDownload, FiCalendar, FiTag, FiActivity
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import styles from './page.module.scss'

interface ResearchStats {
    totalSessions: number
    totalClassifications: number
    totalIndicators: number
    totalStudents: number
    stageDistribution: {
        SCP: number
        SRP: number
        MQP: number
        REFLECTIVE: number
    }
}

export default function ResearchDashboard() {
    const router = useRouter()
    const { admin, loading: authLoading } = useAdmin()
    const [stats, setStats] = useState<ResearchStats>({
        totalSessions: 0,
        totalClassifications: 0,
        totalIndicators: 0,
        totalStudents: 0,
        stageDistribution: { SCP: 0, SRP: 0, MQP: 0, REFLECTIVE: 0 }
    })
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!authLoading && admin) {
            fetchStats()
        }
    }, [authLoading, admin])

    const fetchStats = async () => {
        try {
            setLoading(true)
            setError(null)

            // Fetch sessions
            const sessionsRes = await fetch('/api/admin/research/sessions?limit=1000', {
                credentials: 'include'
            })
            const sessionsData = await sessionsRes.json()

            // Fetch classifications
            const classRes = await fetch('/api/admin/research/classifications?limit=1000', {
                credentials: 'include'
            })
            const classData = await classRes.json()

            // Fetch indicators
            const indRes = await fetch('/api/admin/research/indicators?limit=1000', {
                credentials: 'include'
            })
            const indData = await indRes.json()

            // Calculate stats
            const sessions = sessionsData.data || []
            const classifications = classData.data || []
            const indicators = indData.data || []

            // Get unique students
            const uniqueStudents = new Set(sessions.map((s: { user_id: string }) => s.user_id))

            // Calculate stage distribution
            const stageDistribution = { SCP: 0, SRP: 0, MQP: 0, REFLECTIVE: 0 }
            classifications.forEach((c: { prompt_stage: string }) => {
                if (c.prompt_stage in stageDistribution) {
                    stageDistribution[c.prompt_stage as keyof typeof stageDistribution]++
                }
            })

            setStats({
                totalSessions: sessions.length,
                totalClassifications: classifications.length,
                totalIndicators: indicators.length,
                totalStudents: uniqueStudents.size,
                stageDistribution
            })
        } catch (err) {
            console.error('Error fetching stats:', err)
            setError('Gagal memuat data statistik')
        } finally {
            setLoading(false)
        }
    }

    if (authLoading) {
        return <div className={styles.loading}>Memuat...</div>
    }

    const totalPrompts = Object.values(stats.stageDistribution).reduce((a, b) => a + b, 0)

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2>
                        <span className={styles.headerIcon}><FiClipboard /></span>
                        Research Dashboard
                    </h2>
                    <p className={styles.headerSub}>
                        Analisis perkembangan prompt dan indikator kognitif siswa
                    </p>
                </div>
            </div>

            {error && <div className={styles.errorCard}>{error}</div>}

            {loading ? (
                <div className={styles.loading}>Memuat data...</div>
            ) : (
                <>
                    {/* Stats Cards */}
                    <div className={styles.statsGrid}>
                        <div className={`${styles.statCard} ${styles.statCardBlue}`}>
                            <div className={styles.statHeader}>
                                <div className={styles.statIconWrap}><FiCalendar /></div>
                            </div>
                            <div className={styles.statValue}>{stats.totalSessions}</div>
                            <div className={styles.statLabel}>Total Sesi</div>
                        </div>

                        <div className={`${styles.statCard} ${styles.statCardPurple}`}>
                            <div className={styles.statHeader}>
                                <div className={styles.statIconWrap}><FiTag /></div>
                            </div>
                            <div className={styles.statValue}>{stats.totalClassifications}</div>
                            <div className={styles.statLabel}>Klasifikasi Prompt</div>
                        </div>

                        <div className={`${styles.statCard} ${styles.statCardGreen}`}>
                            <div className={styles.statHeader}>
                                <div className={styles.statIconWrap}><FiActivity /></div>
                            </div>
                            <div className={styles.statValue}>{stats.totalIndicators}</div>
                            <div className={styles.statLabel}>Penilaian Indikator</div>
                        </div>

                        <div className={`${styles.statCard} ${styles.statCardAmber}`}>
                            <div className={styles.statHeader}>
                                <div className={styles.statIconWrap}><FiUsers /></div>
                            </div>
                            <div className={styles.statValue}>{stats.totalStudents}</div>
                            <div className={styles.statLabel}>Siswa Terlibat</div>
                        </div>
                    </div>

                    {/* Quick Actions */}
                    <div className={styles.actionsSection}>
                        <h3 className={styles.sectionTitle}>
                            <FiLayers /> Aksi Cepat
                        </h3>
                        <div className={styles.actionsGrid}>
                            <div
                                className={styles.actionCard}
                                onClick={() => router.push('/admin/research/sessions')}
                            >
                                <div className={styles.actionIcon}><FiCalendar /></div>
                                <div className={styles.actionLabel}>Sesi Pembelajaran</div>
                                <div className={styles.actionDesc}>Kelola sesi longitudinal</div>
                            </div>

                            <div
                                className={styles.actionCard}
                                onClick={() => router.push('/admin/research/classifications')}
                            >
                                <div className={styles.actionIcon}><FiTag /></div>
                                <div className={styles.actionLabel}>Klasifikasi Prompt</div>
                                <div className={styles.actionDesc}>SCP, SRP, MQP, Reflektif</div>
                            </div>

                            <div
                                className={styles.actionCard}
                                onClick={() => router.push('/admin/research/indicators')}
                            >
                                <div className={styles.actionIcon}><FiBarChart2 /></div>
                                <div className={styles.actionLabel}>Indikator Kognitif</div>
                                <div className={styles.actionDesc}>CT & Critical Thinking</div>
                            </div>

                            <div
                                className={styles.actionCard}
                                onClick={() => router.push('/admin/research/export')}
                            >
                                <div className={styles.actionIcon}><FiDownload /></div>
                                <div className={styles.actionLabel}>Export Data</div>
                                <div className={styles.actionDesc}>JSON, CSV</div>
                            </div>
                        </div>
                    </div>

                    {/* Stage Distribution */}
                    <div className={styles.distributionSection}>
                        <h3 className={styles.sectionTitle}>
                            <FiLayers /> Distribusi Tahap Prompt
                        </h3>
                        <div className={styles.stageGrid}>
                            <div className={`${styles.stageCard} ${styles.stageSCP}`}>
                                <div className={styles.stageLabel}>SCP</div>
                                <div className={styles.stageValue}>{stats.stageDistribution.SCP}</div>
                                <div className={styles.stagePercent}>
                                    {totalPrompts > 0 ? Math.round((stats.stageDistribution.SCP / totalPrompts) * 100) : 0}%
                                </div>
                            </div>

                            <div className={`${styles.stageCard} ${styles.stageSRP}`}>
                                <div className={styles.stageLabel}>SRP</div>
                                <div className={styles.stageValue}>{stats.stageDistribution.SRP}</div>
                                <div className={styles.stagePercent}>
                                    {totalPrompts > 0 ? Math.round((stats.stageDistribution.SRP / totalPrompts) * 100) : 0}%
                                </div>
                            </div>

                            <div className={`${styles.stageCard} ${styles.stageMQP}`}>
                                <div className={styles.stageLabel}>MQP</div>
                                <div className={styles.stageValue}>{stats.stageDistribution.MQP}</div>
                                <div className={styles.stagePercent}>
                                    {totalPrompts > 0 ? Math.round((stats.stageDistribution.MQP / totalPrompts) * 100) : 0}%
                                </div>
                            </div>

                            <div className={`${styles.stageCard} ${styles.stageREFLECTIVE}`}>
                                <div className={styles.stageLabel}>Reflective</div>
                                <div className={styles.stageValue}>{stats.stageDistribution.REFLECTIVE}</div>
                                <div className={styles.stagePercent}>
                                    {totalPrompts > 0 ? Math.round((stats.stageDistribution.REFLECTIVE / totalPrompts) * 100) : 0}%
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Info Section */}
                    <div className={styles.recentSection}>
                        <h3 className={styles.sectionTitle}>
                            <FiClipboard /> Panduan Tahap Prompt
                        </h3>
                        <div className={styles.recentList}>
                            <div className={styles.recentItem}>
                                <div className={`${styles.recentIcon} ${styles.recentIconSession}`}>1</div>
                                <div className={styles.recentContent}>
                                    <div className={styles.recentTitle}>SCP (Simple Clarification Prompt)</div>
                                    <div className={styles.recentMeta}>Pertanyaan tunggal, langsung, minim konteks masalah</div>
                                </div>
                            </div>
                            <div className={styles.recentItem}>
                                <div className={`${styles.recentIcon} ${styles.recentIconClassification}`}>2</div>
                                <div className={styles.recentContent}>
                                    <div className={styles.recentTitle}>SRP (Structured Reformulation Prompt)</div>
                                    <div className={styles.recentMeta}>Prompt direformulasi setelah respons awal AI untuk memperjelas tujuan</div>
                                </div>
                            </div>
                            <div className={styles.recentItem}>
                                <div className={`${styles.recentIcon} ${styles.recentIconIndicator}`}>3</div>
                                <div className={styles.recentContent}>
                                    <div className={styles.recentTitle}>MQP (Multi-Question Prompt)</div>
                                    <div className={styles.recentMeta}>Pertanyaan berlapis dan iteratif dalam satu rangkaian penyelesaian masalah</div>
                                </div>
                            </div>
                            <div className={styles.recentItem}>
                                <div className={`${styles.recentIcon} ${styles.recentIconIndicator}`}>4</div>
                                <div className={styles.recentContent}>
                                    <div className={styles.recentTitle}>Reflective Prompt</div>
                                    <div className={styles.recentMeta}>Prompt menilai kualitas solusi, membandingkan alternatif, dan menjustifikasi keputusan</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
