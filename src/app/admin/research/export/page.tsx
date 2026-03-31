'use client'

import React, { useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiDownload, FiArrowLeft, FiCalendar, FiTag,
    FiBarChart2, FiDatabase, FiCheckCircle, FiInfo, FiFilter
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import styles from './page.module.scss'

type ExportType = 'sessions' | 'classifications' | 'indicators' | 'spss' | 'full'
type ExportFormat = 'json' | 'csv'

interface ExportFilters {
    user_id: string
    start_date: string
    end_date: string
}

export default function ExportPage() {
    const router = useRouter()
    const { admin, loading: authLoading } = useAdmin()
    const [downloading, setDownloading] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [success, setSuccess] = useState<string | null>(null)
    const [filters, setFilters] = useState<ExportFilters>({
        user_id: '',
        start_date: '',
        end_date: ''
    })

    const handleExport = async (type: ExportType, format: ExportFormat) => {
        const key = `${type}-${format}`
        setDownloading(key)
        setError(null)
        setSuccess(null)

        try {
            // Build query params
            const params = new URLSearchParams()
            params.append('type', type)
            params.append('format', format)
            if (filters.user_id) params.append('user_id', filters.user_id)
            if (filters.start_date) params.append('start_date', filters.start_date)
            if (filters.end_date) params.append('end_date', filters.end_date)

            const res = await fetch(`/api/admin/research/export?${params.toString()}`, {
                credentials: 'include'
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Gagal mengunduh data')
            }

            // Get filename from header or generate one
            const contentDisposition = res.headers.get('Content-Disposition')
            let filename = `research_${type}_${new Date().toISOString().split('T')[0]}.${format}`
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="(.+)"/)
                if (match) filename = match[1]
            }

            // Download file
            const blob = await res.blob()
            const url = window.URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url
            a.download = filename
            document.body.appendChild(a)
            a.click()
            window.URL.revokeObjectURL(url)
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
                        Export Data Penelitian
                    </h2>
                    <p className={styles.headerSub}>
                        Unduh data penelitian dalam format JSON atau CSV untuk analisis lebih lanjut
                    </p>
                </div>
                <button
                    className={styles.backBtn}
                    onClick={() => router.push('/admin/research')}
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
                {/* Sessions Export */}
                <div className={styles.exportCard}>
                    <div className={styles.exportCardHeader}>
                        <div className={`${styles.exportIcon} ${styles.iconSessions}`}>
                            <FiCalendar />
                        </div>
                        <div className={styles.exportTitle}>Sesi Pembelajaran</div>
                    </div>
                    <p className={styles.exportDesc}>
                        Data sesi pembelajaran longitudinal termasuk informasi siswa, kursus, tanggal, durasi, dan status sesi.
                    </p>
                    <div className={styles.exportActions}>
                        <button
                            className={`${styles.downloadBtn} ${styles.btnJson}`}
                            onClick={() => handleExport('sessions', 'json')}
                            disabled={downloading !== null}
                        >
                            {downloading === 'sessions-json' ? 'Mengunduh...' : 'JSON'}
                        </button>
                        <button
                            className={`${styles.downloadBtn} ${styles.btnCsv}`}
                            onClick={() => handleExport('sessions', 'csv')}
                            disabled={downloading !== null}
                        >
                            {downloading === 'sessions-csv' ? 'Mengunduh...' : 'CSV'}
                        </button>
                    </div>
                </div>

                {/* Classifications Export */}
                <div className={styles.exportCard}>
                    <div className={styles.exportCardHeader}>
                        <div className={`${styles.exportIcon} ${styles.iconClassifications}`}>
                            <FiTag />
                        </div>
                        <div className={styles.exportTitle}>Klasifikasi Prompt</div>
                    </div>
                    <p className={styles.exportDesc}>
                        Data klasifikasi tahap prompt (SCP, SRP, MQP, Reflective), micro markers, cognitive depth level, dan rationale.
                    </p>
                    <div className={styles.exportActions}>
                        <button
                            className={`${styles.downloadBtn} ${styles.btnJson}`}
                            onClick={() => handleExport('classifications', 'json')}
                            disabled={downloading !== null}
                        >
                            {downloading === 'classifications-json' ? 'Mengunduh...' : 'JSON'}
                        </button>
                        <button
                            className={`${styles.downloadBtn} ${styles.btnCsv}`}
                            onClick={() => handleExport('classifications', 'csv')}
                            disabled={downloading !== null}
                        >
                            {downloading === 'classifications-csv' ? 'Mengunduh...' : 'CSV'}
                        </button>
                    </div>
                </div>

                {/* Indicators Export */}
                <div className={styles.exportCard}>
                    <div className={styles.exportCardHeader}>
                        <div className={`${styles.exportIcon} ${styles.iconIndicators}`}>
                            <FiBarChart2 />
                        </div>
                        <div className={styles.exportTitle}>Indikator Kognitif</div>
                    </div>
                    <p className={styles.exportDesc}>
                        Data penilaian indikator CT (decomposition, pattern recognition, dll) dan Critical Thinking (interpretation, analysis, dll).
                    </p>
                    <div className={styles.exportActions}>
                        <button
                            className={`${styles.downloadBtn} ${styles.btnJson}`}
                            onClick={() => handleExport('indicators', 'json')}
                            disabled={downloading !== null}
                        >
                            {downloading === 'indicators-json' ? 'Mengunduh...' : 'JSON'}
                        </button>
                        <button
                            className={`${styles.downloadBtn} ${styles.btnCsv}`}
                            onClick={() => handleExport('indicators', 'csv')}
                            disabled={downloading !== null}
                        >
                            {downloading === 'indicators-csv' ? 'Mengunduh...' : 'CSV'}
                        </button>
                    </div>
                </div>

                {/* Full Export */}
                <div className={styles.exportCard}>
                    <div className={styles.exportCardHeader}>
                        <div className={`${styles.exportIcon} ${styles.iconFull}`}>
                            <FiDatabase />
                        </div>
                        <div className={styles.exportTitle}>Export Lengkap</div>
                    </div>
                    <p className={styles.exportDesc}>
                        Semua data penelitian dalam satu file termasuk sesi, klasifikasi, dan indikator dengan relasi lengkap.
                    </p>
                    <div className={styles.exportActions}>
                        <button
                            className={`${styles.downloadBtn} ${styles.btnJson}`}
                            onClick={() => handleExport('full', 'json')}
                            disabled={downloading !== null}
                        >
                            {downloading === 'full-json' ? 'Mengunduh...' : 'JSON'}
                        </button>
                        <button
                            className={`${styles.downloadBtn} ${styles.btnCsv}`}
                            onClick={() => handleExport('full', 'csv')}
                            disabled={downloading !== null}
                        >
                            {downloading === 'full-csv' ? 'Mengunduh...' : 'CSV'}
                        </button>
                    </div>
                </div>
            </div>

            {/* Info Section */}
            <div className={styles.infoSection}>
                <h3 className={styles.infoTitle}>
                    <FiInfo /> Panduan Export Data
                </h3>
                <div className={styles.infoGrid}>
                    <div className={styles.infoCard}>
                        <div className={styles.infoCardTitle}>Format JSON</div>
                        <div className={styles.infoCardContent}>
                            <ul>
                                <li>Struktur data lengkap dengan nested objects</li>
                                <li>Cocok untuk analisis dengan Python/R</li>
                                <li>Preservasi tipe data (array, object)</li>
                                <li>Import ke tools seperti Jupyter Notebook</li>
                            </ul>
                        </div>
                    </div>
                    <div className={styles.infoCard}>
                        <div className={styles.infoCardTitle}>Format CSV</div>
                        <div className={styles.infoCardContent}>
                            <ul>
                                <li>Flat structure, mudah dibuka di Excel</li>
                                <li>Cocok untuk analisis statistik SPSS</li>
                                <li>Array dikonversi ke string JSON</li>
                                <li>Kompatibel dengan berbagai tools</li>
                            </ul>
                        </div>
                    </div>
                    <div className={styles.infoCard}>
                        <div className={styles.infoCardTitle}>Struktur Data RM 2</div>
                        <div className={styles.infoCardContent}>
                            <ul>
                                <li><code>prompt_stage</code>: SCP → SRP → MQP → REFLECTIVE</li>
                                <li><code>micro_markers</code>: GCP, PP, ARP</li>
                                <li><code>cognitive_depth_level</code>: 1-4</li>
                                <li><code>prompt_sequence</code>: urutan prompt</li>
                            </ul>
                        </div>
                    </div>
                    <div className={styles.infoCard}>
                        <div className={styles.infoCardTitle}>Struktur Data RM 3</div>
                        <div className={styles.infoCardContent}>
                            <ul>
                                <li><strong>CT:</strong> decomposition, pattern_recognition, abstraction, algorithm_design, evaluation_debugging, generalization</li>
                                <li><strong>Critical:</strong> interpretation, analysis, evaluation, inference, explanation, self_regulation</li>
                                <li>Skala: 0 (tidak muncul), 1 (sebagian), 2 (penuh)</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
