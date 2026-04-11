'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiBarChart2, FiArrowLeft, FiPlus, FiX,
    FiEye, FiEdit2, FiInbox, FiTrash2, FiChevronLeft, FiChevronRight,
    FiGrid, FiChevronDown, FiChevronUp
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import type { PromptStage, ResearchAnalytics } from '@/types/research'
import styles from './page.module.scss'

// ============================================
// INTERFACES
// ============================================

type IndicatorType = 'computational_thinking' | 'critical_thinking'

interface CTIndicators {
    decomposition: number
    pattern_recognition: number
    abstraction: number
    algorithm_design: number
    evaluation_debugging: number
    generalization: number
}

interface CriticalIndicators {
    interpretation: number
    analysis: number
    evaluation: number
    inference: number
    explanation: number
    self_regulation: number
}

interface CognitiveIndicator {
    id: string
    classification_id: string
    indicator_type: IndicatorType
    ct_indicators: CTIndicators | null
    critical_indicators: CriticalIndicators | null
    evidence_notes: string | null
    assessed_by: string
    assessment_date: string
    created_at: string
    prompt_classifications?: {
        prompt_text: string
        prompt_stage: string
        learning_sessions?: {
            session_number: number
            users?: { name: string }
        }
    }
}

interface IndicatorFormData {
    classification_id: string
    indicator_type: IndicatorType
    ct_indicators: CTIndicators
    critical_indicators: CriticalIndicators
    evidence_notes: string
    assessed_by: string
}

interface ClassificationOption {
    id: string
    prompt_text: string
    prompt_stage: string
    session_number?: number
    user_name?: string
}

type ModalMode = 'add' | 'edit' | 'view'

// ============================================
// CONSTANTS
// ============================================

const ITEMS_PER_PAGE = 10

const DEFAULT_CT: CTIndicators = {
    decomposition: 0,
    pattern_recognition: 0,
    abstraction: 0,
    algorithm_design: 0,
    evaluation_debugging: 0,
    generalization: 0
}

const DEFAULT_CRITICAL: CriticalIndicators = {
    interpretation: 0,
    analysis: 0,
    evaluation: 0,
    inference: 0,
    explanation: 0,
    self_regulation: 0
}

const STAGES: PromptStage[] = ['SCP', 'SRP', 'MQP', 'REFLECTIVE']

export default function KognitifPage() {
    const router = useRouter()
    const { admin, loading: authLoading } = useAdmin()

    // Section toggle
    const [indicatorSectionOpen, setIndicatorSectionOpen] = useState(true)
    const [matrixSectionOpen, setMatrixSectionOpen] = useState(true)

    // ============================================
    // INDICATOR STATE
    // ============================================
    const [indicators, setIndicators] = useState<CognitiveIndicator[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [modalMode, setModalMode] = useState<ModalMode>('add')
    const [selectedIndicator, setSelectedIndicator] = useState<CognitiveIndicator | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [filterType, setFilterType] = useState<string>('')
    const [classifications, setClassifications] = useState<ClassificationOption[]>([])
    const [currentPage, setCurrentPage] = useState(1)
    const [formData, setFormData] = useState<IndicatorFormData>({
        classification_id: '',
        indicator_type: 'computational_thinking',
        ct_indicators: { ...DEFAULT_CT },
        critical_indicators: { ...DEFAULT_CRITICAL },
        evidence_notes: '',
        assessed_by: 'admin'
    })

    // ============================================
    // MATRIX STATE
    // ============================================
    const [analytics, setAnalytics] = useState<ResearchAnalytics | null>(null)
    const [matrixLoading, setMatrixLoading] = useState(true)
    const [matrixError, setMatrixError] = useState<string | null>(null)

    // ============================================
    // FETCH FUNCTIONS
    // ============================================

    const fetchClassifications = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/research/classifications?limit=100', { credentials: 'include' })
            const data = await res.json()
            if (res.ok && data.data) {
                setClassifications(data.data.map((c: { id: string; prompt_text: string; prompt_stage: string; learning_sessions?: { session_number: number; users?: { name: string } } }) => ({
                    id: c.id,
                    prompt_text: c.prompt_text,
                    prompt_stage: c.prompt_stage,
                    session_number: c.learning_sessions?.session_number,
                    user_name: c.learning_sessions?.users?.name
                })))
            }
        } catch (err) {
            console.error('Error fetching classifications:', err)
        }
    }, [])

    const fetchIndicators = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            let url = '/api/admin/research/indicators?limit=100'
            if (filterType) {
                url += `&type=${filterType}`
            }

            const res = await fetch(url, { credentials: 'include' })
            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Gagal memuat data')
            }

            setIndicators(data.data || [])
            setCurrentPage(1)
        } catch (err) {
            console.error('Error fetching indicators:', err)
            setError(err instanceof Error ? err.message : 'Gagal memuat data')
        } finally {
            setLoading(false)
        }
    }, [filterType])

    const fetchAnalytics = useCallback(async () => {
        try {
            setMatrixLoading(true)
            setMatrixError(null)

            const res = await fetch('/api/admin/research/analytics', { credentials: 'include' })
            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Gagal memuat data analitik')
            }

            if (data.data) {
                setAnalytics(data.data)
            }
        } catch (err) {
            console.error('Error fetching analytics:', err)
            setMatrixError(err instanceof Error ? err.message : 'Gagal memuat data analitik')
        } finally {
            setMatrixLoading(false)
        }
    }, [])

    useEffect(() => {
        if (!authLoading && admin) {
            fetchIndicators()
            fetchClassifications()
            fetchAnalytics()
        }
    }, [authLoading, admin, fetchIndicators, fetchClassifications, fetchAnalytics])

    // ============================================
    // INDICATOR HANDLERS
    // ============================================

    const resetForm = () => {
        setFormData({
            classification_id: '',
            indicator_type: 'computational_thinking',
            ct_indicators: { ...DEFAULT_CT },
            critical_indicators: { ...DEFAULT_CRITICAL },
            evidence_notes: '',
            assessed_by: 'admin'
        })
        setSelectedIndicator(null)
    }

    const openAddModal = () => {
        resetForm()
        setModalMode('add')
        setShowModal(true)
    }

    const openViewModal = (indicator: CognitiveIndicator) => {
        setSelectedIndicator(indicator)
        setModalMode('view')
        setShowModal(true)
    }

    const openEditModal = (indicator: CognitiveIndicator) => {
        setSelectedIndicator(indicator)
        setFormData({
            classification_id: indicator.classification_id,
            indicator_type: indicator.indicator_type,
            ct_indicators: indicator.ct_indicators || { ...DEFAULT_CT },
            critical_indicators: indicator.critical_indicators || { ...DEFAULT_CRITICAL },
            evidence_notes: indicator.evidence_notes || '',
            assessed_by: indicator.assessed_by
        })
        setModalMode('edit')
        setShowModal(true)
    }

    const handleDelete = async (id: string) => {
        if (!confirm('Apakah Anda yakin ingin menghapus penilaian ini?')) return

        try {
            const res = await fetch(`/api/admin/research/indicators?id=${id}`, {
                method: 'DELETE',
                credentials: 'include'
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Gagal menghapus data')
            }

            fetchIndicators()
        } catch (err) {
            console.error('Error deleting indicator:', err)
            setError(err instanceof Error ? err.message : 'Gagal menghapus data')
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)

        try {
            const payload = {
                ...formData,
                ct_indicators: formData.indicator_type === 'computational_thinking' ? formData.ct_indicators : null,
                critical_indicators: formData.indicator_type === 'critical_thinking' ? formData.critical_indicators : null
            }

            const isEdit = modalMode === 'edit' && selectedIndicator
            const url = isEdit
                ? `/api/admin/research/indicators?id=${selectedIndicator.id}`
                : '/api/admin/research/indicators'

            const res = await fetch(url, {
                method: isEdit ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Gagal menyimpan data')
            }

            setShowModal(false)
            resetForm()
            fetchIndicators()
        } catch (err) {
            console.error('Error saving indicator:', err)
            setError(err instanceof Error ? err.message : 'Gagal menyimpan data')
        } finally {
            setSubmitting(false)
        }
    }

    // ============================================
    // HELPERS
    // ============================================

    // Pagination
    const totalPages = Math.ceil(indicators.length / ITEMS_PER_PAGE)
    const paginatedIndicators = indicators.slice(
        (currentPage - 1) * ITEMS_PER_PAGE,
        currentPage * ITEMS_PER_PAGE
    )

    const getTypeBadge = (type: IndicatorType) => {
        if (type === 'computational_thinking') {
            return <span className={`${styles.typeBadge} ${styles.typeCT}`}>CT</span>
        }
        return <span className={`${styles.typeBadge} ${styles.typeCritical}`}>Critical</span>
    }

    const getScoreBadge = (score: number) => {
        const scoreClass = {
            0: styles.score0,
            1: styles.score1,
            2: styles.score2
        }
        return <span className={`${styles.scoreBadge} ${scoreClass[score as keyof typeof scoreClass] || ''}`}>{score}</span>
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
    }

    const getCellColor = (value: number, maxValue: number) => {
        if (maxValue === 0) return styles.cellNeutral
        const ratio = value / maxValue
        if (ratio >= 0.7) return styles.cellHigh
        if (ratio >= 0.4) return styles.cellMedium
        if (ratio > 0) return styles.cellLow
        return styles.cellNeutral
    }

    if (authLoading) {
        return <div className={styles.loading}>Memuat...</div>
    }

    // Compute max values for heatmap coloring
    const heatmapData = analytics?.stage_heatmap
    let maxSessions = 0
    let maxAvgCt = 0
    let maxAvgCth = 0
    if (heatmapData) {
        for (const stage of STAGES) {
            const d = heatmapData[stage]
            if (d) {
                if (d.sessions > maxSessions) maxSessions = d.sessions
                if (d.avg_ct > maxAvgCt) maxAvgCt = d.avg_ct
                if (d.avg_cth > maxAvgCth) maxAvgCth = d.avg_cth
            }
        }
    }

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2>
                        <span className={styles.headerIcon}><FiBarChart2 /></span>
                        Indikator Kognitif (RM3)
                    </h2>
                    <p className={styles.headerSub}>
                        Penilaian indikator Computational Thinking dan Critical Thinking
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <button
                        className={styles.backBtn}
                        onClick={() => router.push('/admin/riset')}
                    >
                        <FiArrowLeft /> Kembali
                    </button>
                </div>
            </div>

            {/* ============================================ */}
            {/* SECTION 1: Penilaian Indikator */}
            {/* ============================================ */}
            <div className={styles.section}>
                <div
                    className={styles.sectionHeader}
                    onClick={() => setIndicatorSectionOpen(!indicatorSectionOpen)}
                >
                    <h3 className={styles.sectionTitle}>
                        <FiBarChart2 /> Penilaian Indikator
                    </h3>
                    <div className={styles.sectionToggle}>
                        {indicatorSectionOpen ? <FiChevronUp /> : <FiChevronDown />}
                    </div>
                </div>

                {indicatorSectionOpen && (
                    <div className={styles.sectionBody}>
                        <div className={styles.sectionToolbar}>
                            <div className={styles.filters}>
                                <div className={styles.filterGroup}>
                                    <label>Tipe Indikator</label>
                                    <select
                                        value={filterType}
                                        onChange={(e) => setFilterType(e.target.value)}
                                    >
                                        <option value="">Semua Tipe</option>
                                        <option value="computational_thinking">Computational Thinking</option>
                                        <option value="critical_thinking">Critical Thinking</option>
                                    </select>
                                </div>
                            </div>
                            <button
                                className={styles.addBtn}
                                onClick={openAddModal}
                            >
                                <FiPlus /> Tambah Penilaian
                            </button>
                        </div>

                        {error && <div className={styles.errorCard}>{error}</div>}

                        <div className={styles.tableContainer}>
                            {loading ? (
                                <div className={styles.loading}>Memuat data...</div>
                            ) : indicators.length === 0 ? (
                                <div className={styles.emptyState}>
                                    <FiInbox />
                                    <h3>Belum ada penilaian</h3>
                                    <p>Klik &quot;Tambah Penilaian&quot; untuk menambah data baru</p>
                                </div>
                            ) : (
                                <>
                                    <table className={styles.table}>
                                        <thead>
                                            <tr>
                                                <th>Klasifikasi</th>
                                                <th>Tipe</th>
                                                <th>Indikator</th>
                                                <th>Penilai</th>
                                                <th>Tanggal</th>
                                                <th>Aksi</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paginatedIndicators.map((item) => (
                                                <tr key={item.id}>
                                                    <td>
                                                        <div style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                            {item.prompt_classifications?.prompt_text || '-'}
                                                        </div>
                                                        <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                                                            {item.prompt_classifications?.prompt_stage} - Sesi #{item.prompt_classifications?.learning_sessions?.session_number}
                                                        </div>
                                                    </td>
                                                    <td>{getTypeBadge(item.indicator_type)}</td>
                                                    <td>
                                                        {item.indicator_type === 'computational_thinking' && item.ct_indicators ? (
                                                            <div className={styles.indicatorGrid}>
                                                                <div className={styles.indicatorCell}>
                                                                    <div className={styles.indicatorLabel}>Dec</div>
                                                                    {getScoreBadge(item.ct_indicators.decomposition)}
                                                                </div>
                                                                <div className={styles.indicatorCell}>
                                                                    <div className={styles.indicatorLabel}>Pat</div>
                                                                    {getScoreBadge(item.ct_indicators.pattern_recognition)}
                                                                </div>
                                                                <div className={styles.indicatorCell}>
                                                                    <div className={styles.indicatorLabel}>Abs</div>
                                                                    {getScoreBadge(item.ct_indicators.abstraction)}
                                                                </div>
                                                                <div className={styles.indicatorCell}>
                                                                    <div className={styles.indicatorLabel}>Alg</div>
                                                                    {getScoreBadge(item.ct_indicators.algorithm_design)}
                                                                </div>
                                                                <div className={styles.indicatorCell}>
                                                                    <div className={styles.indicatorLabel}>Eva</div>
                                                                    {getScoreBadge(item.ct_indicators.evaluation_debugging)}
                                                                </div>
                                                                <div className={styles.indicatorCell}>
                                                                    <div className={styles.indicatorLabel}>Gen</div>
                                                                    {getScoreBadge(item.ct_indicators.generalization)}
                                                                </div>
                                                            </div>
                                                        ) : item.critical_indicators ? (
                                                            <div className={styles.indicatorGrid}>
                                                                <div className={styles.indicatorCell}>
                                                                    <div className={styles.indicatorLabel}>Int</div>
                                                                    {getScoreBadge(item.critical_indicators.interpretation)}
                                                                </div>
                                                                <div className={styles.indicatorCell}>
                                                                    <div className={styles.indicatorLabel}>Ana</div>
                                                                    {getScoreBadge(item.critical_indicators.analysis)}
                                                                </div>
                                                                <div className={styles.indicatorCell}>
                                                                    <div className={styles.indicatorLabel}>Eva</div>
                                                                    {getScoreBadge(item.critical_indicators.evaluation)}
                                                                </div>
                                                                <div className={styles.indicatorCell}>
                                                                    <div className={styles.indicatorLabel}>Inf</div>
                                                                    {getScoreBadge(item.critical_indicators.inference)}
                                                                </div>
                                                                <div className={styles.indicatorCell}>
                                                                    <div className={styles.indicatorLabel}>Exp</div>
                                                                    {getScoreBadge(item.critical_indicators.explanation)}
                                                                </div>
                                                                <div className={styles.indicatorCell}>
                                                                    <div className={styles.indicatorLabel}>Reg</div>
                                                                    {getScoreBadge(item.critical_indicators.self_regulation)}
                                                                </div>
                                                            </div>
                                                        ) : '-'}
                                                    </td>
                                                    <td>{item.assessed_by}</td>
                                                    <td>{formatDate(item.assessment_date)}</td>
                                                    <td>
                                                        <div className={styles.actionBtns}>
                                                            <button
                                                                className={`${styles.actionBtn} ${styles.viewBtn}`}
                                                                onClick={() => openViewModal(item)}
                                                            >
                                                                <FiEye />
                                                            </button>
                                                            <button
                                                                className={`${styles.actionBtn} ${styles.editBtn}`}
                                                                onClick={() => openEditModal(item)}
                                                            >
                                                                <FiEdit2 />
                                                            </button>
                                                            <button
                                                                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                                onClick={() => handleDelete(item.id)}
                                                            >
                                                                <FiTrash2 />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>

                                    {totalPages > 1 && (
                                        <div className={styles.pagination}>
                                            <button
                                                className={styles.pageBtn}
                                                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={currentPage === 1}
                                            >
                                                <FiChevronLeft />
                                            </button>
                                            <span className={styles.pageInfo}>
                                                Halaman {currentPage} dari {totalPages}
                                            </span>
                                            <button
                                                className={styles.pageBtn}
                                                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                                disabled={currentPage === totalPages}
                                            >
                                                <FiChevronRight />
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* ============================================ */}
            {/* SECTION 2: Matriks Silang */}
            {/* ============================================ */}
            <div className={styles.section}>
                <div
                    className={styles.sectionHeader}
                    onClick={() => setMatrixSectionOpen(!matrixSectionOpen)}
                >
                    <h3 className={styles.sectionTitle}>
                        <FiGrid /> Matriks Silang (Tahap vs Indikator)
                    </h3>
                    <div className={styles.sectionToggle}>
                        {matrixSectionOpen ? <FiChevronUp /> : <FiChevronDown />}
                    </div>
                </div>

                {matrixSectionOpen && (
                    <div className={styles.sectionBody}>
                        {matrixError && <div className={styles.errorCard}>{matrixError}</div>}

                        {matrixLoading ? (
                            <div className={styles.loading}>Memuat data matriks...</div>
                        ) : !heatmapData ? (
                            <div className={styles.emptyState}>
                                <FiGrid />
                                <h3>Data belum tersedia</h3>
                                <p>Matriks silang akan muncul setelah data analitik tersedia</p>
                            </div>
                        ) : (
                            <>
                                <p className={styles.matrixDesc}>
                                    Tabel berikut menampilkan hubungan antara tahap prompt (baris) dan indikator kognitif rata-rata (kolom).
                                    Warna sel menunjukkan intensitas: hijau = tinggi, kuning = sedang, merah = rendah.
                                </p>
                                <div className={styles.matrixTableWrap}>
                                    <table className={styles.matrixTable}>
                                        <thead>
                                            <tr>
                                                <th>Tahap</th>
                                                <th>Jumlah Sesi</th>
                                                <th>Rata-rata CT</th>
                                                <th>Rata-rata CTh</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {STAGES.map((stage) => {
                                                const d = heatmapData[stage] || { sessions: 0, avg_ct: 0, avg_cth: 0 }
                                                return (
                                                    <tr key={stage}>
                                                        <td>
                                                            <span className={`${styles.matrixStage} ${styles[`matrixStage${stage}`]}`}>
                                                                {stage}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className={`${styles.matrixCell} ${getCellColor(d.sessions, maxSessions)}`}>
                                                                {d.sessions}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className={`${styles.matrixCell} ${getCellColor(d.avg_ct, maxAvgCt)}`}>
                                                                {d.avg_ct.toFixed(2)}
                                                            </span>
                                                        </td>
                                                        <td>
                                                            <span className={`${styles.matrixCell} ${getCellColor(d.avg_cth, maxAvgCth)}`}>
                                                                {d.avg_cth.toFixed(2)}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                                <div className={styles.matrixLegend}>
                                    <span className={styles.legendItem}>
                                        <span className={`${styles.legendDot} ${styles.cellHigh}`}></span> Tinggi
                                    </span>
                                    <span className={styles.legendItem}>
                                        <span className={`${styles.legendDot} ${styles.cellMedium}`}></span> Sedang
                                    </span>
                                    <span className={styles.legendItem}>
                                        <span className={`${styles.legendDot} ${styles.cellLow}`}></span> Rendah
                                    </span>
                                    <span className={styles.legendItem}>
                                        <span className={`${styles.legendDot} ${styles.cellNeutral}`}></span> Tidak ada
                                    </span>
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ============================================ */}
            {/* MODAL */}
            {/* ============================================ */}
            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>
                                {modalMode === 'add' && 'Tambah Penilaian Indikator'}
                                {modalMode === 'edit' && 'Edit Penilaian Indikator'}
                                {modalMode === 'view' && 'Detail Penilaian Indikator'}
                            </h3>
                            <button className={styles.closeBtn} onClick={() => setShowModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        {/* View Mode */}
                        {modalMode === 'view' && selectedIndicator && (
                            <div className={styles.modalBody}>
                                <div className={styles.viewGrid}>
                                    <div className={`${styles.viewItem} ${styles.fullWidth}`}>
                                        <label>Klasifikasi Prompt</label>
                                        <span>{selectedIndicator.prompt_classifications?.prompt_text || '-'}</span>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Tipe Indikator</label>
                                        <span>{selectedIndicator.indicator_type === 'computational_thinking' ? 'Computational Thinking' : 'Critical Thinking'}</span>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Dinilai Oleh</label>
                                        <span>{selectedIndicator.assessed_by}</span>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Tanggal Penilaian</label>
                                        <span>{formatDate(selectedIndicator.assessment_date)}</span>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Tahap</label>
                                        <span>{selectedIndicator.prompt_classifications?.prompt_stage || '-'}</span>
                                    </div>
                                </div>

                                {/* CT Indicators View */}
                                {selectedIndicator.indicator_type === 'computational_thinking' && selectedIndicator.ct_indicators && (
                                    <div className={`${styles.indicatorSection} ${styles.ctSection}`}>
                                        <h4>Indikator Computational Thinking</h4>
                                        <div className={styles.viewGrid}>
                                            <div className={styles.viewItem}>
                                                <label>Decomposition</label>
                                                <span>{getScoreBadge(selectedIndicator.ct_indicators.decomposition)}</span>
                                            </div>
                                            <div className={styles.viewItem}>
                                                <label>Pattern Recognition</label>
                                                <span>{getScoreBadge(selectedIndicator.ct_indicators.pattern_recognition)}</span>
                                            </div>
                                            <div className={styles.viewItem}>
                                                <label>Abstraction</label>
                                                <span>{getScoreBadge(selectedIndicator.ct_indicators.abstraction)}</span>
                                            </div>
                                            <div className={styles.viewItem}>
                                                <label>Algorithm Design</label>
                                                <span>{getScoreBadge(selectedIndicator.ct_indicators.algorithm_design)}</span>
                                            </div>
                                            <div className={styles.viewItem}>
                                                <label>Evaluation/Debugging</label>
                                                <span>{getScoreBadge(selectedIndicator.ct_indicators.evaluation_debugging)}</span>
                                            </div>
                                            <div className={styles.viewItem}>
                                                <label>Generalization</label>
                                                <span>{getScoreBadge(selectedIndicator.ct_indicators.generalization)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* Critical Indicators View */}
                                {selectedIndicator.indicator_type === 'critical_thinking' && selectedIndicator.critical_indicators && (
                                    <div className={`${styles.indicatorSection} ${styles.criticalSection}`}>
                                        <h4>Indikator Critical Thinking</h4>
                                        <div className={styles.viewGrid}>
                                            <div className={styles.viewItem}>
                                                <label>Interpretation</label>
                                                <span>{getScoreBadge(selectedIndicator.critical_indicators.interpretation)}</span>
                                            </div>
                                            <div className={styles.viewItem}>
                                                <label>Analysis</label>
                                                <span>{getScoreBadge(selectedIndicator.critical_indicators.analysis)}</span>
                                            </div>
                                            <div className={styles.viewItem}>
                                                <label>Evaluation</label>
                                                <span>{getScoreBadge(selectedIndicator.critical_indicators.evaluation)}</span>
                                            </div>
                                            <div className={styles.viewItem}>
                                                <label>Inference</label>
                                                <span>{getScoreBadge(selectedIndicator.critical_indicators.inference)}</span>
                                            </div>
                                            <div className={styles.viewItem}>
                                                <label>Explanation</label>
                                                <span>{getScoreBadge(selectedIndicator.critical_indicators.explanation)}</span>
                                            </div>
                                            <div className={styles.viewItem}>
                                                <label>Self-Regulation</label>
                                                <span>{getScoreBadge(selectedIndicator.critical_indicators.self_regulation)}</span>
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {selectedIndicator.evidence_notes && (
                                    <div className={`${styles.viewItem} ${styles.fullWidth}`} style={{ marginTop: '1rem' }}>
                                        <label>Catatan Bukti</label>
                                        <span>{selectedIndicator.evidence_notes}</span>
                                    </div>
                                )}

                                <div className={styles.modalFooter}>
                                    <button
                                        type="button"
                                        className={styles.cancelBtn}
                                        onClick={() => setShowModal(false)}
                                    >
                                        Tutup
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.submitBtn}
                                        onClick={() => openEditModal(selectedIndicator)}
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Add/Edit Mode */}
                        {(modalMode === 'add' || modalMode === 'edit') && (
                            <form onSubmit={handleSubmit}>
                                <div className={styles.modalBody}>
                                    <div className={styles.formGroup}>
                                        <label>Klasifikasi Prompt *</label>
                                        <select
                                            value={formData.classification_id}
                                            onChange={(e) => setFormData({ ...formData, classification_id: e.target.value })}
                                            required
                                            disabled={modalMode === 'edit'}
                                        >
                                            <option value="">-- Pilih Klasifikasi --</option>
                                            {classifications.map((c) => (
                                                <option key={c.id} value={c.id}>
                                                    [{c.prompt_stage}] {c.prompt_text.substring(0, 50)}... (Sesi #{c.session_number})
                                                </option>
                                            ))}
                                        </select>
                                        <p className={styles.helpText}>Pilih klasifikasi prompt yang akan dinilai</p>
                                    </div>

                                    <div className={styles.formRow}>
                                        <div className={styles.formGroup}>
                                            <label>Tipe Indikator *</label>
                                            <select
                                                value={formData.indicator_type}
                                                onChange={(e) => setFormData({ ...formData, indicator_type: e.target.value as IndicatorType })}
                                                required
                                            >
                                                <option value="computational_thinking">Computational Thinking</option>
                                                <option value="critical_thinking">Critical Thinking</option>
                                            </select>
                                        </div>

                                        <div className={styles.formGroup}>
                                            <label>Dinilai Oleh</label>
                                            <input
                                                type="text"
                                                value={formData.assessed_by}
                                                onChange={(e) => setFormData({ ...formData, assessed_by: e.target.value })}
                                                placeholder="Nama penilai"
                                            />
                                        </div>
                                    </div>

                                    {/* CT Indicators */}
                                    {formData.indicator_type === 'computational_thinking' && (
                                        <div className={`${styles.indicatorSection} ${styles.ctSection}`}>
                                            <h4>Indikator Computational Thinking</h4>
                                            <div className={styles.indicatorInputGrid}>
                                                <div className={styles.indicatorInput}>
                                                    <label>Decomposition</label>
                                                    <select
                                                        value={formData.ct_indicators.decomposition}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            ct_indicators: { ...formData.ct_indicators, decomposition: parseInt(e.target.value) }
                                                        })}
                                                    >
                                                        <option value={0}>0 - Tidak Muncul</option>
                                                        <option value={1}>1 - Muncul Sebagian</option>
                                                        <option value={2}>2 - Muncul Penuh</option>
                                                    </select>
                                                </div>
                                                <div className={styles.indicatorInput}>
                                                    <label>Pattern Recognition</label>
                                                    <select
                                                        value={formData.ct_indicators.pattern_recognition}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            ct_indicators: { ...formData.ct_indicators, pattern_recognition: parseInt(e.target.value) }
                                                        })}
                                                    >
                                                        <option value={0}>0 - Tidak Muncul</option>
                                                        <option value={1}>1 - Muncul Sebagian</option>
                                                        <option value={2}>2 - Muncul Penuh</option>
                                                    </select>
                                                </div>
                                                <div className={styles.indicatorInput}>
                                                    <label>Abstraction</label>
                                                    <select
                                                        value={formData.ct_indicators.abstraction}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            ct_indicators: { ...formData.ct_indicators, abstraction: parseInt(e.target.value) }
                                                        })}
                                                    >
                                                        <option value={0}>0 - Tidak Muncul</option>
                                                        <option value={1}>1 - Muncul Sebagian</option>
                                                        <option value={2}>2 - Muncul Penuh</option>
                                                    </select>
                                                </div>
                                                <div className={styles.indicatorInput}>
                                                    <label>Algorithm Design</label>
                                                    <select
                                                        value={formData.ct_indicators.algorithm_design}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            ct_indicators: { ...formData.ct_indicators, algorithm_design: parseInt(e.target.value) }
                                                        })}
                                                    >
                                                        <option value={0}>0 - Tidak Muncul</option>
                                                        <option value={1}>1 - Muncul Sebagian</option>
                                                        <option value={2}>2 - Muncul Penuh</option>
                                                    </select>
                                                </div>
                                                <div className={styles.indicatorInput}>
                                                    <label>Evaluation/Debugging</label>
                                                    <select
                                                        value={formData.ct_indicators.evaluation_debugging}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            ct_indicators: { ...formData.ct_indicators, evaluation_debugging: parseInt(e.target.value) }
                                                        })}
                                                    >
                                                        <option value={0}>0 - Tidak Muncul</option>
                                                        <option value={1}>1 - Muncul Sebagian</option>
                                                        <option value={2}>2 - Muncul Penuh</option>
                                                    </select>
                                                </div>
                                                <div className={styles.indicatorInput}>
                                                    <label>Generalization</label>
                                                    <select
                                                        value={formData.ct_indicators.generalization}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            ct_indicators: { ...formData.ct_indicators, generalization: parseInt(e.target.value) }
                                                        })}
                                                    >
                                                        <option value={0}>0 - Tidak Muncul</option>
                                                        <option value={1}>1 - Muncul Sebagian</option>
                                                        <option value={2}>2 - Muncul Penuh</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className={styles.scoreGuide}>
                                                <span>0 = Tidak Muncul</span>
                                                <span>1 = Muncul Sebagian</span>
                                                <span>2 = Muncul Penuh</span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Critical Thinking Indicators */}
                                    {formData.indicator_type === 'critical_thinking' && (
                                        <div className={`${styles.indicatorSection} ${styles.criticalSection}`}>
                                            <h4>Indikator Critical Thinking</h4>
                                            <div className={styles.indicatorInputGrid}>
                                                <div className={styles.indicatorInput}>
                                                    <label>Interpretation</label>
                                                    <select
                                                        value={formData.critical_indicators.interpretation}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            critical_indicators: { ...formData.critical_indicators, interpretation: parseInt(e.target.value) }
                                                        })}
                                                    >
                                                        <option value={0}>0 - Tidak Muncul</option>
                                                        <option value={1}>1 - Muncul Sebagian</option>
                                                        <option value={2}>2 - Muncul Penuh</option>
                                                    </select>
                                                </div>
                                                <div className={styles.indicatorInput}>
                                                    <label>Analysis</label>
                                                    <select
                                                        value={formData.critical_indicators.analysis}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            critical_indicators: { ...formData.critical_indicators, analysis: parseInt(e.target.value) }
                                                        })}
                                                    >
                                                        <option value={0}>0 - Tidak Muncul</option>
                                                        <option value={1}>1 - Muncul Sebagian</option>
                                                        <option value={2}>2 - Muncul Penuh</option>
                                                    </select>
                                                </div>
                                                <div className={styles.indicatorInput}>
                                                    <label>Evaluation</label>
                                                    <select
                                                        value={formData.critical_indicators.evaluation}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            critical_indicators: { ...formData.critical_indicators, evaluation: parseInt(e.target.value) }
                                                        })}
                                                    >
                                                        <option value={0}>0 - Tidak Muncul</option>
                                                        <option value={1}>1 - Muncul Sebagian</option>
                                                        <option value={2}>2 - Muncul Penuh</option>
                                                    </select>
                                                </div>
                                                <div className={styles.indicatorInput}>
                                                    <label>Inference</label>
                                                    <select
                                                        value={formData.critical_indicators.inference}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            critical_indicators: { ...formData.critical_indicators, inference: parseInt(e.target.value) }
                                                        })}
                                                    >
                                                        <option value={0}>0 - Tidak Muncul</option>
                                                        <option value={1}>1 - Muncul Sebagian</option>
                                                        <option value={2}>2 - Muncul Penuh</option>
                                                    </select>
                                                </div>
                                                <div className={styles.indicatorInput}>
                                                    <label>Explanation</label>
                                                    <select
                                                        value={formData.critical_indicators.explanation}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            critical_indicators: { ...formData.critical_indicators, explanation: parseInt(e.target.value) }
                                                        })}
                                                    >
                                                        <option value={0}>0 - Tidak Muncul</option>
                                                        <option value={1}>1 - Muncul Sebagian</option>
                                                        <option value={2}>2 - Muncul Penuh</option>
                                                    </select>
                                                </div>
                                                <div className={styles.indicatorInput}>
                                                    <label>Self-Regulation</label>
                                                    <select
                                                        value={formData.critical_indicators.self_regulation}
                                                        onChange={(e) => setFormData({
                                                            ...formData,
                                                            critical_indicators: { ...formData.critical_indicators, self_regulation: parseInt(e.target.value) }
                                                        })}
                                                    >
                                                        <option value={0}>0 - Tidak Muncul</option>
                                                        <option value={1}>1 - Muncul Sebagian</option>
                                                        <option value={2}>2 - Muncul Penuh</option>
                                                    </select>
                                                </div>
                                            </div>
                                            <div className={styles.scoreGuide}>
                                                <span>0 = Tidak Muncul</span>
                                                <span>1 = Muncul Sebagian</span>
                                                <span>2 = Muncul Penuh</span>
                                            </div>
                                        </div>
                                    )}

                                    <div className={styles.formGroup}>
                                        <label>Catatan Bukti</label>
                                        <textarea
                                            value={formData.evidence_notes}
                                            onChange={(e) => setFormData({ ...formData, evidence_notes: e.target.value })}
                                            placeholder="Catatan bukti atau justifikasi penilaian..."
                                        />
                                    </div>
                                </div>
                                <div className={styles.modalFooter}>
                                    <button
                                        type="button"
                                        className={styles.cancelBtn}
                                        onClick={() => setShowModal(false)}
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        className={styles.submitBtn}
                                        disabled={submitting}
                                    >
                                        {submitting ? 'Menyimpan...' : 'Simpan'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}
        </div>
    )
}
