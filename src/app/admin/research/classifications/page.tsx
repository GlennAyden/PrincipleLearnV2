'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiTag, FiArrowLeft, FiPlus, FiX,
    FiEye, FiEdit2, FiTrash2, FiInbox, FiChevronLeft, FiChevronRight
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import type { PromptStage, MicroMarker } from '@/types/research'
import { PROMPT_STAGE_LABELS, PROMPT_STAGE_DESCRIPTIONS, MICRO_MARKER_LABELS } from '@/types/research'
import styles from './page.module.scss'

interface LearningSessionOption {
    id: string
    session_number: number
    users?: { name: string }
    courses?: { title: string }
}

interface PromptClassification {
    id: string
    session_id: string
    prompt_text: string
    prompt_sequence: number
    prompt_stage: PromptStage
    micro_markers: MicroMarker[]
    cognitive_depth_level: number
    classification_rationale: string | null
    classified_by: string
    confidence_score: number | null
    created_at: string
    learning_sessions?: {
        session_number: number
        users?: { name: string }
    }
}

interface ClassificationFormData {
    session_id: string
    prompt_text: string
    prompt_sequence: number
    prompt_stage: PromptStage
    micro_markers: MicroMarker[]
    cognitive_depth_level: number
    classification_rationale: string
    classified_by: string
    confidence_score: number | null
}

const ITEMS_PER_PAGE = 10

export default function ClassificationsPage() {
    const router = useRouter()
    const { admin, loading: authLoading } = useAdmin()
    const [classifications, setClassifications] = useState<PromptClassification[]>([])
    const [sessions, setSessions] = useState<LearningSessionOption[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [modalMode, setModalMode] = useState<'add' | 'edit' | 'view'>('add')
    const [selectedItem, setSelectedItem] = useState<PromptClassification | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [filterStage, setFilterStage] = useState<string>('')
    const [currentPage, setCurrentPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)
    const [formData, setFormData] = useState<ClassificationFormData>({
        session_id: '',
        prompt_text: '',
        prompt_sequence: 1,
        prompt_stage: 'SCP',
        micro_markers: [],
        cognitive_depth_level: 1,
        classification_rationale: '',
        classified_by: 'admin',
        confidence_score: null
    })

    // Fetch sessions for dropdown
    const fetchSessions = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/research/sessions?limit=100', { credentials: 'include' })
            const data = await res.json()
            if (res.ok && data.data) {
                setSessions(data.data)
            }
        } catch (err) {
            console.error('Error fetching sessions:', err)
        }
    }, [])

    const fetchClassifications = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            const offset = (currentPage - 1) * ITEMS_PER_PAGE
            let url = `/api/admin/research/classifications?limit=${ITEMS_PER_PAGE}&offset=${offset}`
            if (filterStage) {
                url += `&stage=${filterStage}`
            }

            const res = await fetch(url, { credentials: 'include' })
            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Gagal memuat data')
            }

            setClassifications(data.data || [])
            setTotalCount(data.total || data.data?.length || 0)
        } catch (err) {
            console.error('Error fetching classifications:', err)
            setError(err instanceof Error ? err.message : 'Gagal memuat data')
        } finally {
            setLoading(false)
        }
    }, [filterStage, currentPage])

    useEffect(() => {
        if (!authLoading && admin) {
            fetchClassifications()
            fetchSessions()
        }
    }, [authLoading, admin, fetchClassifications, fetchSessions])

    const resetForm = () => {
        setFormData({
            session_id: '',
            prompt_text: '',
            prompt_sequence: 1,
            prompt_stage: 'SCP',
            micro_markers: [],
            cognitive_depth_level: 1,
            classification_rationale: '',
            classified_by: 'admin',
            confidence_score: null
        })
    }

    const openAddModal = () => {
        resetForm()
        setModalMode('add')
        setSelectedItem(null)
        setShowModal(true)
    }

    const openViewModal = (item: PromptClassification) => {
        setSelectedItem(item)
        setModalMode('view')
        setShowModal(true)
    }

    const openEditModal = (item: PromptClassification) => {
        setSelectedItem(item)
        setFormData({
            session_id: item.session_id,
            prompt_text: item.prompt_text,
            prompt_sequence: item.prompt_sequence,
            prompt_stage: item.prompt_stage,
            micro_markers: item.micro_markers || [],
            cognitive_depth_level: item.cognitive_depth_level,
            classification_rationale: item.classification_rationale || '',
            classified_by: item.classified_by,
            confidence_score: item.confidence_score
        })
        setModalMode('edit')
        setShowModal(true)
    }

    const handleDelete = async (item: PromptClassification) => {
        if (!confirm(`Apakah Anda yakin ingin menghapus klasifikasi ini?`)) {
            return
        }

        try {
            const res = await fetch(`/api/admin/research/classifications?id=${item.id}`, {
                method: 'DELETE',
                credentials: 'include'
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Gagal menghapus data')
            }

            setError(null)
            fetchClassifications()
        } catch (err) {
            console.error('Error deleting classification:', err)
            setError(err instanceof Error ? err.message : 'Gagal menghapus data')
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        setError(null)

        try {
            const url = modalMode === 'edit' && selectedItem
                ? `/api/admin/research/classifications?id=${selectedItem.id}`
                : '/api/admin/research/classifications'

            const res = await fetch(url, {
                method: modalMode === 'edit' ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(formData)
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Gagal menyimpan data')
            }

            setShowModal(false)
            resetForm()
            fetchClassifications()
        } catch (err) {
            console.error('Error saving classification:', err)
            setError(err instanceof Error ? err.message : 'Gagal menyimpan data')
        } finally {
            setSubmitting(false)
        }
    }

    const handleMarkerToggle = (marker: MicroMarker) => {
        setFormData(prev => ({
            ...prev,
            micro_markers: prev.micro_markers.includes(marker)
                ? prev.micro_markers.filter(m => m !== marker)
                : [...prev.micro_markers, marker]
        }))
    }

    const getStageBadge = (stage: PromptStage) => {
        const stageClass = {
            SCP: styles.stageSCP,
            SRP: styles.stageSRP,
            MQP: styles.stageMQP,
            REFLECTIVE: styles.stageREFLECTIVE
        }
        return <span className={`${styles.stageBadge} ${stageClass[stage]}`}>{stage}</span>
    }

    const getDepthBadge = (level: number) => {
        const depthClass = {
            1: styles.depth1,
            2: styles.depth2,
            3: styles.depth3,
            4: styles.depth4
        }
        return <span className={`${styles.depthBadge} ${depthClass[level as keyof typeof depthClass] || ''}`}>{level}</span>
    }

    const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE)

    if (authLoading) {
        return <div className={styles.loading}>Memuat...</div>
    }

    return (
        <div className={styles.page}>
            {/* Header */}
            <div className={styles.header}>
                <div>
                    <h2>
                        <span className={styles.headerIcon}><FiTag /></span>
                        Klasifikasi Prompt
                    </h2>
                    <p className={styles.headerSub}>
                        Klasifikasi tahap perkembangan prompt siswa (SCP → SRP → MQP → Reflective)
                    </p>
                </div>
                <div className={styles.headerActions}>
                    <button
                        className={styles.backBtn}
                        onClick={() => router.push('/admin/research')}
                    >
                        <FiArrowLeft /> Kembali
                    </button>
                    <button
                        className={styles.addBtn}
                        onClick={openAddModal}
                    >
                        <FiPlus /> Tambah Klasifikasi
                    </button>
                </div>
            </div>

            {error && <div className={styles.errorCard}>{error}</div>}

            {/* Filters */}
            <div className={styles.filters}>
                <div className={styles.filterGroup}>
                    <label>Tahap Prompt</label>
                    <select
                        value={filterStage}
                        onChange={(e) => {
                            setFilterStage(e.target.value)
                            setCurrentPage(1)
                        }}
                    >
                        <option value="">Semua Tahap</option>
                        <option value="SCP">SCP</option>
                        <option value="SRP">SRP</option>
                        <option value="MQP">MQP</option>
                        <option value="REFLECTIVE">Reflective</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className={styles.tableContainer}>
                {loading ? (
                    <div className={styles.loading}>Memuat data...</div>
                ) : classifications.length === 0 ? (
                    <div className={styles.emptyState}>
                        <FiInbox />
                        <h3>Belum ada klasifikasi</h3>
                        <p>Klik &quot;Tambah Klasifikasi&quot; untuk menambah data baru</p>
                    </div>
                ) : (
                    <>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Sesi</th>
                                    <th>Prompt</th>
                                    <th>Seq</th>
                                    <th>Tahap</th>
                                    <th>Micro Markers</th>
                                    <th>Depth</th>
                                    <th>Confidence</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {classifications.map((item) => (
                                    <tr key={item.id}>
                                        <td>
                                            #{item.learning_sessions?.session_number || '-'}
                                            {item.learning_sessions?.users?.name && (
                                                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                                    {item.learning_sessions.users.name}
                                                </div>
                                            )}
                                        </td>
                                        <td>
                                            <div className={styles.promptText} title={item.prompt_text}>
                                                {item.prompt_text}
                                            </div>
                                        </td>
                                        <td>#{item.prompt_sequence}</td>
                                        <td>{getStageBadge(item.prompt_stage)}</td>
                                        <td>
                                            {item.micro_markers?.map((marker) => (
                                                <span key={marker} className={styles.markerBadge}>
                                                    {marker}
                                                </span>
                                            ))}
                                            {(!item.micro_markers || item.micro_markers.length === 0) && '-'}
                                        </td>
                                        <td>{getDepthBadge(item.cognitive_depth_level)}</td>
                                        <td>
                                            {item.confidence_score !== null ? (
                                                <div className={styles.confidenceBar}>
                                                    <div
                                                        className={styles.confidenceFill}
                                                        style={{ width: `${item.confidence_score * 100}%` }}
                                                    />
                                                </div>
                                            ) : '-'}
                                        </td>
                                        <td>
                                            <div className={styles.actionBtns}>
                                                <button
                                                    className={`${styles.actionBtn} ${styles.viewBtn}`}
                                                    onClick={() => openViewModal(item)}
                                                    title="Lihat Detail"
                                                >
                                                    <FiEye />
                                                </button>
                                                <button
                                                    className={`${styles.actionBtn} ${styles.editBtn}`}
                                                    onClick={() => openEditModal(item)}
                                                    title="Edit"
                                                >
                                                    <FiEdit2 />
                                                </button>
                                                <button
                                                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                    onClick={() => handleDelete(item)}
                                                    title="Hapus"
                                                >
                                                    <FiTrash2 />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>

                        {/* Pagination */}
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

            {/* Modal */}
            {showModal && (
                <div className={styles.modalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>
                                {modalMode === 'add' && 'Tambah Klasifikasi Prompt'}
                                {modalMode === 'edit' && 'Edit Klasifikasi Prompt'}
                                {modalMode === 'view' && 'Detail Klasifikasi Prompt'}
                            </h3>
                            <button className={styles.closeBtn} onClick={() => setShowModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        {modalMode === 'view' && selectedItem ? (
                            <div className={styles.modalBody}>
                                <div className={styles.viewGrid}>
                                    <div className={styles.viewItem}>
                                        <label>Sesi</label>
                                        <p>#{selectedItem.learning_sessions?.session_number || '-'}</p>
                                        <small>{selectedItem.learning_sessions?.users?.name || selectedItem.session_id}</small>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Urutan</label>
                                        <p>#{selectedItem.prompt_sequence}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Tahap Prompt</label>
                                        <p>{getStageBadge(selectedItem.prompt_stage)}</p>
                                        <small>{PROMPT_STAGE_LABELS[selectedItem.prompt_stage]}</small>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Cognitive Depth</label>
                                        <p>{getDepthBadge(selectedItem.cognitive_depth_level)}</p>
                                    </div>
                                    <div className={`${styles.viewItem} ${styles.fullWidth}`}>
                                        <label>Teks Prompt</label>
                                        <p>{selectedItem.prompt_text}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Micro Markers</label>
                                        <p>
                                            {selectedItem.micro_markers?.map((marker) => (
                                                <span key={marker} className={styles.markerBadge} style={{ marginRight: '4px' }}>
                                                    {marker} - {MICRO_MARKER_LABELS[marker]}
                                                </span>
                                            ))}
                                            {(!selectedItem.micro_markers || selectedItem.micro_markers.length === 0) && '-'}
                                        </p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Confidence Score</label>
                                        <p>{selectedItem.confidence_score !== null ? `${(selectedItem.confidence_score * 100).toFixed(0)}%` : '-'}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Diklasifikasikan Oleh</label>
                                        <p>{selectedItem.classified_by}</p>
                                    </div>
                                    {selectedItem.classification_rationale && (
                                        <div className={`${styles.viewItem} ${styles.fullWidth}`}>
                                            <label>Rationale</label>
                                            <p>{selectedItem.classification_rationale}</p>
                                        </div>
                                    )}
                                </div>
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
                                        onClick={() => openEditModal(selectedItem)}
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                <div className={styles.modalBody}>
                                    {/* Stage Info */}
                                    <div className={styles.stageInfo}>
                                        <h4>Panduan Tahap Prompt</h4>
                                        <ul>
                                            {(Object.keys(PROMPT_STAGE_LABELS) as PromptStage[]).map((stage) => (
                                                <li key={stage}>
                                                    <strong>{stage}:</strong> {PROMPT_STAGE_DESCRIPTIONS[stage]}
                                                </li>
                                            ))}
                                        </ul>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Sesi Pembelajaran *</label>
                                        <select
                                            value={formData.session_id}
                                            onChange={(e) => setFormData({ ...formData, session_id: e.target.value })}
                                            required
                                        >
                                            <option value="">Pilih Sesi</option>
                                            {sessions.map((session) => (
                                                <option key={session.id} value={session.id}>
                                                    Sesi #{session.session_number} - {session.users?.name || 'Unknown'} ({session.courses?.title || 'Unknown Course'})
                                                </option>
                                            ))}
                                        </select>
                                        {sessions.length === 0 && (
                                            <small className={styles.helpText}>
                                                Atau masukkan UUID manual:
                                                <input
                                                    type="text"
                                                    value={formData.session_id}
                                                    onChange={(e) => setFormData({ ...formData, session_id: e.target.value })}
                                                    placeholder="UUID sesi pembelajaran"
                                                    style={{ marginTop: '4px' }}
                                                />
                                            </small>
                                        )}
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Teks Prompt *</label>
                                        <textarea
                                            value={formData.prompt_text}
                                            onChange={(e) => setFormData({ ...formData, prompt_text: e.target.value })}
                                            placeholder="Masukkan teks prompt siswa..."
                                            required
                                        />
                                    </div>

                                    <div className={styles.formRow}>
                                        <div className={styles.formGroup}>
                                            <label>Urutan Prompt *</label>
                                            <input
                                                type="number"
                                                min="1"
                                                value={formData.prompt_sequence}
                                                onChange={(e) => setFormData({ ...formData, prompt_sequence: parseInt(e.target.value) })}
                                                required
                                            />
                                        </div>

                                        <div className={styles.formGroup}>
                                            <label>Tahap Prompt *</label>
                                            <select
                                                value={formData.prompt_stage}
                                                onChange={(e) => setFormData({ ...formData, prompt_stage: e.target.value as PromptStage })}
                                                required
                                            >
                                                {(Object.keys(PROMPT_STAGE_LABELS) as PromptStage[]).map((stage) => (
                                                    <option key={stage} value={stage}>
                                                        {stage} - {PROMPT_STAGE_LABELS[stage]}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Micro Markers</label>
                                        <div className={styles.checkboxGroup}>
                                            {(Object.keys(MICRO_MARKER_LABELS) as MicroMarker[]).map((marker) => (
                                                <label key={marker} className={styles.checkboxLabel}>
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.micro_markers.includes(marker)}
                                                        onChange={() => handleMarkerToggle(marker)}
                                                    />
                                                    {marker} ({MICRO_MARKER_LABELS[marker]})
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className={styles.formRow}>
                                        <div className={styles.formGroup}>
                                            <label>Cognitive Depth Level (1-4) *</label>
                                            <select
                                                value={formData.cognitive_depth_level}
                                                onChange={(e) => setFormData({ ...formData, cognitive_depth_level: parseInt(e.target.value) })}
                                                required
                                            >
                                                <option value={1}>1 - Dasar Deskriptif</option>
                                                <option value={2}>2 - Analitik Awal</option>
                                                <option value={3}>3 - Analitik-Reflektif</option>
                                                <option value={4}>4 - Metakognitif Mendalam</option>
                                            </select>
                                        </div>

                                        <div className={styles.formGroup}>
                                            <label>Confidence Score (0-1)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="1"
                                                step="0.1"
                                                value={formData.confidence_score || ''}
                                                onChange={(e) => setFormData({ ...formData, confidence_score: e.target.value ? parseFloat(e.target.value) : null })}
                                                placeholder="0.0 - 1.0"
                                            />
                                        </div>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Rationale Klasifikasi</label>
                                        <textarea
                                            value={formData.classification_rationale}
                                            onChange={(e) => setFormData({ ...formData, classification_rationale: e.target.value })}
                                            placeholder="Alasan mengapa prompt diklasifikasikan ke tahap ini..."
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Diklasifikasikan Oleh</label>
                                        <input
                                            type="text"
                                            value={formData.classified_by}
                                            onChange={(e) => setFormData({ ...formData, classified_by: e.target.value })}
                                            placeholder="Nama penilai"
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
