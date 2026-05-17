'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import {
    FiAlertCircle, FiArrowLeft, FiCheckCircle, FiClock,
    FiEdit3, FiFileText, FiGitMerge, FiSave, FiUser, FiXCircle,
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import { apiFetch } from '@/lib/api-client'
import styles from './page.module.scss'

// ── Types ──────────────────────────────────────────────────────────────────

type SourceStatus = 'present' | 'partial' | 'absent' | 'supports' | 'neutral' | 'contradicts' | string | null | undefined

interface TriangulationDetail {
    id: string
    user_id: string
    course_id?: string | null
    rm_focus?: string | null
    indicator_code?: string | null
    finding_type?: string | null
    finding_description?: string | null
    log_evidence?: string | null
    log_evidence_status?: SourceStatus
    observation_evidence?: string | null
    observation_evidence_status?: SourceStatus
    artifact_evidence?: string | null
    artifact_evidence_status?: SourceStatus
    interview_evidence?: string | null
    interview_evidence_status?: SourceStatus
    convergence_status?: string | null
    convergence_score?: number | null
    triangulation_status?: string | null
    evidence_excerpt?: string | null
    final_decision?: string | null
    decision_rationale?: string | null
    researcher_notes?: string | null
    auto_generated?: boolean | null
    review_status?: string | null
    created_at?: string | null
    updated_at?: string | null
    // Joined fields
    student_name?: string | null
    student_email?: string | null
    course_title?: string | null
}

interface DetailApiResponse {
    success?: boolean
    record?: TriangulationDetail
    error?: string
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function normalizeSourceStatus(raw: SourceStatus): 'present' | 'partial' | 'absent' {
    const val = (raw ?? '').toLowerCase()
    if (['present', 'supports', 'mendukung', 'kuat'].includes(val)) return 'present'
    if (['partial', 'neutral', 'sebagian', 'mixed'].includes(val)) return 'partial'
    return 'absent'
}

function normalizeConvergence(raw: string | null | undefined): 'converged' | 'partial' | 'divergent' | 'missing' {
    const val = (raw ?? '').toLowerCase()
    if (['kuat', 'converged', 'convergen', 'convergent', 'strong'].includes(val)) return 'converged'
    if (['bertentangan', 'divergent', 'contradictory', 'contradicts', 'conflict'].includes(val)) return 'divergent'
    if (['belum_muncul', 'missing', 'absent', 'not_found', 'none'].includes(val)) return 'missing'
    return 'partial'
}

function rmFocusLabel(raw: string | null | undefined): string {
    const val = (raw ?? '').toUpperCase()
    if (val.includes('RM2') && val.includes('RM3')) return 'RM2 + RM3'
    if (val.includes('RM2')) return 'RM2'
    if (val.includes('RM3')) return 'RM3'
    return val || '-'
}

function formatDate(raw: string | null | undefined): string {
    if (!raw) return '-'
    const d = new Date(raw)
    if (isNaN(d.getTime())) return '-'
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ── Sub-components ───────────────────────────────────────────────────────────

interface SourcePanelProps {
    icon: React.ReactNode
    label: string
    evidence: string | null | undefined
    status: SourceStatus
    panelKey: 'log' | 'observation' | 'artifact'
}

function SourcePanel({ icon, label, evidence, status }: SourcePanelProps) {
    const normalized = normalizeSourceStatus(status)
    const hasContent = Boolean(evidence?.trim())

    const statusLabel = normalized === 'present' ? 'Ada' : normalized === 'partial' ? 'Sebagian' : 'Tidak ada'
    const statusClass =
        normalized === 'present' ? styles.statusPresent :
            normalized === 'partial' ? styles.statusPartial :
                styles.statusAbsent

    return (
        <article className={`${styles.sourcePanel} ${normalized === 'absent' ? styles.sourcePanelAbsent : ''}`}>
            <header className={styles.sourcePanelHeader}>
                <span className={styles.sourcePanelIcon}>{icon}</span>
                <span className={styles.sourcePanelLabel}>{label}</span>
                <span className={`${styles.sourceBadge} ${statusClass}`}>{statusLabel}</span>
            </header>
            <div className={styles.sourcePanelBody}>
                {hasContent ? (
                    <p className={styles.evidenceText}>{evidence}</p>
                ) : (
                    <p className={styles.absentNote}>Tidak ada bukti dari sumber ini.</p>
                )}
            </div>
        </article>
    )
}

interface ConvergenceBadgeProps {
    convergence: ReturnType<typeof normalizeConvergence>
    score?: number | null
}

function ConvergenceBadge({ convergence, score }: ConvergenceBadgeProps) {
    const map = {
        converged: { label: 'Konvergen', cls: styles.convConverged, icon: <FiCheckCircle /> },
        partial: { label: 'Sebagian', cls: styles.convPartial, icon: <FiClock /> },
        divergent: { label: 'Divergen', cls: styles.convDivergent, icon: <FiAlertCircle /> },
        missing: { label: 'Belum Muncul', cls: styles.convMissing, icon: <FiXCircle /> },
    }
    const meta = map[convergence]

    return (
        <span className={`${styles.convergenceBadge} ${meta.cls}`}>
            {meta.icon}
            {meta.label}
            {score != null && <span className={styles.convScore}>Skor {score}</span>}
        </span>
    )
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function TriangulationDetailPage() {
    const router = useRouter()
    const { id } = useParams<{ id: string }>()
    const { admin, loading: authLoading } = useAdmin()

    const [record, setRecord] = useState<TriangulationDetail | null>(null)
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)

    const [notes, setNotes] = useState('')
    const [notesSaving, setNotesSaving] = useState(false)
    const [notesSaved, setNotesSaved] = useState(false)
    const [notesError, setNotesError] = useState<string | null>(null)
    const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const fetchRecord = useCallback(async () => {
        if (!id) return
        try {
            setLoading(true)
            setError(null)
            const res = await apiFetch(`/api/admin/research/triangulation/${id}`)
            const data: DetailApiResponse = await res.json().catch(() => ({}))
            if (!res.ok || !data.success) {
                throw new Error(data.error || 'Gagal memuat catatan triangulasi')
            }
            setRecord(data.record ?? null)
            setNotes(data.record?.researcher_notes ?? '')
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Gagal memuat data')
        } finally {
            setLoading(false)
        }
    }, [id])

    useEffect(() => {
        if (!authLoading && admin) fetchRecord()
    }, [authLoading, admin, fetchRecord])

    const saveNotes = useCallback(async (value: string) => {
        if (!id) return
        setNotesSaving(true)
        setNotesSaved(false)
        setNotesError(null)
        try {
            const res = await apiFetch(`/api/admin/research/triangulation/${id}`, {
                method: 'PATCH',
                body: JSON.stringify({ researcher_notes: value }),
            })
            if (!res.ok) {
                const data = await res.json().catch(() => ({})) as { error?: string }
                throw new Error(data.error || 'Gagal menyimpan')
            }
            setNotesSaved(true)
            setTimeout(() => setNotesSaved(false), 2500)
        } catch (err) {
            setNotesError(err instanceof Error ? err.message : 'Gagal menyimpan catatan')
        } finally {
            setNotesSaving(false)
        }
    }, [id])

    const handleNotesChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const value = e.target.value
        setNotes(value)
        setNotesSaved(false)
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveTimerRef.current = setTimeout(() => saveNotes(value), 1500)
    }

    const handleNotesSave = () => {
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        saveNotes(notes)
    }

    if (authLoading || loading) {
        return <div className={styles.loading}>Memuat data triangulasi...</div>
    }

    if (error) {
        return (
            <div className={styles.errorPage}>
                <FiAlertCircle />
                <p>{error}</p>
                <button className={styles.backBtn} onClick={() => router.push('/admin/riset/triangulasi')}>
                    <FiArrowLeft /> Kembali ke daftar
                </button>
            </div>
        )
    }

    if (!record) {
        return (
            <div className={styles.errorPage}>
                <FiXCircle />
                <p>Catatan tidak ditemukan.</p>
                <button className={styles.backBtn} onClick={() => router.push('/admin/riset/triangulasi')}>
                    <FiArrowLeft /> Kembali ke daftar
                </button>
            </div>
        )
    }

    const convergence = normalizeConvergence(record.convergence_status ?? record.triangulation_status)
    const rmLabel = rmFocusLabel(record.rm_focus)

    const hasInterview = Boolean(record.interview_evidence?.trim())
    const interviewStatus = normalizeSourceStatus(record.interview_evidence_status)

    return (
        <div className={styles.page}>
            {/* ── Back Nav ── */}
            <button className={styles.backBtn} onClick={() => router.push('/admin/riset/triangulasi')}>
                <FiArrowLeft /> Kembali ke Daftar
            </button>

            {/* ── Page Header ── */}
            <header className={styles.pageHeader}>
                <div className={styles.pageHeaderMeta}>
                    <div className={styles.metaRow}>
                        <span className={styles.metaIcon}><FiUser /></span>
                        <div>
                            <strong>{record.student_name ?? 'Siswa tanpa nama'}</strong>
                            {record.student_email && (
                                <span className={styles.metaEmail}>{record.student_email}</span>
                            )}
                        </div>
                    </div>
                    {record.course_title && (
                        <p className={styles.courseTitle}>
                            Kursus: <em>{record.course_title}</em>
                        </p>
                    )}
                    <div className={styles.badgeRow}>
                        <span className={`${styles.rmBadge} ${record.rm_focus?.includes('RM2') && !record.rm_focus?.includes('RM3') ? styles.rmRm2 : record.rm_focus?.includes('RM3') && !record.rm_focus?.includes('RM2') ? styles.rmRm3 : styles.rmBoth}`}>
                            {rmLabel}
                        </span>
                        {record.indicator_code && (
                            <span className={styles.indicatorCode}>{record.indicator_code}</span>
                        )}
                        <ConvergenceBadge convergence={convergence} score={record.convergence_score} />
                    </div>
                    <p className={styles.recordDate}>
                        Dibuat: {formatDate(record.created_at)}
                        {record.updated_at && record.updated_at !== record.created_at && (
                            <> &middot; Diperbarui: {formatDate(record.updated_at)}</>
                        )}
                    </p>
                </div>

                <div className={styles.pageHeaderIcon}>
                    <FiGitMerge />
                </div>
            </header>

            {/* ── 3-Column Source View ── */}
            <section className={styles.sourcesSection} aria-label="Sumber triangulasi">
                <h3 className={styles.sectionTitle}>Sumber Bukti</h3>
                <div className={styles.sourcesGrid}>
                    <SourcePanel
                        icon={<span>📋</span>}
                        label="Log Prompt"
                        evidence={record.log_evidence}
                        status={record.log_evidence_status}
                        panelKey="log"
                    />
                    <SourcePanel
                        icon={<span>👁</span>}
                        label="Observasi"
                        evidence={record.observation_evidence}
                        status={record.observation_evidence_status}
                        panelKey="observation"
                    />
                    <SourcePanel
                        icon={<span>📄</span>}
                        label="Artefak"
                        evidence={record.artifact_evidence}
                        status={record.artifact_evidence_status}
                        panelKey="artifact"
                    />
                </div>
            </section>

            {/* ── Interview Footer (conditional) ── */}
            {(hasInterview || interviewStatus !== 'absent') && (
                <section className={styles.interviewSection} aria-label="Bukti wawancara">
                    <header className={styles.interviewHeader}>
                        <span>🎤</span>
                        <span className={styles.sourcePanelLabel}>Wawancara</span>
                        <span className={`${styles.sourceBadge} ${interviewStatus === 'present' ? styles.statusPresent : interviewStatus === 'partial' ? styles.statusPartial : styles.statusAbsent}`}>
                            {interviewStatus === 'present' ? 'Ada' : interviewStatus === 'partial' ? 'Sebagian' : 'Tidak ada'}
                        </span>
                    </header>
                    {hasInterview ? (
                        <p className={styles.evidenceText}>{record.interview_evidence}</p>
                    ) : (
                        <p className={styles.absentNote}>Tidak ada catatan wawancara untuk entri ini.</p>
                    )}
                </section>
            )}

            {/* ── Decision Card ── */}
            <section className={styles.decisionSection} aria-label="Keputusan akhir triangulasi">
                <h3 className={styles.sectionTitle}>
                    <FiFileText /> Keputusan Triangulasi
                </h3>
                <div className={styles.decisionCard}>
                    {record.final_decision && (
                        <div className={styles.decisionRow}>
                            <span className={styles.decisionLabel}>Keputusan Akhir</span>
                            <span className={styles.decisionValue}>{record.final_decision}</span>
                        </div>
                    )}
                    {record.decision_rationale && (
                        <div className={styles.rationaleBlock}>
                            <span className={styles.decisionLabel}>Rasional</span>
                            <p className={styles.rationaleText}>{record.decision_rationale}</p>
                        </div>
                    )}
                    {record.evidence_excerpt && (
                        <div className={styles.rationaleBlock}>
                            <span className={styles.decisionLabel}>Cuplikan Bukti</span>
                            <p className={`${styles.rationaleText} ${styles.excerpt}`}>&ldquo;{record.evidence_excerpt}&rdquo;</p>
                        </div>
                    )}
                    {record.finding_description && (
                        <div className={styles.rationaleBlock}>
                            <span className={styles.decisionLabel}>Deskripsi Temuan</span>
                            <p className={styles.rationaleText}>{record.finding_description}</p>
                        </div>
                    )}
                </div>
            </section>

            {/* ── Researcher Notes ── */}
            <section className={styles.notesSection} aria-label="Catatan peneliti">
                <h3 className={styles.sectionTitle}>
                    <FiEdit3 /> Catatan Peneliti
                </h3>
                <div className={styles.notesCard}>
                    <textarea
                        className={styles.notesTextarea}
                        value={notes}
                        onChange={handleNotesChange}
                        placeholder="Tambahkan catatan atau anotasi untuk record ini..."
                        rows={5}
                    />
                    <div className={styles.notesFooter}>
                        {notesError && (
                            <span className={styles.notesError}>
                                <FiAlertCircle /> {notesError}
                            </span>
                        )}
                        {notesSaved && !notesSaving && (
                            <span className={styles.notesSaved}>
                                <FiCheckCircle /> Tersimpan
                            </span>
                        )}
                        <button
                            className={styles.saveNotesBtn}
                            onClick={handleNotesSave}
                            disabled={notesSaving}
                        >
                            <FiSave />
                            {notesSaving ? 'Menyimpan...' : 'Simpan Catatan'}
                        </button>
                    </div>
                </div>
            </section>
        </div>
    )
}
