'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiDownload, FiArrowLeft, FiCalendar, FiTag,
    FiBarChart2, FiDatabase, FiCheckCircle, FiFilter,
    FiUsers, FiActivity, FiFileText
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import styles from './page.module.scss'

type ExportFormat = 'json' | 'csv'

interface ExportFilters {
    user_id: string
    start_date: string
    end_date: string
}

interface ExportCard {
    id: string
    title: string
    description: string
    icon: React.ReactNode
    iconClass: string
    formats: ExportFormat[]
    buildUrl: (format: ExportFormat, filters: ExportFilters) => string
}

const EXPORT_CARDS: ExportCard[] = [
    {
        id: 'users',
        title: 'Data Siswa',
        description: 'Daftar siswa dengan profil belajar dan metrik keterlibatan',
        icon: <FiUsers />,
        iconClass: 'iconUsers',
        formats: ['csv', 'json'],
        buildUrl: (format) =>
            `/api/admin/users/export?format=${format}`,
    },
    {
        id: 'activity',
        title: 'Aktivitas Belajar',
        description: 'Log aktivitas tanya jawab, tantangan, dan kuis',
        icon: <FiActivity />,
        iconClass: 'iconActivity',
        formats: ['csv', 'json'],
        buildUrl: (format, filters) => {
            const params = new URLSearchParams({ format })
            if (filters.start_date) params.append('startDate', filters.start_date)
            if (filters.end_date) params.append('endDate', filters.end_date)
            if (filters.user_id) params.append('userId', filters.user_id)
            return `/api/admin/activity/export?${params.toString()}`
        },
    },
    {
        id: 'sessions',
        title: 'Sesi Pembelajaran (RM2)',
        description: 'Data sesi pembelajaran longitudinal termasuk informasi siswa, kursus, dan durasi',
        icon: <FiCalendar />,
        iconClass: 'iconSessions',
        formats: ['csv', 'json'],
        buildUrl: (format, filters) => {
            const params = new URLSearchParams({ type: 'sessions', format })
            if (filters.user_id) params.append('user_id', filters.user_id)
            if (filters.start_date) params.append('start_date', filters.start_date)
            if (filters.end_date) params.append('end_date', filters.end_date)
            return `/api/admin/research/export?${params.toString()}`
        },
    },
    {
        id: 'classifications',
        title: 'Klasifikasi Prompt (RM2)',
        description: 'Klasifikasi tahap prompt (SCP, SRP, MQP, Reflective) dengan micro markers dan cognitive depth',
        icon: <FiTag />,
        iconClass: 'iconClassifications',
        formats: ['csv', 'json'],
        buildUrl: (format, filters) => {
            const params = new URLSearchParams({ type: 'classifications', format })
            if (filters.user_id) params.append('user_id', filters.user_id)
            if (filters.start_date) params.append('start_date', filters.start_date)
            if (filters.end_date) params.append('end_date', filters.end_date)
            return `/api/admin/research/export?${params.toString()}`
        },
    },
    {
        id: 'indicators',
        title: 'Indikator Kognitif (RM3)',
        description: 'Penilaian indikator CT dan Critical Thinking per klasifikasi prompt',
        icon: <FiBarChart2 />,
        iconClass: 'iconIndicators',
        formats: ['csv', 'json'],
        buildUrl: (format, filters) => {
            const params = new URLSearchParams({ type: 'indicators', format })
            if (filters.user_id) params.append('user_id', filters.user_id)
            if (filters.start_date) params.append('start_date', filters.start_date)
            if (filters.end_date) params.append('end_date', filters.end_date)
            return `/api/admin/research/export?${params.toString()}`
        },
    },
    {
        id: 'full',
        title: 'Data Lengkap',
        description: 'Semua data penelitian dalam satu file termasuk sesi, klasifikasi, dan indikator',
        icon: <FiDatabase />,
        iconClass: 'iconFull',
        formats: ['json'],
        buildUrl: (_format, filters) => {
            const params = new URLSearchParams({ type: 'full', format: 'json' })
            if (filters.user_id) params.append('user_id', filters.user_id)
            if (filters.start_date) params.append('start_date', filters.start_date)
            if (filters.end_date) params.append('end_date', filters.end_date)
            return `/api/admin/research/export?${params.toString()}`
        },
    },
    {
        id: 'spss',
        title: 'Format SPSS',
        description: 'Data dalam format CSV terstruktur untuk analisis statistik SPSS',
        icon: <FiFileText />,
        iconClass: 'iconSpss',
        formats: ['csv'],
        buildUrl: (_format, filters) => {
            const params = new URLSearchParams({ type: 'spss', format: 'csv' })
            if (filters.user_id) params.append('user_id', filters.user_id)
            if (filters.start_date) params.append('start_date', filters.start_date)
            if (filters.end_date) params.append('end_date', filters.end_date)
            return `/api/admin/research/export?${params.toString()}`
        },
    },
]

export default function EksporPage() {
    const router = useRouter()
    const { admin, loading: authLoading } = useAdmin()
    const [downloading, setDownloading] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [filters, setFilters] = useState<ExportFilters>({
        user_id: '',
        start_date: '',
        end_date: '',
    })

    const handleExport = async (card: ExportCard, format: ExportFormat) => {
        const key = `${card.id}-${format}`
        setDownloading(key)
        setError(null)
        setSuccess(null)

        try {
            const url = card.buildUrl(format, filters)
            const res = await fetch(url, { credentials: 'include' })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Export gagal')
            }

            // Get filename from header or generate one
            const contentDisposition = res.headers.get('Content-Disposition')
            let filename = `export-${card.id}-${new Date().toISOString().slice(0, 10)}.${format}`
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/)
                if (match) filename = match[1]
            }

            // Download file
            const blob = await res.blob()
            const blobUrl = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = blobUrl
            a.download = filename
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(blobUrl)
            document.body.removeChild(a)

            setSuccess(`Berhasil mengunduh ${filename}`)
        } catch (err) {
            console.error('Export error:', err)
            setError(err instanceof Error ? err.message : 'Gagal mengunduh data')
        } finally {
            setDownloading(null)
        }
    }

    if (authLoading) {
        return <div className={styles.loading}>Memuat...</div>
    }

    if (!admin) {
        return <div className={styles.loading}>Unauthorized</div>
    }

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2>
                        <span className={styles.headerIcon}><FiDownload /></span>
                        Export Data
                    </h2>
                    <p className={styles.headerSub}>
                        Unduh data siswa, aktivitas, dan penelitian dalam format JSON atau CSV
                    </p>
                </div>
                <button
                    className={styles.backBtn}
                    onClick={() => router.push('/admin/dashboard')}
                >
                    <FiArrowLeft /> Kembali
                </button>
            </div>

            {error && <div className={styles.errorCard}>{error}</div>}
            {success && (
                <div className={styles.successCard}>
                    <FiCheckCircle /> {success}
                </div>
            )}

            {/* Filters */}
            <div className={styles.filterSection}>
                <h3 className={styles.filterTitle}>
                    <FiFilter /> Filter Export (Opsional)
                </h3>
                <div className={styles.filterGrid}>
                    <div className={styles.filterGroup}>
                        <label>User ID</label>
                        <input
                            type="text"
                            value={filters.user_id}
                            onChange={(e) => setFilters({ ...filters, user_id: e.target.value })}
                            placeholder="UUID siswa (opsional)"
                        />
                    </div>
                    <div className={styles.filterGroup}>
                        <label>Tanggal Mulai</label>
                        <input
                            type="date"
                            value={filters.start_date}
                            onChange={(e) => setFilters({ ...filters, start_date: e.target.value })}
                        />
                    </div>
                    <div className={styles.filterGroup}>
                        <label>Tanggal Akhir</label>
                        <input
                            type="date"
                            value={filters.end_date}
                            onChange={(e) => setFilters({ ...filters, end_date: e.target.value })}
                        />
                    </div>
                </div>
            </div>

            {/* Export Cards */}
            <div className={styles.exportGrid}>
                {EXPORT_CARDS.map((card) => (
                    <div key={card.id} className={styles.exportCard}>
                        <div className={styles.exportCardHeader}>
                            <div className={`${styles.exportIcon} ${styles[card.iconClass]}`}>
                                {card.icon}
                            </div>
                            <div className={styles.exportTitle}>{card.title}</div>
                        </div>
                        <p className={styles.exportDesc}>{card.description}</p>
                        <div className={styles.exportActions}>
                            {card.formats.includes('json') && (
                                <button
                                    className={`${styles.downloadBtn} ${styles.btnJson}`}
                                    onClick={() => handleExport(card, 'json')}
                                    disabled={downloading !== null}
                                >
                                    {downloading === `${card.id}-json` ? (
                                        <><span className={styles.spinner} /> Mengunduh...</>
                                    ) : (
                                        'JSON'
                                    )}
                                </button>
                            )}
                            {card.formats.includes('csv') && (
                                <button
                                    className={`${styles.downloadBtn} ${styles.btnCsv}`}
                                    onClick={() => handleExport(card, 'csv')}
                                    disabled={downloading !== null}
                                >
                                    {downloading === `${card.id}-csv` ? (
                                        <><span className={styles.spinner} /> Mengunduh...</>
                                    ) : (
                                        'CSV'
                                    )}
                                </button>
                            )}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    )
}
