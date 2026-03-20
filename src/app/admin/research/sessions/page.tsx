'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiCalendar, FiArrowLeft, FiPlus, FiX,
    FiEye, FiEdit2, FiTrash2, FiInbox, FiChevronLeft, FiChevronRight
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import type { LearningSession } from '@/types/research'
import styles from './page.module.scss'

interface User {
    id: string
    name: string
    email: string
}

interface Course {
    id: string
    title: string
}

interface SessionWithRelations extends LearningSession {
    users?: { name: string; email: string }
    courses?: { title: string }
    // Additional fields from database that may not be in base type
    topic_focus?: string
    duration_minutes?: number | null
    status?: 'active' | 'completed' | 'paused'
}

interface SessionFormData {
    user_id: string
    course_id: string
    session_number: number
    session_date: string
    topic_focus: string
    duration_minutes: number | null
    status: 'active' | 'completed' | 'paused'
    notes: string
}

const ITEMS_PER_PAGE = 10

export default function SessionsPage() {
    const router = useRouter()
    const { admin, loading: authLoading } = useAdmin()
    const [sessions, setSessions] = useState<SessionWithRelations[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [courses, setCourses] = useState<Course[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [showModal, setShowModal] = useState(false)
    const [modalMode, setModalMode] = useState<'add' | 'edit' | 'view'>('add')
    const [selectedSession, setSelectedSession] = useState<SessionWithRelations | null>(null)
    const [submitting, setSubmitting] = useState(false)
    const [filterStatus, setFilterStatus] = useState<string>('')
    const [currentPage, setCurrentPage] = useState(1)
    const [totalCount, setTotalCount] = useState(0)
    const [formData, setFormData] = useState<SessionFormData>({
        user_id: '',
        course_id: '',
        session_number: 1,
        session_date: new Date().toISOString().split('T')[0],
        topic_focus: '',
        duration_minutes: null,
        status: 'active',
        notes: ''
    })

    // Fetch users for dropdown
    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/users?limit=100', { credentials: 'include' })
            const data = await res.json()
            if (res.ok && data.users) {
                setUsers(data.users)
            }
        } catch (err) {
            console.error('Error fetching users:', err)
        }
    }, [])

    // Fetch courses for dropdown
    const fetchCourses = useCallback(async () => {
        try {
            const res = await fetch('/api/courses?limit=100', { credentials: 'include' })
            const data = await res.json()
            if (res.ok && data.courses) {
                setCourses(data.courses)
            }
        } catch (err) {
            console.error('Error fetching courses:', err)
        }
    }, [])

    const fetchSessions = useCallback(async () => {
        try {
            setLoading(true)
            setError(null)

            const offset = (currentPage - 1) * ITEMS_PER_PAGE
            let url = `/api/admin/research/sessions?limit=${ITEMS_PER_PAGE}&offset=${offset}`
            if (filterStatus) {
                url += `&status=${filterStatus}`
            }

            const res = await fetch(url, { credentials: 'include' })
            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Gagal memuat data')
            }

            setSessions(data.data || [])
            setTotalCount(data.total || data.data?.length || 0)
        } catch (err) {
            console.error('Error fetching sessions:', err)
            setError(err instanceof Error ? err.message : 'Gagal memuat data')
        } finally {
            setLoading(false)
        }
    }, [filterStatus, currentPage])

    useEffect(() => {
        if (!authLoading && admin) {
            fetchSessions()
            fetchUsers()
            fetchCourses()
        }
    }, [authLoading, admin, fetchSessions, fetchUsers, fetchCourses])

    const resetForm = () => {
        setFormData({
            user_id: '',
            course_id: '',
            session_number: 1,
            session_date: new Date().toISOString().split('T')[0],
            topic_focus: '',
            duration_minutes: null,
            status: 'active',
            notes: ''
        })
    }

    const openAddModal = () => {
        resetForm()
        setModalMode('add')
        setSelectedSession(null)
        setShowModal(true)
    }

    const openViewModal = (session: SessionWithRelations) => {
        setSelectedSession(session)
        setModalMode('view')
        setShowModal(true)
    }

    const openEditModal = (session: SessionWithRelations) => {
        setSelectedSession(session)
        setFormData({
            user_id: session.user_id,
            course_id: session.course_id,
            session_number: session.session_number,
            session_date: session.session_date.split('T')[0],
            topic_focus: session.topic_focus || '',
            duration_minutes: session.duration_minutes || null,
            status: session.status || 'active',
            notes: session.researcher_notes || ''
        })
        setModalMode('edit')
        setShowModal(true)
    }

    const handleDelete = async (session: SessionWithRelations) => {
        if (!confirm(`Apakah Anda yakin ingin menghapus sesi #${session.session_number}?`)) {
            return
        }

        try {
            const res = await fetch(`/api/admin/research/sessions?id=${session.id}`, {
                method: 'DELETE',
                credentials: 'include'
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Gagal menghapus data')
            }

            setError(null)
            fetchSessions()
        } catch (err) {
            console.error('Error deleting session:', err)
            setError(err instanceof Error ? err.message : 'Gagal menghapus data')
        }
    }

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSubmitting(true)
        setError(null)

        try {
            const url = modalMode === 'edit' && selectedSession
                ? `/api/admin/research/sessions?id=${selectedSession.id}`
                : '/api/admin/research/sessions'

            const res = await fetch(url, {
                method: modalMode === 'edit' ? 'PUT' : 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    ...formData,
                    researcher_notes: formData.notes
                })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Gagal menyimpan data')
            }

            setShowModal(false)
            resetForm()
            fetchSessions()
        } catch (err) {
            console.error('Error saving session:', err)
            setError(err instanceof Error ? err.message : 'Gagal menyimpan data')
        } finally {
            setSubmitting(false)
        }
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'active':
                return <span className={`${styles.sessionBadge} ${styles.sessionActive}`}>Aktif</span>
            case 'completed':
                return <span className={`${styles.sessionBadge} ${styles.sessionCompleted}`}>Selesai</span>
            case 'paused':
                return <span className={`${styles.sessionBadge} ${styles.sessionPaused}`}>Dijeda</span>
            default:
                return <span className={styles.sessionBadge}>{status}</span>
        }
    }

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
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
                        <span className={styles.headerIcon}><FiCalendar /></span>
                        Sesi Pembelajaran
                    </h2>
                    <p className={styles.headerSub}>
                        Kelola sesi pembelajaran longitudinal untuk penelitian
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
                        <FiPlus /> Tambah Sesi
                    </button>
                </div>
            </div>

            {error && <div className={styles.errorCard}>{error}</div>}

            {/* Filters */}
            <div className={styles.filters}>
                <div className={styles.filterGroup}>
                    <label>Status</label>
                    <select
                        value={filterStatus}
                        onChange={(e) => {
                            setFilterStatus(e.target.value)
                            setCurrentPage(1)
                        }}
                    >
                        <option value="">Semua Status</option>
                        <option value="active">Aktif</option>
                        <option value="completed">Selesai</option>
                        <option value="paused">Dijeda</option>
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className={styles.tableContainer}>
                {loading ? (
                    <div className={styles.loading}>Memuat data...</div>
                ) : sessions.length === 0 ? (
                    <div className={styles.emptyState}>
                        <FiInbox />
                        <h3>Belum ada sesi</h3>
                        <p>Klik &quot;Tambah Sesi&quot; untuk membuat sesi pembelajaran baru</p>
                    </div>
                ) : (
                    <>
                        <table className={styles.table}>
                            <thead>
                                <tr>
                                    <th>Siswa</th>
                                    <th>Kursus</th>
                                    <th>Sesi #</th>
                                    <th>Tanggal</th>
                                    <th>Topik</th>
                                    <th>Durasi</th>
                                    <th>Status</th>
                                    <th>Aksi</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sessions.map((session) => (
                                    <tr key={session.id}>
                                        <td>
                                            <div className={styles.userCell}>
                                                <span className={styles.userName}>
                                                    {session.users?.name || 'Unknown'}
                                                </span>
                                                <span className={styles.userEmail}>
                                                    {session.users?.email || session.user_id.slice(0, 8)}
                                                </span>
                                            </div>
                                        </td>
                                        <td>{session.courses?.title || session.course_id.slice(0, 8)}</td>
                                        <td>#{session.session_number}</td>
                                        <td>{formatDate(session.session_date)}</td>
                                        <td>{session.topic_focus || '-'}</td>
                                        <td>{session.duration_minutes ? `${session.duration_minutes} menit` : '-'}</td>
                                        <td>{getStatusBadge(session.status || 'active')}</td>
                                        <td>
                                            <div className={styles.actionBtns}>
                                                <button
                                                    className={`${styles.actionBtn} ${styles.viewBtn}`}
                                                    onClick={() => openViewModal(session)}
                                                    title="Lihat Detail"
                                                >
                                                    <FiEye />
                                                </button>
                                                <button
                                                    className={`${styles.actionBtn} ${styles.editBtn}`}
                                                    onClick={() => openEditModal(session)}
                                                    title="Edit"
                                                >
                                                    <FiEdit2 />
                                                </button>
                                                <button
                                                    className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                    onClick={() => handleDelete(session)}
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
                                {modalMode === 'add' && 'Tambah Sesi Pembelajaran'}
                                {modalMode === 'edit' && 'Edit Sesi Pembelajaran'}
                                {modalMode === 'view' && 'Detail Sesi Pembelajaran'}
                            </h3>
                            <button className={styles.closeBtn} onClick={() => setShowModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        {modalMode === 'view' && selectedSession ? (
                            <div className={styles.modalBody}>
                                <div className={styles.viewGrid}>
                                    <div className={styles.viewItem}>
                                        <label>Siswa</label>
                                        <p>{selectedSession.users?.name || 'Unknown'}</p>
                                        <small>{selectedSession.users?.email || selectedSession.user_id}</small>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Kursus</label>
                                        <p>{selectedSession.courses?.title || selectedSession.course_id}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Nomor Sesi</label>
                                        <p>#{selectedSession.session_number}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Tanggal</label>
                                        <p>{formatDate(selectedSession.session_date)}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Fokus Topik</label>
                                        <p>{selectedSession.topic_focus || '-'}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Durasi</label>
                                        <p>{selectedSession.duration_minutes ? `${selectedSession.duration_minutes} menit` : '-'}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Status</label>
                                        <p>{getStatusBadge(selectedSession.status || 'active')}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Total Prompts</label>
                                        <p>{selectedSession.total_prompts || 0}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Total Revisions</label>
                                        <p>{selectedSession.total_revisions || 0}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Dominant Stage</label>
                                        <p>{selectedSession.dominant_stage || '-'}</p>
                                    </div>
                                    {selectedSession.researcher_notes && (
                                        <div className={`${styles.viewItem} ${styles.fullWidth}`}>
                                            <label>Catatan Peneliti</label>
                                            <p>{selectedSession.researcher_notes}</p>
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
                                        onClick={() => openEditModal(selectedSession)}
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit}>
                                <div className={styles.modalBody}>
                                    <div className={styles.formGroup}>
                                        <label>Siswa *</label>
                                        <select
                                            value={formData.user_id}
                                            onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                                            required
                                        >
                                            <option value="">Pilih Siswa</option>
                                            {users.map((user) => (
                                                <option key={user.id} value={user.id}>
                                                    {user.name} ({user.email})
                                                </option>
                                            ))}
                                        </select>
                                        {users.length === 0 && (
                                            <small className={styles.helpText}>
                                                Atau masukkan UUID manual:
                                                <input
                                                    type="text"
                                                    value={formData.user_id}
                                                    onChange={(e) => setFormData({ ...formData, user_id: e.target.value })}
                                                    placeholder="UUID siswa"
                                                    style={{ marginTop: '4px' }}
                                                />
                                            </small>
                                        )}
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Kursus *</label>
                                        <select
                                            value={formData.course_id}
                                            onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
                                            required
                                        >
                                            <option value="">Pilih Kursus</option>
                                            {courses.map((course) => (
                                                <option key={course.id} value={course.id}>
                                                    {course.title}
                                                </option>
                                            ))}
                                        </select>
                                        {courses.length === 0 && (
                                            <small className={styles.helpText}>
                                                Atau masukkan UUID manual:
                                                <input
                                                    type="text"
                                                    value={formData.course_id}
                                                    onChange={(e) => setFormData({ ...formData, course_id: e.target.value })}
                                                    placeholder="UUID kursus"
                                                    style={{ marginTop: '4px' }}
                                                />
                                            </small>
                                        )}
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Nomor Sesi *</label>
                                        <input
                                            type="number"
                                            min="1"
                                            value={formData.session_number}
                                            onChange={(e) => setFormData({ ...formData, session_number: parseInt(e.target.value) })}
                                            required
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Tanggal Sesi *</label>
                                        <input
                                            type="date"
                                            value={formData.session_date}
                                            onChange={(e) => setFormData({ ...formData, session_date: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Fokus Topik</label>
                                        <input
                                            type="text"
                                            value={formData.topic_focus}
                                            onChange={(e) => setFormData({ ...formData, topic_focus: e.target.value })}
                                            placeholder="Topik yang dipelajari"
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Durasi (menit)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={formData.duration_minutes || ''}
                                            onChange={(e) => setFormData({ ...formData, duration_minutes: e.target.value ? parseInt(e.target.value) : null })}
                                            placeholder="Durasi dalam menit"
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Status</label>
                                        <select
                                            value={formData.status}
                                            onChange={(e) => setFormData({ ...formData, status: e.target.value as 'active' | 'completed' | 'paused' })}
                                        >
                                            <option value="active">Aktif</option>
                                            <option value="completed">Selesai</option>
                                            <option value="paused">Dijeda</option>
                                        </select>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Catatan</label>
                                        <textarea
                                            value={formData.notes}
                                            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                            placeholder="Catatan tambahan..."
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
