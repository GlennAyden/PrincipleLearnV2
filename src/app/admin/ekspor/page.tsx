'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiDownload, FiArrowLeft, FiCalendar, FiTag,
    FiBarChart2, FiDatabase, FiCheckCircle, FiFilter,
    FiUsers, FiActivity, FiFileText
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import { apiFetch } from '@/lib/api-client'
import styles from './page.module.scss'

type ExportFormat = 'json' | 'csv'
type ResearchDataType = 'sessions' | 'classifications' | 'indicators' | 'evidence' | 'longitudinal' | 'readiness' | 'all'

interface ExportFilters {
    user_id: string
    course_id: string
    start_date: string
    end_date: string
    anonymize: boolean
}

interface ResearchExportUrlOptions {
    dataType?: ResearchDataType
    format: ExportFormat
    filters: ExportFilters
    spss?: boolean
}

const appendOptionalResearchFilters = (params: URLSearchParams, filters: ExportFilters) => {
    const optionalFilters = {
        user_id: filters.user_id,
        course_id: filters.course_id,
        start_date: filters.start_date,
        end_date: filters.end_date,
    }

    Object.entries(optionalFilters).forEach(([key, value]) => {
        const normalizedValue = value.trim()
        if (normalizedValue) params.append(key, normalizedValue)
    })

    if (filters.anonymize) params.append('anonymize', 'true')
}

const buildResearchExportUrl = ({
    dataType = 'all',
    format,
    filters,
    spss = false,
}: ResearchExportUrlOptions) => {
    const params = new URLSearchParams()

    if (spss) {
        params.append('spss', 'true')
        params.append('format', 'csv')
    } else {
        params.append('data_type', dataType)
        params.append('format', format)
    }

    appendOptionalResearchFilters(params, filters)

    return `/api/admin/research/export?${params.toString()}`
}

const buildResearchUrl = (dataType: ResearchDataType) =>
    (format: ExportFormat, filters: ExportFilters) =>
        buildResearchExportUrl({ dataType, format, filters })

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
        buildUrl: (format, filters) => {
            const params = new URLSearchParams({ format })
            if (filters.user_id) params.append('user_id', filters.user_id)
            if (filters.start_date) params.append('start_date', filters.start_date)
            if (filters.end_date) params.append('end_date', filters.end_date)
            if (filters.anonymize) params.append('anonymize', 'true')
            return `/api/admin/users/export?${params.toString()}`
        },
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
            if (filters.course_id) params.append('courseId', filters.course_id)
            if (filters.anonymize) params.append('anonymize', 'true')
            return `/api/admin/activity/export?${params.toString()}`
        },
    },
    {
        id: 'sessions',
        title: 'Sesi Pembelajaran (RM2)',
        description: 'Dataset sesi RM2 siap lampiran tesis: siswa, kursus, urutan sesi, dan durasi belajar',
        icon: <FiCalendar />,
        iconClass: 'iconSessions',
        formats: ['csv', 'json'],
        buildUrl: buildResearchUrl('sessions'),
    },
    {
        id: 'classifications',
        title: 'Klasifikasi Prompt (RM2)',
        description: 'Lampiran coding RM2 untuk tahap prompt SCP, SRP, MQP, Reflective, micro markers, dan cognitive depth',
        icon: <FiTag />,
        iconClass: 'iconClassifications',
        formats: ['csv', 'json'],
        buildUrl: buildResearchUrl('classifications'),
    },
    {
        id: 'indicators',
        title: 'Indikator Kognitif (RM3)',
        description: 'Skor indikator CT dan Critical Thinking RM3 siap lampiran analisis tesis',
        icon: <FiBarChart2 />,
        iconClass: 'iconIndicators',
        formats: ['csv', 'json'],
        buildUrl: buildResearchUrl('indicators'),
    },
    {
        id: 'evidence',
        title: 'Evidence Bank RM2/RM3',
        description: 'Prompt mentah, jawaban AI, artefak, dan triangulasi siap dibawa ke lampiran tesis',
        icon: <FiFileText />,
        iconClass: 'iconEvidence',
        formats: ['csv', 'json'],
        buildUrl: buildResearchUrl('evidence'),
    },
    {
        id: 'longitudinal',
        title: 'Longitudinal RM2/RM3',
        description: 'Perkembangan prompt dan indikator kognitif lintas sesi untuk lampiran longitudinal tesis',
        icon: <FiActivity />,
        iconClass: 'iconLongitudinal',
        formats: ['csv', 'json'],
        buildUrl: buildResearchUrl('longitudinal'),
    },
    {
        id: 'readiness',
        title: 'Kesiapan Lapangan Tahap 5',
        description: 'Snapshot kesiapan tiap siswa, checklist satu bulan, aksi prioritas, dan status output RM2/RM3',
        icon: <FiCheckCircle />,
        iconClass: 'iconReadiness',
        formats: ['csv', 'json'],
        buildUrl: buildResearchUrl('readiness'),
    },
    {
        id: 'full',
        title: 'Data Lengkap RM2/RM3',
        description: 'Paket lengkap lampiran tesis: sesi, klasifikasi prompt RM2, indikator RM3, dan metadata penelitian',
        icon: <FiDatabase />,
        iconClass: 'iconFull',
        formats: ['json'],
        buildUrl: (_format, filters) =>
            buildResearchExportUrl({ dataType: 'all', format: 'json', filters }),
    },
    {
        id: 'spss',
        title: 'Format SPSS',
        description: 'CSV siap SPSS untuk analisis statistik lampiran tesis RM2/RM3',
        icon: <FiFileText />,
        iconClass: 'iconSpss',
        formats: ['csv'],
        buildUrl: (_format, filters) =>
            buildResearchExportUrl({ format: 'csv', filters, spss: true }),
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
        course_id: '',
        start_date: '',
        end_date: '',
        anonymize: false,
    })

    const handleExport = async (card: ExportCard, format: ExportFormat) => {
        const key = `${card.id}-${format}`
        setDownloading(key)
        setError(null)
        setSuccess(null)

        try {
            const url = card.buildUrl(format, filters)
            const res = await apiFetch(url)

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
            setTimeout(() => setSuccess(null), 5000)
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
                        Ekspor Data
                    </h2>
                    <p className={styles.headerSub}>
                        Unduh data penelitian RM2/RM3 dan data pendukung siap lampiran tesis dalam format JSON atau CSV
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
                    <FiFilter /> Filter Ekspor Lampiran Tesis (Opsional)
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
                        <label>Course ID</label>
                        <input
                            type="text"
                            value={filters.course_id}
                            onChange={(e) => setFilters({ ...filters, course_id: e.target.value })}
                            placeholder="UUID kursus (opsional)"
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
                    <div className={`${styles.filterGroup} ${styles.checkboxGroup}`}>
                        <label className={styles.checkboxLabel}>
                            <input
                                type="checkbox"
                                checked={filters.anonymize}
                                onChange={(e) => setFilters({ ...filters, anonymize: e.target.checked })}
                            />
                            Anonimkan data siswa
                        </label>
                        <span className={styles.filterHelp}>Gunakan untuk lampiran tesis yang dibagikan di luar tim penelitian.</span>
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
