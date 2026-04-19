'use client'

import React, { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiClipboard, FiUsers, FiLayers, FiBarChart2,
    FiCalendar, FiTag, FiActivity, FiArrowRight, FiCheckSquare,
    FiGitMerge, FiArchive, FiDownload
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import { apiFetch } from '@/lib/api-client'
import styles from './page.module.scss'
import dynamic from 'next/dynamic'
const StageHeatmapChart = dynamic(() => import('@/components/admin/ResearchChart').then(mod => ({ default: mod.StageHeatmapChart })), { ssr: false })
const UserProgressionChart = dynamic(() => import('@/components/admin/ResearchChart').then(mod => ({ default: mod.UserProgressionChart })), { ssr: false })
import type { ResearchAnalytics } from '@/types/research'

export default function RisetDashboard() {
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

            const res = await apiFetch('/api/admin/research/analytics', { cache: 'no-store' })
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
                        Dashboard Riset
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
                    {/* KPI Cards */}
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
                                <div className={styles.stageLabel}>Reflektif</div>
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
                                <FiBarChart2 /> Analitik &amp; Progresi
                            </h3>
                            <div className={styles.chartsGrid}>
                                <div className={styles.chartCard}>
                                    <h4>Heatmap Tahap (RM2)</h4>
                                    <StageHeatmapChart data={analytics.stage_heatmap} />
                                </div>
                                <div className={styles.chartCard}>
                                    <h4>Progresi Pengguna (10 Teratas)</h4>
                                    <UserProgressionChart progression={analytics.user_progression} />
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Navigation Cards */}
                    <div className={styles.navSection}>
                        <h3 className={styles.sectionTitle}>
                            <FiLayers /> Halaman Riset
                        </h3>
                        <div className={styles.navGrid}>
                            <div
                                className={styles.navCard}
                                onClick={() => router.push('/admin/riset/prompt')}
                            >
                                <div className={styles.navIconWrap}>
                                    <FiTag />
                                </div>
                                <div className={styles.navContent}>
                                    <div className={styles.navLabel}>Evolusi Prompt (RM2)</div>
                                    <div className={styles.navDesc}>
                                        Kelola sesi pembelajaran dan klasifikasi tahap prompt siswa
                                    </div>
                                </div>
                                <div className={styles.navArrow}><FiArrowRight /></div>
                            </div>

                            <div
                                className={styles.navCard}
                                onClick={() => router.push('/admin/riset/kognitif')}
                            >
                                <div className={styles.navIconWrap}>
                                    <FiBarChart2 />
                                </div>
                                <div className={styles.navContent}>
                                    <div className={styles.navLabel}>Indikator Kognitif (RM3)</div>
                                    <div className={styles.navDesc}>
                                        Penilaian indikator CT &amp; Critical Thinking dan matriks silang. Termasuk skor otomatis dari semua fitur interaksi.
                                    </div>
                                </div>
                                <div className={styles.navArrow}><FiArrowRight /></div>
                            </div>

                            <div
                                className={styles.navCard}
                                onClick={() => router.push('/admin/riset/bukti')}
                            >
                                <div className={styles.navIconWrap}>
                                    <FiArchive />
                                </div>
                                <div className={styles.navContent}>
                                    <div className={styles.navLabel}>Evidence Bank RM2/RM3</div>
                                    <div className={styles.navDesc}>
                                        Tinjau bukti mentah, respons AI, artefak, dan status coding per siswa untuk menjaga kelengkapan data tesis.
                                    </div>
                                </div>
                                <div className={styles.navArrow}><FiArrowRight /></div>
                            </div>

                            <div
                                className={styles.navCard}
                                onClick={() => router.push('/admin/riset/readiness')}
                            >
                                <div className={styles.navIconWrap}>
                                    <FiCheckSquare />
                                </div>
                                <div className={styles.navContent}>
                                    <div className={styles.navLabel}>Kesiapan Analisis RM2/RM3</div>
                                    <div className={styles.navDesc}>
                                        Pantau kelengkapan bukti siswa, hambatan, dan langkah berikutnya sebelum analisis tesis.
                                    </div>
                                </div>
                                <div className={styles.navArrow}><FiArrowRight /></div>
                            </div>

                            <div
                                className={styles.navCard}
                                onClick={() => router.push('/admin/riset/triangulasi')}
                            >
                                <div className={styles.navIconWrap}>
                                    <FiGitMerge />
                                </div>
                                <div className={styles.navContent}>
                                    <div className={styles.navLabel}>Triangulasi Bukti</div>
                                    <div className={styles.navDesc}>
                                        Tinjau konsistensi indikator lintas sumber data untuk mendukung temuan RM2 dan RM3.
                                    </div>
                                </div>
                                <div className={styles.navArrow}><FiArrowRight /></div>
                            </div>

                            <div
                                className={styles.navCard}
                                onClick={() => router.push('/admin/ekspor')}
                            >
                                <div className={styles.navIconWrap}>
                                    <FiDownload />
                                </div>
                                <div className={styles.navContent}>
                                    <div className={styles.navLabel}>Ekspor Lampiran Tesis</div>
                                    <div className={styles.navDesc}>
                                        Unduh bundle RM2/RM3, readiness, evidence mentah, codebook, dan versi anonim siap lampiran.
                                    </div>
                                </div>
                                <div className={styles.navArrow}><FiArrowRight /></div>
                            </div>
                        </div>
                    </div>

                    {/* Inter-Rater Reliability */}
                    {analytics && (
                        <div className={styles.reliabilityCard}>
                            <h4>Reliabilitas Antar-Penilai</h4>
                            <div className={styles.reliabilityStats}>
                                <div>Kappa Prompt: {analytics.inter_rater_kappa.prompt_stage.toFixed(2)}</div>
                                <div>Kappa CT: {analytics.inter_rater_kappa.ct_indicators.toFixed(2)}</div>
                                <div>Status: <span className={styles.reliabilityStatus}>{analytics.inter_rater_kappa.reliability_status}</span></div>
                            </div>
                        </div>
                    )}

                    {/* Panduan Tahap Prompt */}
                    <div className={styles.guideSection}>
                        <h3 className={styles.sectionTitle}>
                            <FiClipboard /> Panduan Tahap Prompt
                        </h3>
                        <div className={styles.guideList}>
                            <div className={styles.guideItem}>
                                <div className={`${styles.guideIcon} ${styles.guideIconSCP}`}>1</div>
                                <div className={styles.guideContent}>
                                    <div className={styles.guideTitle}>SCP (Simple Clarification Prompt)</div>
                                    <div className={styles.guideMeta}>Pertanyaan tunggal, langsung, minim konteks masalah</div>
                                </div>
                            </div>
                            <div className={styles.guideItem}>
                                <div className={`${styles.guideIcon} ${styles.guideIconSRP}`}>2</div>
                                <div className={styles.guideContent}>
                                    <div className={styles.guideTitle}>SRP (Structured Reformulation Prompt)</div>
                                    <div className={styles.guideMeta}>Prompt direformulasi setelah respons awal AI untuk memperjelas tujuan</div>
                                </div>
                            </div>
                            <div className={styles.guideItem}>
                                <div className={`${styles.guideIcon} ${styles.guideIconMQP}`}>3</div>
                                <div className={styles.guideContent}>
                                    <div className={styles.guideTitle}>MQP (Multi-Question Prompt)</div>
                                    <div className={styles.guideMeta}>Pertanyaan berlapis dan iteratif dalam satu rangkaian penyelesaian masalah</div>
                                </div>
                            </div>
                            <div className={styles.guideItem}>
                                <div className={`${styles.guideIcon} ${styles.guideIconREF}`}>4</div>
                                <div className={styles.guideContent}>
                                    <div className={styles.guideTitle}>Reflective Prompt</div>
                                    <div className={styles.guideMeta}>Prompt menilai kualitas solusi, membandingkan alternatif, dan menjustifikasi keputusan</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    )
}
