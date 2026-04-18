'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiAlertCircle, FiArrowLeft, FiCheckCircle, FiClock, FiCpu, FiGitMerge,
    FiRefreshCw, FiSearch, FiXCircle
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import styles from './page.module.scss'

type TriangulationStatusKey = 'kuat' | 'sebagian' | 'bertentangan' | 'belum_muncul' | 'unknown'
type SummaryScalar = number | string | null | undefined
type SourceValue = string | string[] | Record<string, string | number | boolean | { status?: string; excerpt?: string } | null | undefined> | null | undefined

interface TriangulationSummary {
    [key: string]: SummaryScalar
}

interface TriangulationRecord {
    id: string
    user_id?: string | null
    student_name?: string | null
    anonymous_id?: string | null
    indicator_code?: string | null
    rm_focus?: string | null
    status?: string | null
    sources?: SourceValue
    rationale?: string | null
    evidence_excerpt?: string | null
    support_count?: number | null
    contradiction_count?: number | null
    missing_reason?: string | null
    evidence_item_ids?: string[] | null
    review_status?: string | null
    auto_generated?: boolean | null
    created_at?: string | null
}

interface TriangulationResponse {
    success?: boolean
    summary?: TriangulationSummary
    records?: TriangulationRecord[]
    error?: string
    message?: string
}

interface AutoCodeResponse {
    success?: boolean
    error?: string
    message?: string
    summary?: {
        evidence_coded?: number
        triangulation_created?: number
        triangulation_updated?: number
        missing_indicator_records?: number
    }
}

const STATUS_OPTIONS = [
    { value: 'all', label: 'Semua status' },
    { value: 'kuat', label: 'Kuat' },
    { value: 'sebagian', label: 'Sebagian' },
    { value: 'bertentangan', label: 'Bertentangan' },
    { value: 'belum_muncul', label: 'Belum muncul' },
]

const FOCUS_OPTIONS = [
    { value: 'all', label: 'Semua fokus' },
    { value: 'RM2', label: 'RM2' },
    { value: 'RM3', label: 'RM3' },
]

function normalizeStatus(status: string | null | undefined): TriangulationStatusKey {
    const value = (status || '').toLowerCase()

    if (['kuat', 'strong', 'confirmed'].includes(value)) return 'kuat'
    if (['sebagian', 'partial', 'mixed'].includes(value)) return 'sebagian'
    if (['bertentangan', 'conflict', 'contradiction', 'contradictory'].includes(value)) return 'bertentangan'
    if (['belum_muncul', 'missing', 'not_found', 'none'].includes(value)) return 'belum_muncul'

    return 'unknown'
}

function getStatusMeta(status: string | null | undefined) {
    const key = normalizeStatus(status)

    if (key === 'kuat') return { label: 'Kuat', className: styles.statusStrong }
    if (key === 'sebagian') return { label: 'Sebagian', className: styles.statusPartial }
    if (key === 'bertentangan') return { label: 'Bertentangan', className: styles.statusConflict }
    if (key === 'belum_muncul') return { label: 'Belum muncul', className: styles.statusMissing }

    return { label: status || 'Belum dinilai', className: styles.statusUnknown }
}

function formatSources(sources: SourceValue): string[] {
    if (Array.isArray(sources)) {
        return sources.filter(Boolean)
    }

    if (typeof sources === 'string') {
        return sources.split(',').map(item => item.trim()).filter(Boolean)
    }

    if (sources && typeof sources === 'object') {
        return Object.entries(sources)
            .filter(([, value]) => value !== null && value !== undefined && value !== false)
            .map(([key, value]) => {
                const label = key.replace(/_/g, ' ')
                if (value === true) return label
                if (value && typeof value === 'object') {
                    return `${label}: ${value.status || 'ada'}`
                }
                return `${label}: ${value}`
            })
    }

    return []
}

function formatDate(dateValue: string | null | undefined): string {
    if (!dateValue) return '-'

    const date = new Date(dateValue)
    if (Number.isNaN(date.getTime())) return '-'

    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
}

function readSummaryNumber(summary: TriangulationSummary | null, keys: string[], fallback: number): number {
    for (const key of keys) {
        const value = summary?.[key]

        if (typeof value === 'number' && Number.isFinite(value)) return value
        if (typeof value === 'string' && value.trim()) {
            const parsed = Number(value)
            if (Number.isFinite(parsed)) return parsed
        }
    }

    return fallback
}

function normalizeFocus(value: string | null | undefined): string {
    const focus = (value || '').toUpperCase()
    if (focus.includes('RM2')) return 'RM2'
    if (focus.includes('RM3')) return 'RM3'
    return focus || '-'
}

function readInitialSearchParam(keys: string[], fallback = ''): string {
    if (typeof window === 'undefined') return fallback
    const params = new URLSearchParams(window.location.search)
    for (const key of keys) {
        const value = params.get(key)
        if (value) return value
    }
    return fallback
}

export default function ResearchTriangulationPage() {
    const router = useRouter()
    const { admin, loading: authLoading } = useAdmin()
    const [summary, setSummary] = useState<TriangulationSummary | null>(null)
    const [records, setRecords] = useState<TriangulationRecord[]>([])
    const [loading, setLoading] = useState(true)
    const [autoCoding, setAutoCoding] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [autoMessage, setAutoMessage] = useState<string | null>(null)
    const [query, setQuery] = useState(() => readInitialSearchParam(['user_id', 'q']))
    const [statusFilter, setStatusFilter] = useState(() => readInitialSearchParam(['status'], 'all'))
    const [focusFilter, setFocusFilter] = useState(() => readInitialSearchParam(['rm_focus'], 'all'))

    const fetchTriangulation = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            const res = await fetch('/api/admin/research/triangulation', {
                credentials: 'include',
                cache: 'no-store',
            })
            const data: TriangulationResponse = await res.json().catch(() => ({}))

            if (!res.ok || data.success === false) {
                throw new Error(data.error || data.message || 'Gagal memuat data triangulasi')
            }

            setSummary(data.summary || null)
            setRecords(Array.isArray(data.records) ? data.records : [])
        } catch (err) {
            console.error('Error fetching research triangulation:', err)
            setError(err instanceof Error ? err.message : 'Gagal memuat data triangulasi')
            setRecords([])
        } finally {
            setLoading(false)
        }
    }, [])

    const runAutoTriangulation = useCallback(async () => {
        try {
            setAutoCoding(true)
            setError(null)
            setAutoMessage(null)

            const res = await fetch('/api/admin/research/auto-code', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    limit: 50,
                    include_reviewed: false,
                    run_triangulation: true,
                }),
            })
            const data: AutoCodeResponse = await res.json().catch(() => ({}))

            if (!res.ok || data.success === false) {
                throw new Error(data.error || data.message || 'Gagal menjalankan auto-triangulasi')
            }

            const updated = (data.summary?.triangulation_created ?? 0) + (data.summary?.triangulation_updated ?? 0)
            const missing = data.summary?.missing_indicator_records ?? 0
            const coded = data.summary?.evidence_coded ?? 0
            setAutoMessage(`${updated} catatan triangulasi diperbarui, ${missing} indikator belum muncul ditandai, ${coded} bukti ikut dikodekan.`)
            await fetchTriangulation()
        } catch (err) {
            console.error('Error running research auto-triangulation:', err)
            setError(err instanceof Error ? err.message : 'Gagal menjalankan auto-triangulasi')
        } finally {
            setAutoCoding(false)
        }
    }, [fetchTriangulation])

    useEffect(() => {
        if (!authLoading && admin) {
            fetchTriangulation()
        }
    }, [authLoading, admin, fetchTriangulation])

    const derivedCounts = useMemo(() => {
        return records.reduce((acc, record) => {
            const status = normalizeStatus(record.status)
            acc.total += 1
            acc[status] += 1
            return acc
        }, {
            total: 0,
            kuat: 0,
            sebagian: 0,
            bertentangan: 0,
            belum_muncul: 0,
            unknown: 0,
        } as Record<TriangulationStatusKey | 'total', number>)
    }, [records])

    const displaySummary = {
        total: readSummaryNumber(summary, ['total_findings', 'total_records', 'total', 'records'], derivedCounts.total),
        kuat: readSummaryNumber(summary, ['strong', 'kuat', 'strong_records', 'strong_count', 'confirmed_records'], derivedCounts.kuat),
        sebagian: readSummaryNumber(summary, ['partial', 'sebagian', 'partial_records', 'partial_count'], derivedCounts.sebagian),
        bertentangan: readSummaryNumber(summary, ['contradictory', 'bertentangan', 'contradiction_records', 'conflict_count'], derivedCounts.bertentangan),
        belum_muncul: readSummaryNumber(summary, ['missing', 'belum_muncul', 'missing_records', 'missing_count'], derivedCounts.belum_muncul),
    }

    const filteredRecords = useMemo(() => {
        const search = query.trim().toLowerCase()

        return records.filter(record => {
            const statusKey = normalizeStatus(record.status)
            const focus = normalizeFocus(record.rm_focus)
            const sources = formatSources(record.sources)
            const statusMatch = statusFilter === 'all' || statusKey === statusFilter
            const focusMatch = focusFilter === 'all' || focus === focusFilter
            const searchable = [
                record.student_name,
                record.anonymous_id,
                record.user_id,
                record.indicator_code,
                record.rationale,
                record.evidence_excerpt,
                ...sources,
            ].filter(Boolean).join(' ').toLowerCase()

            return statusMatch && focusMatch && (!search || searchable.includes(search))
        })
    }, [focusFilter, query, records, statusFilter])

    if (authLoading) {
        return <div className={styles.loading}>Memuat...</div>
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h2>
                        <span className={styles.headerIcon}><FiGitMerge /></span>
                        Triangulasi Bukti RM2/RM3
                    </h2>
                    <p className={styles.headerSub}>
                        Matriks bukti lintas sumber untuk membaca kekuatan, konsistensi, dan celah indikator riset.
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.secondaryBtn} onClick={() => router.push('/admin/riset')}>
                        <FiArrowLeft /> Kembali
                    </button>
                    <button className={styles.secondaryBtn} onClick={runAutoTriangulation} disabled={loading || autoCoding}>
                        <FiCpu className={autoCoding ? styles.spinning : ''} /> Generate Otomatis
                    </button>
                    <button className={styles.primaryBtn} onClick={fetchTriangulation} disabled={loading}>
                        <FiRefreshCw className={loading ? styles.spinning : ''} /> Perbarui
                    </button>
                </div>
            </header>

            {error && (
                <div className={styles.errorCard}>
                    <FiAlertCircle />
                    <span>{error}</span>
                </div>
            )}

            {autoMessage && (
                <div className={styles.infoCard}>
                    <FiCheckCircle />
                    <span>{autoMessage}</span>
                </div>
            )}

            <section className={styles.summaryGrid} aria-label="Ringkasan triangulasi">
                <div className={styles.summaryCard}>
                    <span className={styles.summaryIcon}><FiGitMerge /></span>
                    <strong>{displaySummary.total}</strong>
                    <span>Total catatan</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={`${styles.summaryIcon} ${styles.iconStrong}`}><FiCheckCircle /></span>
                    <strong>{displaySummary.kuat}</strong>
                    <span>Bukti kuat</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={`${styles.summaryIcon} ${styles.iconPartial}`}><FiClock /></span>
                    <strong>{displaySummary.sebagian}</strong>
                    <span>Sebagian</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={`${styles.summaryIcon} ${styles.iconConflict}`}><FiAlertCircle /></span>
                    <strong>{displaySummary.bertentangan}</strong>
                    <span>Bertentangan</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={`${styles.summaryIcon} ${styles.iconMissing}`}><FiXCircle /></span>
                    <strong>{displaySummary.belum_muncul}</strong>
                    <span>Belum muncul</span>
                </div>
            </section>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <div>
                        <h3>Catatan Triangulasi</h3>
                        <p>{filteredRecords.length} dari {records.length} catatan ditampilkan</p>
                    </div>
                    <div className={styles.filters}>
                        <label className={styles.searchBox}>
                            <FiSearch />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Cari indikator, siswa, bukti..."
                            />
                        </label>
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                            {STATUS_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <select value={focusFilter} onChange={(event) => setFocusFilter(event.target.value)}>
                            {FOCUS_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={styles.tableWrap}>
                    {loading ? (
                        <div className={styles.loading}>Memuat data triangulasi...</div>
                    ) : filteredRecords.length === 0 ? (
                        <div className={styles.emptyState}>
                            <FiGitMerge />
                            <h3>Belum ada catatan yang sesuai</h3>
                            <p>Data triangulasi akan muncul setelah endpoint mengirimkan records.</p>
                        </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Indikator</th>
                                    <th>Siswa</th>
                                    <th>Fokus</th>
                                    <th>Status</th>
                                    <th>Alasan Status</th>
                                    <th>Sumber</th>
                                    <th>Rasional</th>
                                    <th>Cuplikan Bukti</th>
                                    <th>Tanggal</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRecords.map(record => {
                                    const statusMeta = getStatusMeta(record.status)
                                    const sources = formatSources(record.sources)
                                    const focus = normalizeFocus(record.rm_focus)

                                    return (
                                        <tr key={record.id}>
                                            <td>
                                                <span className={styles.indicatorCode}>
                                                    {record.indicator_code || '-'}
                                                </span>
                                            </td>
                                            <td>
                                                <div className={styles.studentCell}>
                                                    <strong>{record.student_name || 'Siswa tanpa nama'}</strong>
                                                    <span>{record.anonymous_id || record.user_id || '-'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`${styles.focusBadge} ${focus === 'RM2' ? styles.focusRm2 : focus === 'RM3' ? styles.focusRm3 : styles.focusUnknown}`}>
                                                    {focus}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`${styles.statusBadge} ${statusMeta.className}`}>
                                                    {statusMeta.label}
                                                </span>
                                            </td>
                                            <td>
                                                <div className={styles.reasonStack}>
                                                    <span>Support: {record.support_count ?? 0}</span>
                                                    <span>Bertentangan: {record.contradiction_count ?? 0}</span>
                                                    <span>Evidence ID: {record.evidence_item_ids?.length ?? 0}</span>
                                                    {record.missing_reason && <em>{record.missing_reason}</em>}
                                                    {record.auto_generated && <strong>Otomatis</strong>}
                                                    {record.review_status && <span>Review: {record.review_status}</span>}
                                                </div>
                                            </td>
                                            <td>
                                                {sources.length > 0 ? (
                                                    <div className={styles.sourceList}>
                                                        {sources.map((source, index) => (
                                                            <span key={`${record.id}-source-${index}`}>{source}</span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className={styles.muted}>Belum ada</span>
                                                )}
                                            </td>
                                            <td>
                                                <p className={styles.longText}>{record.rationale || '-'}</p>
                                            </td>
                                            <td>
                                                <p className={styles.excerpt}>{record.evidence_excerpt || '-'}</p>
                                            </td>
                                            <td>
                                                <span className={styles.dateText}>{formatDate(record.created_at)}</span>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>
        </div>
    )
}
