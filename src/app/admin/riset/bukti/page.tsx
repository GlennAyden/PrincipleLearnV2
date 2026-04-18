'use client'

import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiAlertCircle, FiArchive, FiArrowLeft, FiCheckCircle,
    FiClock, FiCpu, FiFileText, FiRefreshCw, FiSearch, FiUsers
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import { useDebouncedValue } from '@/hooks/useDebouncedValue'
import { apiFetch } from '@/lib/api-client'
import styles from './page.module.scss'

type EvidenceSummary = Record<string, unknown>
type EvidenceApiRecord = Record<string, unknown>

interface EvidenceRow {
    id: string
    studentName: string | null
    anonymousId: string | null
    userId: string | null
    sourceType: string
    rmFocus: string
    promptStage: string | null
    indicatorCode: string | null
    codingStatus: string
    researchValidityStatus: string
    learningSessionId: string | null
    sessionNumber: number | null
    evidenceText: string | null
    aiResponse: string | null
    artifactSummary: string | null
    createdAt: string | null
    raw: EvidenceApiRecord
}

interface EvidenceResponse {
    success?: boolean
    error?: string
    message?: string
    summary?: EvidenceSummary
    total?: number
    offset?: number
    limit?: number
    rows?: EvidenceApiRecord[]
    records?: EvidenceApiRecord[]
    items?: EvidenceApiRecord[]
    data?: {
        summary?: EvidenceSummary
        rows?: EvidenceApiRecord[]
        records?: EvidenceApiRecord[]
        items?: EvidenceApiRecord[]
    } | EvidenceApiRecord[]
}

const EVIDENCE_PAGE_SIZE = 250
const MAX_EVIDENCE_PAGES = 20
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

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

const RM_OPTIONS = [
    { value: 'all', label: 'Semua fokus' },
    { value: 'RM2', label: 'RM2' },
    { value: 'RM3', label: 'RM3' },
    { value: 'RM2_RM3', label: 'RM2/RM3' },
]

const CODING_OPTIONS = [
    { value: 'all', label: 'Semua coding' },
    { value: 'uncoded', label: 'Belum dikodekan' },
    { value: 'auto_coded', label: 'Auto-coded' },
    { value: 'manual_coded', label: 'Manual-coded' },
    { value: 'reviewed', label: 'Sudah ditinjau' },
]

function pickString(...values: unknown[]): string | null {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) return value.trim()
    }
    return null
}

function pickNumber(...values: unknown[]): number | null {
    for (const value of values) {
        if (typeof value === 'number' && Number.isFinite(value)) return value
        if (typeof value === 'string' && value.trim()) {
            const parsed = Number(value)
            if (Number.isFinite(parsed)) return parsed
        }
    }
    return null
}

function pickBoolean(...values: unknown[]): boolean | null {
    for (const value of values) {
        if (typeof value === 'boolean') return value
        if (typeof value === 'string') {
            if (value.toLowerCase() === 'true') return true
            if (value.toLowerCase() === 'false') return false
        }
    }
    return null
}

function humanizeToken(value: string | null | undefined): string {
    if (!value) return '-'

    return value
        .replace(/_/g, ' ')
        .replace(/\b\w/g, char => char.toUpperCase())
}

function normalizeRmFocus(value: string | null | undefined): string {
    const raw = (value || '').toUpperCase().replace(/\s+/g, '_')

    if (raw.includes('RM2') && raw.includes('RM3')) return 'RM2_RM3'
    if (raw.includes('RM2')) return 'RM2'
    if (raw.includes('RM3')) return 'RM3'

    return raw || '-'
}

function normalizePromptStage(value: string | null | undefined): string | null {
    const raw = (value || '').trim().toUpperCase()

    if (!raw) return null
    if (raw === 'REFLEKTIF') return 'REFLECTIVE'

    return raw
}

function normalizeCodingStatus(value: string | null | undefined): string {
    const raw = (value || '').trim().toLowerCase()

    if (!raw) return 'uncoded'
    if (['uncoded', 'not_coded', 'pending'].includes(raw)) return 'uncoded'
    if (['auto', 'auto_coded', 'automatic'].includes(raw)) return 'auto_coded'
    if (['manual', 'manual_coded'].includes(raw)) return 'manual_coded'
    if (['reviewed', 'validated', 'approved'].includes(raw)) return 'reviewed'

    return raw
}

function normalizeValidityStatus(value: string | null | undefined, isValidForAnalysis: boolean | null): string {
    const raw = (value || '').trim().toLowerCase()

    if (!raw) {
        if (isValidForAnalysis === true) return 'valid'
        if (isValidForAnalysis === false) return 'needs_review'
        return 'unknown'
    }

    if (['valid', 'ready', 'usable'].includes(raw)) return 'valid'
    if (['needs_review', 'review', 'partial', 'low_information'].includes(raw)) return 'needs_review'
    if (['invalid', 'excluded', 'invalid_for_analysis', 'contradictory'].includes(raw)) return 'invalid'

    return raw
}

function truncateText(value: string | null | undefined, maxLength = 180): string {
    if (!value) return '-'
    if (value.length <= maxLength) return value
    return `${value.slice(0, maxLength - 1).trimEnd()}...`
}

function shortenId(value: string | null | undefined): string {
    if (!value) return '-'
    if (value.length <= 18) return value
    return `${value.slice(0, 8)}...${value.slice(-6)}`
}

function formatDateTime(value: string | null | undefined): string {
    if (!value) return '-'

    const date = new Date(value)
    if (Number.isNaN(date.getTime())) return '-'

    return date.toLocaleString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    })
}

function readNestedRecord(value: unknown): EvidenceApiRecord | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as EvidenceApiRecord
        : null
}

function extractRows(payload: EvidenceResponse): EvidenceApiRecord[] {
    if (Array.isArray(payload.rows)) return payload.rows
    if (Array.isArray(payload.records)) return payload.records
    if (Array.isArray(payload.items)) return payload.items

    if (Array.isArray(payload.data)) return payload.data

    const nested = readNestedRecord(payload.data)
    if (nested) {
        if (Array.isArray(nested.rows)) return nested.rows as EvidenceApiRecord[]
        if (Array.isArray(nested.records)) return nested.records as EvidenceApiRecord[]
        if (Array.isArray(nested.items)) return nested.items as EvidenceApiRecord[]
    }

    return []
}

function extractSummary(payload: EvidenceResponse): EvidenceSummary | null {
    if (payload.summary && typeof payload.summary === 'object') return payload.summary

    const nested = readNestedRecord(payload.data)
    if (nested?.summary && typeof nested.summary === 'object') {
        return nested.summary as EvidenceSummary
    }

    return null
}

function normalizeRow(raw: EvidenceApiRecord, index: number): EvidenceRow {
    const nestedUser = readNestedRecord(raw.user)
    const nestedStudent = readNestedRecord(raw.student)
    const nestedSession = readNestedRecord(raw.learning_session) || readNestedRecord(raw.session)

    const isValidForAnalysis = pickBoolean(
        raw.is_valid_for_analysis,
        nestedSession?.is_valid_for_analysis,
    )

    return {
        id: pickString(raw.id, raw.evidence_id, raw.source_id) || `evidence-${index}`,
        studentName: pickString(
            raw.student_name,
            raw.user_name,
            nestedUser?.name,
            nestedStudent?.name,
        ),
        anonymousId: pickString(
            raw.anonymous_id,
            raw.anon_label,
            nestedUser?.anonymous_id,
            nestedStudent?.anonymous_id,
        ),
        userId: pickString(raw.user_id, nestedUser?.id, nestedStudent?.id),
        sourceType: (pickString(
            raw.source_type,
            raw.prompt_source,
            raw.evidence_source,
            raw.source,
        ) || 'unknown').toLowerCase(),
        rmFocus: normalizeRmFocus(pickString(raw.rm_focus, raw.focus, raw.research_focus)),
        promptStage: normalizePromptStage(pickString(raw.prompt_stage, raw.stage)),
        indicatorCode: pickString(raw.indicator_code, raw.indicator, raw.indicator_label),
        codingStatus: normalizeCodingStatus(pickString(raw.coding_status, raw.code_status, raw.status_coding)),
        researchValidityStatus: normalizeValidityStatus(
            pickString(raw.research_validity_status, raw.validity_status, raw.analysis_validity),
            isValidForAnalysis,
        ),
        learningSessionId: pickString(raw.learning_session_id, nestedSession?.id, raw.session_id),
        sessionNumber: pickNumber(raw.session_number, nestedSession?.session_number),
        evidenceText: pickString(
            raw.evidence_text,
            raw.unit_text,
            raw.prompt_text,
            raw.question,
            raw.text,
            raw.raw_text,
            raw.excerpt,
        ),
        aiResponse: pickString(
            raw.ai_response,
            raw.ai_response_text,
            raw.answer,
            raw.response_text,
            raw.ai_text,
            raw.solution_text,
        ),
        artifactSummary: pickString(
            raw.artifact_summary,
            raw.artifact_content,
            raw.artifact_text,
            raw.file_name,
            raw.artifact_name,
        ),
        createdAt: pickString(raw.created_at, raw.timestamp, raw.logged_at),
        raw,
    }
}

function getCodingMeta(status: string) {
    if (status === 'reviewed') return { label: 'Ditinjau', className: styles.statusReviewed }
    if (status === 'manual_coded') return { label: 'Manual', className: styles.statusManual }
    if (status === 'auto_coded') return { label: 'Otomatis', className: styles.statusAuto }
    if (status === 'uncoded') return { label: 'Belum', className: styles.statusPending }

    return { label: humanizeToken(status), className: styles.statusUnknown }
}

function getValidityMeta(status: string) {
    if (status === 'valid') return { label: 'Valid', className: styles.validityValid }
    if (status === 'needs_review') return { label: 'Perlu telaah', className: styles.validityReview }
    if (status === 'invalid') return { label: 'Tidak valid', className: styles.validityInvalid }

    return { label: humanizeToken(status), className: styles.statusUnknown }
}

function getFocusMeta(focus: string) {
    if (focus === 'RM2') return { label: 'RM2', className: styles.focusRm2 }
    if (focus === 'RM3') return { label: 'RM3', className: styles.focusRm3 }
    if (focus === 'RM2_RM3') return { label: 'RM2/RM3', className: styles.focusCombined }

    return { label: focus || '-', className: styles.focusUnknown }
}

function buildSourceOptions(rows: EvidenceRow[]) {
    const options = Array.from(new Set(rows.map(row => row.sourceType).filter(Boolean))).sort()

    return [
        { value: 'all', label: 'Semua sumber' },
        ...options.map(option => ({
            value: option,
            label: humanizeToken(option),
        })),
    ]
}

function rowSearchText(row: EvidenceRow): string {
    return [
        row.studentName,
        row.anonymousId,
        row.userId,
        row.sourceType,
        row.rmFocus,
        row.promptStage,
        row.indicatorCode,
        row.evidenceText,
        row.aiResponse,
        row.artifactSummary,
        row.learningSessionId,
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
}

function readSummaryNumber(summary: EvidenceSummary | null, keys: string[], fallback: number): number {
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

function readInitialSearchParam(keys: string[], fallback = ''): string {
    if (typeof window === 'undefined') return fallback
    const params = new URLSearchParams(window.location.search)
    for (const key of keys) {
        const value = params.get(key)
        if (value) return value
    }
    return fallback
}

export default function ResearchEvidencePage() {
    const router = useRouter()
    const { admin, loading: authLoading } = useAdmin()
    const [rows, setRows] = useState<EvidenceRow[]>([])
    const [summary, setSummary] = useState<EvidenceSummary | null>(null)
    const [loading, setLoading] = useState(true)
    const [autoCoding, setAutoCoding] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [autoMessage, setAutoMessage] = useState<string | null>(null)
    const [selectedRow, setSelectedRow] = useState<EvidenceRow | null>(null)
    const [query, setQuery] = useState(() => readInitialSearchParam(['user_id', 'q']))
    const [sourceFilter, setSourceFilter] = useState(() => readInitialSearchParam(['source_type'], 'all'))
    const [rmFilter, setRmFilter] = useState(() => readInitialSearchParam(['rm_focus'], 'all'))
    const [codingFilter, setCodingFilter] = useState(() => readInitialSearchParam(['coding_status'], 'all'))
    const debouncedQuery = useDebouncedValue(query, 350)

    const fetchEvidence = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            const allRows: EvidenceApiRecord[] = []
            let firstSummary: EvidenceSummary | null = null
            let reportedTotal: number | null = null

            for (let page = 0; page < MAX_EVIDENCE_PAGES; page += 1) {
                const params = new URLSearchParams({
                    limit: String(EVIDENCE_PAGE_SIZE),
                    offset: String(page * EVIDENCE_PAGE_SIZE),
                })
                const search = debouncedQuery.trim()
                if (UUID_PATTERN.test(search)) {
                    params.set('user_id', search)
                } else if (search) {
                    params.set('search', search)
                }
                if (sourceFilter !== 'all') params.set('source_type', sourceFilter)
                if (rmFilter !== 'all') params.set('rm_focus', rmFilter)
                if (codingFilter !== 'all') params.set('coding_status', codingFilter)

                const res = await fetch(`/api/admin/research/evidence?${params.toString()}`, {
                    credentials: 'include',
                    cache: 'no-store',
                })
                const data: EvidenceResponse = await res.json().catch(() => ({}))

                if (!res.ok || data.success === false) {
                    if (res.status === 404) {
                        throw new Error('Endpoint Evidence Bank belum tersedia. Halaman ini tetap siap dipakai dan akan terisi otomatis saat API evidence diaktifkan.')
                    }

                    throw new Error(data.error || data.message || 'Gagal memuat data evidence')
                }

                if (!firstSummary) firstSummary = extractSummary(data)
                if (typeof data.total === 'number') reportedTotal = data.total

                const pageRows = extractRows(data)
                allRows.push(...pageRows)

                if (pageRows.length < EVIDENCE_PAGE_SIZE) break
                if (reportedTotal !== null && allRows.length >= reportedTotal) break
            }

            setRows(allRows.map((row, index) => normalizeRow(row, index)))
            setSummary(firstSummary)
        } catch (err) {
            console.error('Error fetching research evidence:', err)
            setError(err instanceof Error ? err.message : 'Gagal memuat data evidence')
            setRows([])
            setSummary(null)
        } finally {
            setLoading(false)
        }
    }, [codingFilter, debouncedQuery, rmFilter, sourceFilter])

    const runAutoCoding = useCallback(async () => {
        try {
            setAutoCoding(true)
            setError(null)
            setAutoMessage(null)

            const res = await apiFetch('/api/admin/research/auto-code', {
                method: 'POST',
                body: JSON.stringify({
                    limit: 30,
                    include_reviewed: false,
                    run_triangulation: true,
                }),
            })
            const data: AutoCodeResponse = await res.json().catch(() => ({}))

            if (!res.ok || data.success === false) {
                throw new Error(data.error || data.message || 'Gagal menjalankan auto-coding')
            }

            const coded = data.summary?.evidence_coded ?? 0
            const needsReview = data.summary?.evidence_needs_review ?? 0
            const triangulated = (data.summary?.triangulation_created ?? 0) + (data.summary?.triangulation_updated ?? 0)
            const missing = data.summary?.missing_indicator_records ?? 0
            setAutoMessage(`${coded} bukti dikodekan, ${needsReview} perlu telaah, ${triangulated} catatan triangulasi diperbarui, ${missing} indikator belum muncul.`)
            await fetchEvidence()
        } catch (err) {
            console.error('Error running research auto-coder:', err)
            setError(err instanceof Error ? err.message : 'Gagal menjalankan auto-coding')
        } finally {
            setAutoCoding(false)
        }
    }, [fetchEvidence])

    useEffect(() => {
        if (!authLoading && admin) {
            fetchEvidence()
        }
    }, [admin, authLoading, fetchEvidence])

    const sourceOptions = useMemo(() => buildSourceOptions(rows), [rows])

    const filteredRows = useMemo(() => {
        const search = debouncedQuery.trim().toLowerCase()

        return rows.filter(row => {
            const matchesSearch = !search || rowSearchText(row).includes(search)
            const matchesSource = sourceFilter === 'all' || row.sourceType === sourceFilter
            const matchesRm = rmFilter === 'all' || row.rmFocus === rmFilter
            const matchesCoding = codingFilter === 'all' || row.codingStatus === codingFilter

            return matchesSearch && matchesSource && matchesRm && matchesCoding
        })
    }, [codingFilter, debouncedQuery, rmFilter, rows, sourceFilter])

    const derivedSummary = useMemo(() => {
        const studentKeys = new Set(
            rows.map(row => row.userId || row.studentName || row.anonymousId).filter(Boolean),
        )

        return {
            totalEvidence: rows.length,
            totalStudents: studentKeys.size,
            codedEvidence: rows.filter(row => row.codingStatus !== 'uncoded').length,
            validEvidence: rows.filter(row => row.researchValidityStatus === 'valid').length,
            linkedSessions: rows.filter(row => row.learningSessionId || row.sessionNumber !== null).length,
        }
    }, [rows])

    const displaySummary = {
        totalEvidence: readSummaryNumber(summary, ['total_evidence', 'total_records', 'total_items', 'total'], derivedSummary.totalEvidence),
        totalStudents: readSummaryNumber(summary, ['total_students', 'student_count', 'students'], derivedSummary.totalStudents),
        codedEvidence: readSummaryNumber(summary, ['coded_evidence', 'coded_count', 'coded'], derivedSummary.codedEvidence),
        validEvidence: readSummaryNumber(summary, ['valid_evidence', 'valid_count', 'valid'], derivedSummary.validEvidence),
        linkedSessions: readSummaryNumber(summary, ['linked_sessions', 'session_linked_count', 'evidence_with_session'], derivedSummary.linkedSessions),
    }

    if (authLoading) {
        return <div className={styles.loading}>Memuat...</div>
    }

    return (
        <div className={styles.page}>
            <header className={styles.header}>
                <div>
                    <h2>
                        <span className={styles.headerIcon}><FiArchive /></span>
                        Evidence Bank RM2/RM3
                    </h2>
                    <p className={styles.headerSub}>
                        Log bukti mentah dan hasil coding untuk memastikan data tesis siap dibaca per siswa, per sesi, dan per indikator.
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <button type="button" className={styles.secondaryBtn} onClick={() => router.push('/admin/riset')}>
                        <FiArrowLeft /> Kembali
                    </button>
                    <button type="button" className={styles.secondaryBtn} onClick={runAutoCoding} disabled={loading || autoCoding}>
                        <FiCpu className={autoCoding ? styles.spinning : ''} /> Jalankan Auto-Coding
                    </button>
                    <button type="button" className={styles.primaryBtn} onClick={fetchEvidence} disabled={loading}>
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

            <section className={styles.summaryGrid} aria-label="Ringkasan evidence bank">
                <div className={styles.summaryCard}>
                    <span className={styles.summaryIcon}><FiArchive /></span>
                    <strong>{displaySummary.totalEvidence}</strong>
                    <span>Total bukti</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={`${styles.summaryIcon} ${styles.iconStudents}`}><FiUsers /></span>
                    <strong>{displaySummary.totalStudents}</strong>
                    <span>Siswa tercakup</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={`${styles.summaryIcon} ${styles.iconCoded}`}><FiFileText /></span>
                    <strong>{displaySummary.codedEvidence}</strong>
                    <span>Sudah dikodekan</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={`${styles.summaryIcon} ${styles.iconValid}`}><FiCheckCircle /></span>
                    <strong>{displaySummary.validEvidence}</strong>
                    <span>Valid analisis</span>
                </div>
                <div className={styles.summaryCard}>
                    <span className={`${styles.summaryIcon} ${styles.iconSessions}`}><FiClock /></span>
                    <strong>{displaySummary.linkedSessions}</strong>
                    <span>Terhubung ke sesi</span>
                </div>
            </section>

            <section className={styles.section}>
                <div className={styles.sectionHeader}>
                    <div>
                        <h3>Daftar Bukti</h3>
                        <p>{filteredRows.length} dari {rows.length} bukti ditampilkan</p>
                    </div>
                    <div className={styles.filters}>
                        <label className={styles.searchBox}>
                            <FiSearch />
                            <input
                                value={query}
                                onChange={(event) => setQuery(event.target.value)}
                                placeholder="Cari siswa, teks bukti, respons AI..."
                            />
                        </label>
                        <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value)}>
                            {sourceOptions.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <select value={rmFilter} onChange={(event) => setRmFilter(event.target.value)}>
                            {RM_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                        <select value={codingFilter} onChange={(event) => setCodingFilter(event.target.value)}>
                            {CODING_OPTIONS.map(option => (
                                <option key={option.value} value={option.value}>{option.label}</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className={styles.tableWrap}>
                    {loading ? (
                        <div className={styles.loading}>Memuat evidence bank...</div>
                    ) : filteredRows.length === 0 ? (
                        <div className={styles.emptyState}>
                            <FiArchive />
                            <h3>Belum ada bukti yang bisa ditampilkan</h3>
                            <p>
                                Saat endpoint kosong atau belum aktif, halaman ini tetap siap sebagai wadah monitoring.
                                Begitu API evidence mengirimkan data, tabel akan langsung terisi.
                            </p>
                        </div>
                    ) : (
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Siswa</th>
                                    <th>Sumber</th>
                                    <th>Fokus</th>
                                    <th>Tahap Prompt</th>
                                    <th>Indikator</th>
                                    <th>Status Coding</th>
                                    <th>Validitas</th>
                                    <th>Sesi</th>
                                    <th>Cuplikan Bukti</th>
                                    <th>Dibuat</th>
                                    <th>Detail</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredRows.map(row => {
                                    const codingMeta = getCodingMeta(row.codingStatus)
                                    const validityMeta = getValidityMeta(row.researchValidityStatus)
                                    const focusMeta = getFocusMeta(row.rmFocus)

                                    return (
                                        <tr key={row.id}>
                                            <td>
                                                <div className={styles.studentCell}>
                                                    <strong>{row.studentName || 'Siswa tanpa nama'}</strong>
                                                    <span>{row.anonymousId || row.userId || '-'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={styles.sourceBadge}>
                                                    {humanizeToken(row.sourceType)}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`${styles.focusBadge} ${focusMeta.className}`}>
                                                    {focusMeta.label}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={styles.stageBadge}>
                                                    {row.promptStage || '-'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={styles.indicatorCode}>
                                                    {row.indicatorCode || '-'}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`${styles.statusBadge} ${codingMeta.className}`}>
                                                    {codingMeta.label}
                                                </span>
                                            </td>
                                            <td>
                                                <span className={`${styles.statusBadge} ${validityMeta.className}`}>
                                                    {validityMeta.label}
                                                </span>
                                            </td>
                                            <td>
                                                <div className={styles.sessionCell}>
                                                    <strong>{row.sessionNumber !== null ? `Sesi ${row.sessionNumber}` : '-'}</strong>
                                                    <span>{row.learningSessionId ? shortenId(row.learningSessionId) : 'Tanpa tautan sesi'}</span>
                                                </div>
                                            </td>
                                            <td>
                                                <div className={styles.previewStack}>
                                                    {row.evidenceText && (
                                                        <div className={styles.previewBlock}>
                                                            <span className={styles.previewLabel}>Bukti</span>
                                                            <p className={styles.previewText}>{truncateText(row.evidenceText)}</p>
                                                        </div>
                                                    )}
                                                    {row.aiResponse && (
                                                        <div className={styles.previewBlock}>
                                                            <span className={styles.previewLabel}>Respons AI</span>
                                                            <p className={styles.previewText}>{truncateText(row.aiResponse)}</p>
                                                        </div>
                                                    )}
                                                    {row.artifactSummary && (
                                                        <div className={styles.previewBlock}>
                                                            <span className={styles.previewLabel}>Artefak</span>
                                                            <p className={styles.previewText}>{truncateText(row.artifactSummary, 120)}</p>
                                                        </div>
                                                    )}
                                                    {!row.evidenceText && !row.aiResponse && !row.artifactSummary && (
                                                        <span className={styles.muted}>Belum ada cuplikan</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td>
                                                <span className={styles.dateText}>{formatDateTime(row.createdAt)}</span>
                                            </td>
                                            <td>
                                                <button className={styles.detailBtn} onClick={() => setSelectedRow(row)}>
                                                    Detail
                                                </button>
                                            </td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </section>

            {selectedRow && (
                <section className={styles.detailPanel}>
                    <div className={styles.detailHeader}>
                        <div>
                            <h3>Detail Bukti Tesis</h3>
                            <p>{selectedRow.studentName || selectedRow.anonymousId || selectedRow.userId || 'Siswa'} · {humanizeToken(selectedRow.sourceType)}</p>
                        </div>
                        <button className={styles.secondaryBtn} onClick={() => setSelectedRow(null)}>Tutup</button>
                    </div>
                    <div className={styles.detailGrid}>
                        <div className={styles.detailBlock}>
                            <span>Prompt / Bukti Mentah</span>
                            <p>{selectedRow.evidenceText || '-'}</p>
                        </div>
                        <div className={styles.detailBlock}>
                            <span>Jawaban AI / Artefak</span>
                            <p>{selectedRow.aiResponse || selectedRow.artifactSummary || '-'}</p>
                        </div>
                        <div className={styles.detailBlock}>
                            <span>Alasan Auto-Coding</span>
                            <p>{pickString(selectedRow.raw.auto_coding_reason, selectedRow.raw.classification_evidence, selectedRow.raw.researcher_notes) || '-'}</p>
                        </div>
                        <div className={styles.detailBlock}>
                            <span>Metadata</span>
                            <pre>{JSON.stringify({
                                id: selectedRow.id,
                                rm_focus: selectedRow.rmFocus,
                                prompt_stage: selectedRow.promptStage,
                                indicator_code: selectedRow.indicatorCode,
                                coding_status: selectedRow.codingStatus,
                                validity: selectedRow.researchValidityStatus,
                                confidence: selectedRow.raw.auto_confidence ?? selectedRow.raw.confidence_score ?? null,
                                week: selectedRow.raw.data_collection_week ?? null,
                                session: selectedRow.learningSessionId,
                            }, null, 2)}</pre>
                        </div>
                    </div>
                </section>
            )}
        </div>
    )
}
