'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiAlertCircle, FiArchive, FiArrowLeft, FiBarChart2, FiCheckCircle, FiClock,
    FiCpu, FiDatabase, FiDownload, FiGitMerge, FiRefreshCw, FiSearch, FiUsers, FiXCircle
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import styles from './page.module.scss'

type ReadinessStatusKey = 'ready' | 'partial' | 'blocked' | 'unknown'
type FieldCheckStatus = 'ready' | 'partial' | 'blocked'
type TextList = string | string[] | null | undefined

interface ReadinessSummary {
    total_students?: number
    ready_students?: number
    partial_students?: number
    blocked_students?: number
    average_readiness?: number
    field_readiness_score?: number
    field_readiness_status?: FieldCheckStatus
}

interface FieldReadinessCheck {
    id: string
    label: string
    rm_focus: string
    status: FieldCheckStatus
    metric: string
    detail: string
    next_step: string
}

interface FieldReadinessSummary {
    status: FieldCheckStatus
    score: number
    observed_weeks: number
    target_weeks: number
    week_buckets: string[]
    collection_start?: string | null
    collection_end?: string | null
    pipeline_counts?: Record<string, number | null | undefined>
    coverage_rates?: Record<string, number | null | undefined>
    latest_auto_coding_run?: {
        id?: string
        status?: string | null
        created_at?: string | null
        completed_at?: string | null
    } | null
    checklist?: FieldReadinessCheck[]
    priority_actions?: string[]
    thesis_outputs?: FieldReadinessCheck[]
}

interface ReadinessRow {
    user_id: string
    student_name?: string | null
    anonymous_id?: string | null
    readiness_status?: string | null
    readiness_score?: number | null
    blockers?: TextList
    next_steps?: TextList
    evidence_counts?: Record<string, number | string | null | undefined> | null
    rm2_complete?: boolean | null
    rm3_complete?: boolean | null
}

interface ReadinessResponse {
    success?: boolean
    summary?: ReadinessSummary
    field_readiness?: FieldReadinessSummary
    rows?: ReadinessRow[]
    error?: string
    message?: string
}

interface AutoCodeResponse {
    success?: boolean
    error?: string
    message?: string
    summary?: {
        evidence_coded?: number
        evidence_needs_review?: number
        triangulation_created?: number
        triangulation_updated?: number
        missing_indicator_records?: number
    }
}

interface ReconcileResponse {
    success?: boolean
    dry_run?: boolean
    candidates?: number
    updated_evidence?: number
    updated_sources?: number
    linked_sessions?: number
    skipped?: number
    message?: string
    error?: string
}

const STATUS_OPTIONS = [
    { value: 'all', label: 'Semua status' },
    { value: 'ready', label: 'Siap' },
    { value: 'partial', label: 'Parsial' },
    { value: 'blocked', label: 'Terhambat' },
]

function normalizeStatus(status: string | null | undefined): ReadinessStatusKey {
    const value = (status || '').toLowerCase()

    if (['ready', 'siap', 'siap_tesis', 'complete', 'lengkap'].includes(value)) return 'ready'
    if (['partial', 'parsial', 'sebagian', 'in_progress'].includes(value)) return 'partial'
    if (['blocked', 'terhambat', 'kurang', 'missing', 'perlu_data'].includes(value)) return 'blocked'

    return 'unknown'
}

function getStatusMeta(status: string | null | undefined) {
    const key = normalizeStatus(status)

    if (key === 'ready') {
        return { label: 'Siap', className: styles.statusReady }
    }

    if (key === 'partial') {
        return { label: 'Parsial', className: styles.statusPartial }
    }

    if (key === 'blocked') {
        return { label: 'Terhambat', className: styles.statusBlocked }
    }

    return { label: status || 'Belum dinilai', className: styles.statusUnknown }
}

function getFieldStatusMeta(status: FieldCheckStatus | string | null | undefined) {
    if (status === 'ready') return { label: 'Siap', className: styles.statusReady }
    if (status === 'partial') return { label: 'Parsial', className: styles.statusPartial }
    if (status === 'blocked') return { label: 'Terhambat', className: styles.statusBlocked }
    return { label: 'Belum dinilai', className: styles.statusUnknown }
}

function toList(value: TextList): string[] {
    if (Array.isArray(value)) return value.filter(Boolean)
    if (typeof value === 'string' && value.trim()) {
        return value.split('\n').map(item => item.trim()).filter(Boolean)
    }
    return []
}

function formatEvidenceKey(key: string): string {
    return key
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase())
}

function formatDate(value: string | null | undefined): string {
    if (!value) return '-'
    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'
    return date.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    })
}

function safeNumber(value: number | null | undefined): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

export default function ResearchReadinessPage() {
    const router = useRouter()
    const { admin, loading: authLoading } = useAdmin()
    const [summary, setSummary] = useState<ReadinessSummary | null>(null)
    const [fieldReadiness, setFieldReadiness] = useState<FieldReadinessSummary | null>(null)
    const [rows, setRows] = useState<ReadinessRow[]>([])
    const [loading, setLoading] = useState(true)
    const [busyAction, setBusyAction] = useState<string | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [actionMessage, setActionMessage] = useState<string | null>(null)
    const [query, setQuery] = useState('')
    const [statusFilter, setStatusFilter] = useState('all')

    const fetchReadiness = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            const res = await fetch('/api/admin/research/readiness', {
                credentials: 'include',
                cache: 'no-store',
            })
            const data: ReadinessResponse = await res.json().catch(() => ({}))

            if (!res.ok || data.success === false) {
                throw new Error(data.error || data.message || 'Gagal memuat data kesiapan')
            }

            setSummary(data.summary || null)
            setFieldReadiness(data.field_readiness || null)
            setRows(Array.isArray(data.rows) ? data.rows : [])
        } catch (err) {
            console.error('Error fetching research readiness:', err)
            setError(err instanceof Error ? err.message : 'Gagal memuat data kesiapan')
            setRows([])
            setFieldReadiness(null)
        } finally {
            setLoading(false)
        }
    }, [])

    const runReconciliation = useCallback(async (dryRun: boolean) => {
        try {
            setBusyAction(dryRun ? 'reconcile-dry-run' : 'reconcile-apply')
            setError(null)
            setActionMessage(null)

            const res = await fetch('/api/admin/research/reconcile', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ dry_run: dryRun, limit: 500 }),
            })
            const data: ReconcileResponse = await res.json().catch(() => ({}))

            if (!res.ok || data.success === false) {
                throw new Error(data.error || data.message || 'Rekonsiliasi gagal')
            }

            setActionMessage(data.message || (
                dryRun
                    ? `${data.candidates ?? 0} bukti perlu rekonsiliasi.`
                    : `${data.updated_evidence ?? 0} bukti direkonsiliasi, ${data.linked_sessions ?? 0} sesi tertaut.`
            ))
            if (!dryRun) await fetchReadiness()
        } catch (err) {
            console.error('Error running research reconciliation:', err)
            setError(err instanceof Error ? err.message : 'Rekonsiliasi gagal')
        } finally {
            setBusyAction(null)
        }
    }, [fetchReadiness])

    const runAutoCoding = useCallback(async (userId?: string) => {
        try {
            const actionKey = userId ? `auto-${userId}` : 'auto-all'
            setBusyAction(actionKey)
            setError(null)
            setActionMessage(null)

            const res = await fetch('/api/admin/research/auto-code', {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    user_id: userId,
                    limit: userId ? 40 : 120,
                    include_reviewed: false,
                    run_triangulation: true,
                }),
            })
            const data: AutoCodeResponse = await res.json().catch(() => ({}))

            if (!res.ok || data.success === false) {
                throw new Error(data.error || data.message || 'Auto-coding gagal')
            }

            const coded = data.summary?.evidence_coded ?? 0
            const review = data.summary?.evidence_needs_review ?? 0
            const triangulation = (data.summary?.triangulation_created ?? 0) + (data.summary?.triangulation_updated ?? 0)
            const missing = data.summary?.missing_indicator_records ?? 0
            setActionMessage(`${coded} bukti dikodekan, ${review} perlu telaah, ${triangulation} triangulasi diperbarui, ${missing} indikator belum muncul.`)
            await fetchReadiness()
        } catch (err) {
            console.error('Error running auto-coding from readiness:', err)
            setError(err instanceof Error ? err.message : 'Auto-coding gagal')
        } finally {
            setBusyAction(null)
        }
    }, [fetchReadiness])

    const exportStudent = useCallback((userId: string) => {
        const params = new URLSearchParams({
            data_type: 'all',
            format: 'json',
            user_id: userId,
            anonymize: 'true',
        })
        window.open(`/api/admin/research/export?${params.toString()}`, '_blank', 'noopener,noreferrer')
    }, [])

    useEffect(() => {
        if (!authLoading && admin) {
            fetchReadiness()
        }
    }, [authLoading, admin, fetchReadiness])

    const derivedSummary = useMemo<Required<ReadinessSummary>>(() => {
        const ready = rows.filter(row => normalizeStatus(row.readiness_status) === 'ready').length
        const partial = rows.filter(row => normalizeStatus(row.readiness_status) === 'partial').length
        const blocked = rows.filter(row => normalizeStatus(row.readiness_status) === 'blocked').length
        const totalScore = rows.reduce((sum, row) => sum + safeNumber(row.readiness_score), 0)

        return {
            total_students: rows.length,
            ready_students: ready,
            partial_students: partial,
            blocked_students: blocked,
            average_readiness: rows.length > 0 ? Math.round(totalScore / rows.length) : 0,
            field_readiness_score: fieldReadiness?.score ?? 0,
            field_readiness_status: fieldReadiness?.status ?? 'blocked',
        }
    }, [fieldReadiness, rows])

    const displaySummary = {
        total_students: summary?.total_students ?? derivedSummary.total_students,
        ready_students: summary?.ready_students ?? derivedSummary.ready_students,
        partial_students: summary?.partial_students ?? derivedSummary.partial_students,
        blocked_students: summary?.blocked_students ?? derivedSummary.blocked_students,
        average_readiness: summary?.average_readiness ?? derivedSummary.average_readiness,
        field_readiness_score: summary?.field_readiness_score ?? derivedSummary.field_readiness_score,
        field_readiness_status: summary?.field_readiness_status ?? derivedSummary.field_readiness_status,
    }

    const filteredRows = useMemo(() => {
        const search = query.trim().toLowerCase()

        return rows.filter(row => {
            const statusKey = normalizeStatus(row.readiness_status)
            const statusMatch = statusFilter === 'all' || statusKey === statusFilter
            const searchable = [
                row.student_name,
                row.anonymous_id,
                row.user_id,
                ...toList(row.blockers),
                ...toList(row.next_steps),
            ].filter(Boolean).join(' ').toLowerCase()

            return statusMatch && (!search || searchable.includes(search))
        })
    }, [query, rows, statusFilter])

    if (authLoading) {
        return <div className={styles.loading}>Memuat...</div>
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h2>
                        <span className={styles.headerIcon}><FiCheckCircle /></span>
                        Kesiapan Analisis RM2/RM3
                    </h2>
                    <p className={styles.headerSub}>
                        Ringkasan kesiapan bukti tiap siswa sebelum analisis tesis dilanjutkan.
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.secondaryBtn} onClick={() => router.push('/admin/riset')}>
                        <FiArrowLeft /> Kembali
                    </button>
                    <button className={styles.secondaryBtn} onClick={() => runReconciliation(true)} disabled={loading || busyAction !== null}>
                        <FiDatabase className={busyAction === 'reconcile-dry-run' ? styles.spinning : ''} /> Cek Rekonsiliasi
                    </button>
                    <button className={styles.secondaryBtn} onClick={() => runReconciliation(false)} disabled={loading || busyAction !== null}>
                        <FiGitMerge className={busyAction === 'reconcile-apply' ? styles.spinning : ''} /> Terapkan Link Sesi
                    </button>
                    <button className={styles.secondaryBtn} onClick={() => runAutoCoding()} disabled={loading || busyAction !== null}>
                        <FiCpu className={busyAction === 'auto-all' ? styles.spinning : ''} /> Auto-Code Semua
                    </button>
                    <button className={styles.primaryBtn} onClick={fetchReadiness} disabled={loading}>
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

            {actionMessage && (
                <div className={styles.infoCard}>
                    <FiCheckCircle />
                    <span>{actionMessage}</span>
                </div>
            )}

            <section className={styles.summaryGrid} aria-label="Ringkasan kesiapan riset">
                <div className={styles.summaryCard}>
                    <span className={styles.summaryIcon}><FiUsers /></span>
                    <strong>{displaySummary.total_students}</strong>
                    <span>Total siswa</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={`${styles.summaryIcon} ${styles.iconReady}`}><FiCheckCircle /></span>
                    <strong>{displaySummary.ready_students}</strong>
                    <span>Siap dianalisis</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={`${styles.summaryIcon} ${styles.iconPartial}`}><FiClock /></span>
                    <strong>{displaySummary.partial_students}</strong>
                    <span>Parsial</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={`${styles.summaryIcon} ${styles.iconBlocked}`}><FiXCircle /></span>
                    <strong>{displaySummary.blocked_students}</strong>
                    <span>Terhambat</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={styles.summaryIcon}><FiBarChart2 /></span>
                    <strong>{Math.round(displaySummary.average_readiness)}%</strong>
                    <span>Rata-rata kesiapan</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={`${styles.summaryIcon} ${styles.iconField}`}><FiDatabase /></span>
                    <strong>{Math.round(displaySummary.field_readiness_score || 0)}%</strong>
                    <span>Kesiapan lapangan</span>
                </div>
            </section>

            {fieldReadiness && (
                <section className={styles.fieldSection} aria-label="Checklist kesiapan lapangan">
                    <div className={styles.fieldHeader}>
                        <div>
                            <h3>Checklist Siap Lapangan Tahap 5</h3>
                            <p>
                                {fieldReadiness.observed_weeks}/{fieldReadiness.target_weeks} minggu teramati.
                                {fieldReadiness.collection_start && fieldReadiness.collection_end
                                    ? ` Rentang data ${formatDate(fieldReadiness.collection_start)} sampai ${formatDate(fieldReadiness.collection_end)}.`
                                    : ' Rentang data akan muncul setelah evidence historis tersambung.'}
                            </p>
                        </div>
                        <span className={`${styles.statusBadge} ${getFieldStatusMeta(fieldReadiness.status).className}`}>
                            {getFieldStatusMeta(fieldReadiness.status).label}
                        </span>
                    </div>

                    <div className={styles.pipelineGrid}>
                        {[
                            ['Raw prompt', fieldReadiness.pipeline_counts?.raw_prompt_logs ?? 0],
                            ['Sesi belajar', fieldReadiness.pipeline_counts?.learning_sessions ?? 0],
                            ['Evidence', fieldReadiness.pipeline_counts?.evidence_items ?? 0],
                            ['Bukti berkode', fieldReadiness.pipeline_counts?.coded_evidence ?? 0],
                            ['Triangulasi', fieldReadiness.pipeline_counts?.triangulation_records ?? 0],
                            ['Artefak', fieldReadiness.pipeline_counts?.artifacts ?? 0],
                        ].map(([label, value]) => (
                            <div key={String(label)} className={styles.pipelineCard}>
                                <strong>{value}</strong>
                                <span>{label}</span>
                            </div>
                        ))}
                    </div>

                    <div className={styles.checkGrid}>
                        <div className={styles.checkPanel}>
                            <h4>Kontrol Kesiapan</h4>
                            <div className={styles.checkList}>
                                {(fieldReadiness.checklist || []).map(item => {
                                    const meta = getFieldStatusMeta(item.status)
                                    return (
                                        <div key={item.id} className={styles.checkItem}>
                                            <div>
                                                <strong>{item.label}</strong>
                                                <p>{item.detail}</p>
                                                <span>{item.metric}</span>
                                            </div>
                                            <span className={`${styles.statusBadge} ${meta.className}`}>{meta.label}</span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        <div className={styles.checkPanel}>
                            <h4>Output Tesis</h4>
                            <div className={styles.checkList}>
                                {(fieldReadiness.thesis_outputs || []).map(item => {
                                    const meta = getFieldStatusMeta(item.status)
                                    return (
                                        <div key={item.id} className={styles.checkItem}>
                                            <div>
                                                <strong>{item.label}</strong>
                                                <p>{item.detail}</p>
                                                <span>{item.metric}</span>
                                            </div>
                                            <span className={`${styles.statusBadge} ${meta.className}`}>{meta.label}</span>
                                        </div>
                                    )
                                })}
                            </div>

                            <div className={styles.priorityBox}>
                                <h4>Aksi Prioritas</h4>
                                {(fieldReadiness.priority_actions || []).length > 0 ? (
                                    <ul className={styles.compactList}>
                                        {(fieldReadiness.priority_actions || []).map((item, index) => (
                                            <li key={`priority-${index}`}>{item}</li>
                                        ))}
                                    </ul>
                                ) : (
                                    <p>Data utama sudah siap dibaca dan diekspor sebagai bahan tesis.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <div>
                        <h3>Daftar Kesiapan Siswa</h3>
                        <p>{filteredRows.length} dari {rows.length} siswa ditampilkan</p>
                    </div>
                    <div className={styles.filters}>
                        <label className={styles.searchBox}>
                            <FiSearch />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Cari siswa, ID, hambatan..."
                            />
                        </label>
                        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                            {STATUS_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={styles.tableWrap}>
                    {loading ? (
                        <div className={styles.loading}>Memuat data kesiapan...</div>
                    ) : filteredRows.length === 0 ? (
                        <div className={styles.emptyState}>
                            <FiCheckCircle />
                            <h3>Belum ada data yang sesuai</h3>
                            <p>Data akan muncul setelah endpoint readiness mengembalikan baris siswa.</p>
                        </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Siswa</th>
                                    <th>Status</th>
                                    <th>Skor</th>
                                    <th>Bukti</th>
                                    <th>RM</th>
                                    <th>Hambatan</th>
                                    <th>Langkah Berikutnya</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map(row => {
                                    const statusMeta = getStatusMeta(row.readiness_status)
                                    const blockers = toList(row.blockers)
                                    const nextSteps = toList(row.next_steps)
                                    const evidenceEntries = Object.entries(row.evidence_counts || {})
                                        .filter(([, value]) => value !== null && value !== undefined && value !== '')

                                    return (
                                        <tr key={row.user_id}>
                                            <td>
                                                <div className={styles.studentCell}>
                                                    <strong>{row.student_name || 'Siswa tanpa nama'}</strong>
                                                    <span>{row.anonymous_id || row.user_id}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`${styles.statusBadge} ${statusMeta.className}`}>
                                                    {statusMeta.label}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={styles.scoreBadge}>
                                                    {safeNumber(row.readiness_score)}%
                                                </span>
                                            </td>
                                            <td>
                                                {evidenceEntries.length > 0 ? (
                                                    <div className={styles.evidenceList}>
                                                        {evidenceEntries.map(([key, value]) => (
                                                            <span key={key}>{formatEvidenceKey(key)}: {value}</span>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <span className={styles.muted}>Belum ada</span>
                                                )}
                                            </td>
                                            <td>
                                                <div className={styles.rmBadges}>
                                                    <span className={row.rm2_complete ? styles.rmComplete : styles.rmMissing}>RM2</span>
                                                    <span className={row.rm3_complete ? styles.rmComplete : styles.rmMissing}>RM3</span>
                                                </div>
                                            </td>
                                            <td>
                                                {blockers.length > 0 ? (
                                                    <ul className={styles.compactList}>
                                                        {blockers.map((item, index) => <li key={`${row.user_id}-blocker-${index}`}>{item}</li>)}
                                                    </ul>
                                                ) : (
                                                    <span className={styles.muted}>Tidak ada</span>
                                                )}
                                            </td>
                                            <td>
                                                {nextSteps.length > 0 ? (
                                                    <ul className={styles.compactList}>
                                                        {nextSteps.map((item, index) => <li key={`${row.user_id}-step-${index}`}>{item}</li>)}
                                                    </ul>
                                                ) : (
                                                    <span className={styles.muted}>-</span>
                                                )}
                                            </td>
                                            <td>
                                                <div className={styles.rowActions}>
                                                    <button onClick={() => router.push(`/admin/riset/bukti?user_id=${row.user_id}`)}>
                                                        <FiArchive /> Bukti
                                                    </button>
                                                    <button onClick={() => router.push(`/admin/riset/triangulasi?user_id=${row.user_id}`)}>
                                                        <FiGitMerge /> Triangulasi
                                                    </button>
                                                    <button onClick={() => runAutoCoding(row.user_id)} disabled={busyAction !== null}>
                                                        <FiCpu className={busyAction === `auto-${row.user_id}` ? styles.spinning : ''} /> Auto-code
                                                    </button>
                                                    <button onClick={() => exportStudent(row.user_id)}>
                                                        <FiDownload /> Export
                                                    </button>
                                                </div>
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
