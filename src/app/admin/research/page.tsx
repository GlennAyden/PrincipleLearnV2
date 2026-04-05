'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiClipboard, FiUsers, FiLayers, FiBarChart2,
    FiDownload, FiCalendar, FiTag, FiActivity
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import styles from './page.module.scss'
import dynamic from 'next/dynamic'
const StageHeatmapChart = dynamic(() => import('@/components/admin/ResearchChart').then(mod => ({ default: mod.StageHeatmapChart })), { ssr: false })
const UserProgressionChart = dynamic(() => import('@/components/admin/ResearchChart').then(mod => ({ default: mod.UserProgressionChart })), { ssr: false })
import type { ResearchAnalytics } from '@/types/research'

export default function ResearchDashboard() {
    const router = useRouter()
    const { admin, loading: authLoading } = useAdmin()
    const [analytics, setAnalytics] = useState<ResearchAnalytics | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        if (!authLoading && admin) {
            fetchAnalytics()
        }
    }, [authLoading, admin])

    const fetchAnalytics = async () => {
        try {
            setLoading(true)
            setError(null)

            // Single API call - analytics endpoint now provides all stats
            const res = await fetch('/api/admin/research/analytics', { credentials: 'include' })
            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Gagal memuat data')
            }

            if (data.data) {
                setAnalytics(data.data)
            }
        } catch (err) {
            console.error('Error fetching analytics:', err)
            setError('Gagal memuat data statistik')
        } finally {
            setLoading(false)
        }
    }

    if (authLoading) {
        return <div className={styles.loading}>Memuat...</div>
    }

    const totalSessions = analytics?.total_sessions || 0
    const totalClassifications = analytics?.total_classifications || 0
    const totalIndicators = analytics?.total_indicators || 0
    const totalStudents = analytics?.total_students || 0
    const stageDistribution = analytics?.stage_distribution || { SCP: 0, SRP: 0, MQP: 0, REFLECTIVE: 0 }
    const totalPrompts = Object.values(stageDistribution).reduce((a, b) => a + b, 0)

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
                            <div className={styles.statValue}>{totalSessions}</div>
                            <div className={styles.statLabel}>Total Sesi</div>
                        </div>

                        <div className={`${styles.statCard} ${styles.statCardPurple}`}>
                            <div className={styles.statHeader}>
                                <div className={styles.statIconWrap}><FiTag /></div>
                            </div>
                            <div className={styles.statValue}>{totalClassifications}</div>
                            <div className={styles.statLabel}>Klasifikasi Prompt</div>
                        </div>

                        <div className={`${styles.statCard} ${styles.statCardGreen}`}>
                            <div className={styles.statHeader}>
                                <div className={styles.statIconWrap}><FiActivity /></div>
                            </div>
                            <div className={styles.statValue}>{totalIndicators}</div>
                            <div className={styles.statLabel}>Penilaian Indikator</div>
                        </div>

                        <div className={`${styles.statCard} ${styles.statCardAmber}`}>
                            <div className={styles.statHeader}>
                                <div className={styles.statIconWrap}><FiUsers /></div>
                            </div>
                            <div className={styles.statValue}>{totalStudents}</div>
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
                                <div className={styles.actionDesc}>JSON, CSV, SPSS</div>
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
                                <div className={styles.stageValue}>{stageDistribution.SCP}</div>
                                <div className={styles.stagePercent}>
                                    {totalPrompts > 0 ? Math.round((stageDistribution.SCP / totalPrompts) * 100) : 0}%
                                </div>
                            </div>

                            <div className={`${styles.stageCard} ${styles.stageSRP}`}>
                                <div className={styles.stageLabel}>SRP</div>
                                <div className={styles.stageValue}>{stageDistribution.SRP}</div>
                                <div className={styles.stagePercent}>
                                    {totalPrompts > 0 ? Math.round((stageDistribution.SRP / totalPrompts) * 100) : 0}%
                                </div>
                            </div>

                            <div className={`${styles.stageCard} ${styles.stageMQP}`}>
                                <div className={styles.stageLabel}>MQP</div>
                                <div className={styles.stageValue}>{stageDistribution.MQP}</div>
                                <div className={styles.stagePercent}>
                                    {totalPrompts > 0 ? Math.round((stageDistribution.MQP / totalPrompts) * 100) : 0}%
                                </div>
                            </div>

                            <div className={`${styles.stageCard} ${styles.stageREFLECTIVE}`}>
                                <div className={styles.stageLabel}>Reflective</div>
                                <div className={styles.stageValue}>{stageDistribution.REFLECTIVE}</div>
                                <div className={styles.stagePercent}>
                                    {totalPrompts > 0 ? Math.round((stageDistribution.REFLECTIVE / totalPrompts) * 100) : 0}%
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Analytics Charts */}
                    {analytics && (
                        <div className={styles.analyticsSection}>
                            <h3 className={styles.sectionTitle}>
                                📊 Analytics & Progression
                            </h3>
                            <div className={styles.chartsGrid}>
                                <div className={styles.chartCard}>
                                    <h4>Stage Heatmap (RM2)</h4>
                                    <StageHeatmapChart data={analytics.stage_heatmap} />
                                </div>
                                <div className={styles.chartCard}>
                                    <h4>User Progression (Top 10)</h4>
                                    <UserProgressionChart progression={analytics.user_progression} />
                                </div>
                            </div>
                            <div className={styles.reliabilityCard}>
                                <h4>Inter-Rater Reliability</h4>
                                <div className={styles.reliabilityStats}>
                                    <div>Kappa Prompt: {analytics.inter_rater_kappa.prompt_stage.toFixed(2)}</div>
                                    <div>Kappa CT: {analytics.inter_rater_kappa.ct_indicators.toFixed(2)}</div>
                                    <div>Status: <span className={styles.reliabilityStatus}>{analytics.inter_rater_kappa.reliability_status}</span></div>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Panduan Tahap Prompt */}
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
