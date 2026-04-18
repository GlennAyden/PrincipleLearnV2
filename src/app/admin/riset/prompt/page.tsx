'use client'

import React, { useEffect, useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
    FiTag, FiArrowLeft, FiPlus, FiX,
    FiEye, FiEdit2, FiTrash2, FiInbox, FiChevronLeft, FiChevronRight,
    FiCalendar, FiChevronDown, FiChevronUp
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import { apiFetch } from '@/lib/api-client'
import type { LearningSession, PromptStage, MicroMarker } from '@/types/research'
import { PROMPT_STAGE_LABELS, PROMPT_STAGE_DESCRIPTIONS, MICRO_MARKER_LABELS } from '@/types/research'
import styles from './page.module.scss'

// ============================================
// INTERFACES — Sessions
// ============================================

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

// ============================================
// INTERFACES — Classifications
// ============================================

interface LearningSessionOption {
    id: string
    session_number: number
    user_id?: string
    course_id?: string
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

// ============================================
// CONSTANTS
// ============================================

const ITEMS_PER_PAGE = 10

export default function PromptEvolutionPage() {
    const router = useRouter()
    const { admin, loading: authLoading } = useAdmin()

    // Section toggle
    const [sessionsSectionOpen, setSessionsSectionOpen] = useState(true)
    const [classificationsSectionOpen, setClassificationsSectionOpen] = useState(true)

    // ============================================
    // SESSION STATE
    // ============================================
    const [sessions, setSessions] = useState<SessionWithRelations[]>([])
    const [users, setUsers] = useState<User[]>([])
    const [courses, setCourses] = useState<Course[]>([])
    const [sessionsLoading, setSessionsLoading] = useState(true)
    const [sessionsError, setSessionsError] = useState<string | null>(null)
    const [showSessionModal, setShowSessionModal] = useState(false)
    const [sessionModalMode, setSessionModalMode] = useState<'add' | 'edit' | 'view'>('add')
    const [selectedSession, setSelectedSession] = useState<SessionWithRelations | null>(null)
    const [sessionSubmitting, setSessionSubmitting] = useState(false)
    const [filterSessionStatus, setFilterSessionStatus] = useState<string>('')
    const [sessionCurrentPage, setSessionCurrentPage] = useState(1)
    const [sessionTotalCount, setSessionTotalCount] = useState(0)
    const [sessionFormData, setSessionFormData] = useState<SessionFormData>({
        user_id: '',
        course_id: '',
        session_number: 1,
        session_date: new Date().toISOString().split('T')[0],
        topic_focus: '',
        duration_minutes: null,
        status: 'active',
        notes: ''
    })

    // ============================================
    // CLASSIFICATION STATE
    // ============================================
    const [classifications, setClassifications] = useState<PromptClassification[]>([])
    const [classificationSessions, setClassificationSessions] = useState<LearningSessionOption[]>([])
    const [classificationsLoading, setClassificationsLoading] = useState(true)
    const [classificationsError, setClassificationsError] = useState<string | null>(null)
    const [showClassificationModal, setShowClassificationModal] = useState(false)
    const [classificationModalMode, setClassificationModalMode] = useState<'add' | 'edit' | 'view'>('add')
    const [selectedClassification, setSelectedClassification] = useState<PromptClassification | null>(null)
    const [classificationSubmitting, setClassificationSubmitting] = useState(false)
    const [filterStage, setFilterStage] = useState<string>('')
    const [classificationCurrentPage, setClassificationCurrentPage] = useState(1)
    const [classificationTotalCount, setClassificationTotalCount] = useState(0)
    const [classificationFormData, setClassificationFormData] = useState<ClassificationFormData>({
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

    const userById = React.useMemo(() => new Map(users.map(user => [user.id, user])), [users])
    const courseById = React.useMemo(() => new Map(courses.map(course => [course.id, course])), [courses])

    const getSessionUser = useCallback((session: { user_id?: string; users?: { name?: string; email?: string } }) => {
        const fallback = session.user_id ? userById.get(session.user_id) : undefined
        return {
            name: session.users?.name || fallback?.name || 'Unknown',
            email: session.users?.email || fallback?.email || (session.user_id ? session.user_id.slice(0, 8) : '-')
        }
    }, [userById])

    const getSessionCourse = useCallback((session: { course_id?: string; courses?: { title?: string } }) => {
        const fallback = session.course_id ? courseById.get(session.course_id) : undefined
        return {
            title: session.courses?.title || fallback?.title || (session.course_id ? session.course_id.slice(0, 8) : 'Kursus tidak diketahui')
        }
    }, [courseById])

    // ============================================
    // FETCH FUNCTIONS — Sessions
    // ============================================

    const fetchUsers = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/users?limit=100', { credentials: 'include' })
            const data = await res.json()
            if (res.ok && Array.isArray(data)) {
                setUsers(data)
            }
        } catch (err) {
            console.error('Error fetching users:', err)
        }
    }, [])

    const fetchCourses = useCallback(async () => {
        try {
            // Use admin endpoint so adminDb bypasses RLS (courses_read_own only
            // returns courses created by the admin's own user id).
            const res = await fetch('/api/admin/activity/courses', { credentials: 'include' })
            const data = await res.json()
            if (res.ok && Array.isArray(data?.courses)) {
                setCourses(data.courses)
            }
        } catch (err) {
            console.error('Error fetching courses:', err)
        }
    }, [])

    const fetchSessions = useCallback(async () => {
        try {
            setSessionsLoading(true)
            setSessionsError(null)

            const offset = (sessionCurrentPage - 1) * ITEMS_PER_PAGE
            let url = `/api/admin/research/sessions?limit=${ITEMS_PER_PAGE}&offset=${offset}`
            if (filterSessionStatus) {
                url += `&status=${filterSessionStatus}`
            }

            const res = await fetch(url, { credentials: 'include' })
            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Gagal memuat data')
            }

            setSessions(data.data || [])
            setSessionTotalCount(data.total || data.data?.length || 0)
        } catch (err) {
            console.error('Error fetching sessions:', err)
            setSessionsError(err instanceof Error ? err.message : 'Gagal memuat data')
        } finally {
            setSessionsLoading(false)
        }
    }, [filterSessionStatus, sessionCurrentPage])

    // ============================================
    // FETCH FUNCTIONS — Classifications
    // ============================================

    const fetchClassificationSessions = useCallback(async () => {
        try {
            const res = await fetch('/api/admin/research/sessions?limit=100', { credentials: 'include' })
            const data = await res.json()
            if (res.ok && data.data) {
                setClassificationSessions(data.data)
            }
        } catch (err) {
            console.error('Error fetching sessions:', err)
        }
    }, [])

    const fetchClassifications = useCallback(async () => {
        try {
            setClassificationsLoading(true)
            setClassificationsError(null)

            const offset = (classificationCurrentPage - 1) * ITEMS_PER_PAGE
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
            setClassificationTotalCount(data.total || data.data?.length || 0)
        } catch (err) {
            console.error('Error fetching classifications:', err)
            setClassificationsError(err instanceof Error ? err.message : 'Gagal memuat data')
        } finally {
            setClassificationsLoading(false)
        }
    }, [filterStage, classificationCurrentPage])

    // ============================================
    // EFFECTS
    // ============================================

    useEffect(() => {
        if (!authLoading && admin) {
            fetchSessions()
            fetchUsers()
            fetchCourses()
            fetchClassifications()
            fetchClassificationSessions()
        }
    }, [authLoading, admin, fetchSessions, fetchUsers, fetchCourses, fetchClassifications, fetchClassificationSessions])

    // ============================================
    // SESSION HANDLERS
    // ============================================

    const resetSessionForm = () => {
        setSessionFormData({
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

    const openAddSessionModal = () => {
        resetSessionForm()
        setSessionModalMode('add')
        setSelectedSession(null)
        setShowSessionModal(true)
    }

    const openViewSessionModal = (session: SessionWithRelations) => {
        setSelectedSession(session)
        setSessionModalMode('view')
        setShowSessionModal(true)
    }

    const openEditSessionModal = (session: SessionWithRelations) => {
        setSelectedSession(session)
        setSessionFormData({
            user_id: session.user_id,
            course_id: session.course_id,
            session_number: session.session_number,
            session_date: session.session_date.split('T')[0],
            topic_focus: session.topic_focus || '',
            duration_minutes: session.duration_minutes || null,
            status: session.status || 'active',
            notes: session.researcher_notes || ''
        })
        setSessionModalMode('edit')
        setShowSessionModal(true)
    }

    const handleDeleteSession = async (session: SessionWithRelations) => {
        if (!confirm(`Apakah Anda yakin ingin menghapus sesi #${session.session_number}?`)) {
            return
        }

        try {
            const res = await apiFetch(`/api/admin/research/sessions?id=${session.id}`, {
                method: 'DELETE'
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Gagal menghapus data')
            }

            setSessionsError(null)
            fetchSessions()
        } catch (err) {
            console.error('Error deleting session:', err)
            setSessionsError(err instanceof Error ? err.message : 'Gagal menghapus data')
        }
    }

    const handleSessionSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setSessionSubmitting(true)
        setSessionsError(null)

        try {
            const url = sessionModalMode === 'edit' && selectedSession
                ? `/api/admin/research/sessions?id=${selectedSession.id}`
                : '/api/admin/research/sessions'

            const res = await apiFetch(url, {
                method: sessionModalMode === 'edit' ? 'PUT' : 'POST',
                body: JSON.stringify({
                    ...(sessionModalMode === 'edit' && selectedSession ? { id: selectedSession.id } : {}),
                    ...sessionFormData,
                    researcher_notes: sessionFormData.notes
                })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Gagal menyimpan data')
            }

            setShowSessionModal(false)
            resetSessionForm()
            fetchSessions()
        } catch (err) {
            console.error('Error saving session:', err)
            setSessionsError(err instanceof Error ? err.message : 'Gagal menyimpan data')
        } finally {
            setSessionSubmitting(false)
        }
    }

    // ============================================
    // CLASSIFICATION HANDLERS
    // ============================================

    const resetClassificationForm = () => {
        setClassificationFormData({
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

    const openAddClassificationModal = () => {
        resetClassificationForm()
        setClassificationModalMode('add')
        setSelectedClassification(null)
        setShowClassificationModal(true)
    }

    const openViewClassificationModal = (item: PromptClassification) => {
        setSelectedClassification(item)
        setClassificationModalMode('view')
        setShowClassificationModal(true)
    }

    const openEditClassificationModal = (item: PromptClassification) => {
        setSelectedClassification(item)
        setClassificationFormData({
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
        setClassificationModalMode('edit')
        setShowClassificationModal(true)
    }

    const handleDeleteClassification = async (item: PromptClassification) => {
        if (!confirm('Apakah Anda yakin ingin menghapus klasifikasi ini?')) {
            return
        }

        try {
            const res = await apiFetch(`/api/admin/research/classifications?id=${item.id}`, {
                method: 'DELETE'
            })

            if (!res.ok) {
                const data = await res.json()
                throw new Error(data.error || 'Gagal menghapus data')
            }

            setClassificationsError(null)
            fetchClassifications()
        } catch (err) {
            console.error('Error deleting classification:', err)
            setClassificationsError(err instanceof Error ? err.message : 'Gagal menghapus data')
        }
    }

    const handleClassificationSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setClassificationSubmitting(true)
        setClassificationsError(null)

        try {
            const url = classificationModalMode === 'edit' && selectedClassification
                ? `/api/admin/research/classifications?id=${selectedClassification.id}`
                : '/api/admin/research/classifications'

            const res = await apiFetch(url, {
                method: classificationModalMode === 'edit' ? 'PUT' : 'POST',
                body: JSON.stringify({
                    ...(classificationModalMode === 'edit' && selectedClassification ? { id: selectedClassification.id } : {}),
                    ...classificationFormData
                })
            })

            const data = await res.json()

            if (!res.ok) {
                throw new Error(data.error || 'Gagal menyimpan data')
            }

            setShowClassificationModal(false)
            resetClassificationForm()
            fetchClassifications()
        } catch (err) {
            console.error('Error saving classification:', err)
            setClassificationsError(err instanceof Error ? err.message : 'Gagal menyimpan data')
        } finally {
            setClassificationSubmitting(false)
        }
    }

    const handleMarkerToggle = (marker: MicroMarker) => {
        setClassificationFormData(prev => ({
            ...prev,
            micro_markers: prev.micro_markers.includes(marker)
                ? prev.micro_markers.filter(m => m !== marker)
                : [...prev.micro_markers, marker]
        }))
    }

    // ============================================
    // HELPERS
    // ============================================

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

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric'
        })
    }

    const sessionTotalPages = Math.ceil(sessionTotalCount / ITEMS_PER_PAGE)
    const classificationTotalPages = Math.ceil(classificationTotalCount / ITEMS_PER_PAGE)

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
                        Evolusi Prompt (RM2)
                    </h2>
                    <p className={styles.headerSub}>
                        Kelola sesi pembelajaran dan klasifikasi tahap perkembangan prompt siswa
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
            {/* SECTION 1: Sesi Pembelajaran */}
            {/* ============================================ */}
            <div className={styles.section}>
                <div
                    className={styles.sectionHeader}
                    onClick={() => setSessionsSectionOpen(!sessionsSectionOpen)}
                >
                    <h3 className={styles.sectionTitle}>
                        <FiCalendar /> Sesi Pembelajaran
                    </h3>
                    <div className={styles.sectionToggle}>
                        {sessionsSectionOpen ? <FiChevronUp /> : <FiChevronDown />}
                    </div>
                </div>

                {sessionsSectionOpen && (
                    <div className={styles.sectionBody}>
                        <div className={styles.sectionToolbar}>
                            <div className={styles.filters}>
                                <div className={styles.filterGroup}>
                                    <label>Status</label>
                                    <select
                                        value={filterSessionStatus}
                                        onChange={(e) => {
                                            setFilterSessionStatus(e.target.value)
                                            setSessionCurrentPage(1)
                                        }}
                                    >
                                        <option value="">Semua Status</option>
                                        <option value="active">Aktif</option>
                                        <option value="completed">Selesai</option>
                                        <option value="paused">Dijeda</option>
                                    </select>
                                </div>
                            </div>
                            <button
                                className={styles.addBtn}
                                onClick={openAddSessionModal}
                            >
                                <FiPlus /> Tambah Sesi
                            </button>
                        </div>

                        {sessionsError && <div className={styles.errorCard}>{sessionsError}</div>}

                        <div className={styles.tableContainer}>
                            {sessionsLoading ? (
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
                                            {sessions.map((session) => {
                                                const sessionUser = getSessionUser(session)
                                                const sessionCourse = getSessionCourse(session)

                                                return (
                                                <tr key={session.id}>
                                                    <td>
                                                        <div className={styles.userCell}>
                                                            <span className={styles.userName}>
                                                                {sessionUser.name}
                                                            </span>
                                                            <span className={styles.userEmail}>
                                                                {sessionUser.email}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td>{sessionCourse.title}</td>
                                                    <td>#{session.session_number}</td>
                                                    <td>{formatDate(session.session_date)}</td>
                                                    <td>{session.topic_focus || '-'}</td>
                                                    <td>{session.duration_minutes ? `${session.duration_minutes} menit` : '-'}</td>
                                                    <td>{getStatusBadge(session.status || 'active')}</td>
                                                    <td>
                                                        <div className={styles.actionBtns}>
                                                            <button
                                                                className={`${styles.actionBtn} ${styles.viewBtn}`}
                                                                onClick={() => openViewSessionModal(session)}
                                                                title="Lihat Detail"
                                                            >
                                                                <FiEye />
                                                            </button>
                                                            <button
                                                                className={`${styles.actionBtn} ${styles.editBtn}`}
                                                                onClick={() => openEditSessionModal(session)}
                                                                title="Edit"
                                                            >
                                                                <FiEdit2 />
                                                            </button>
                                                            <button
                                                                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                                onClick={() => handleDeleteSession(session)}
                                                                title="Hapus"
                                                            >
                                                                <FiTrash2 />
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                                )
                                            })}
                                        </tbody>
                                    </table>

                                    {sessionTotalPages > 1 && (
                                        <div className={styles.pagination}>
                                            <button
                                                className={styles.pageBtn}
                                                onClick={() => setSessionCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={sessionCurrentPage === 1}
                                            >
                                                <FiChevronLeft />
                                            </button>
                                            <span className={styles.pageInfo}>
                                                Halaman {sessionCurrentPage} dari {sessionTotalPages}
                                            </span>
                                            <button
                                                className={styles.pageBtn}
                                                onClick={() => setSessionCurrentPage(p => Math.min(sessionTotalPages, p + 1))}
                                                disabled={sessionCurrentPage === sessionTotalPages}
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
            {/* SECTION 2: Klasifikasi Prompt */}
            {/* ============================================ */}
            <div className={styles.section}>
                <div
                    className={styles.sectionHeader}
                    onClick={() => setClassificationsSectionOpen(!classificationsSectionOpen)}
                >
                    <h3 className={styles.sectionTitle}>
                        <FiTag /> Klasifikasi Prompt
                    </h3>
                    <div className={styles.sectionToggle}>
                        {classificationsSectionOpen ? <FiChevronUp /> : <FiChevronDown />}
                    </div>
                </div>

                {classificationsSectionOpen && (
                    <div className={styles.sectionBody}>
                        <div className={styles.sectionToolbar}>
                            <div className={styles.filters}>
                                <div className={styles.filterGroup}>
                                    <label>Tahap Prompt</label>
                                    <select
                                        value={filterStage}
                                        onChange={(e) => {
                                            setFilterStage(e.target.value)
                                            setClassificationCurrentPage(1)
                                        }}
                                    >
                                        <option value="">Semua Tahap</option>
                                        <option value="SCP">SCP</option>
                                        <option value="SRP">SRP</option>
                                        <option value="MQP">MQP</option>
                                        <option value="REFLECTIVE">Reflektif</option>
                                    </select>
                                </div>
                            </div>
                            <button
                                className={styles.addBtn}
                                onClick={openAddClassificationModal}
                            >
                                <FiPlus /> Tambah Klasifikasi
                            </button>
                        </div>

                        {classificationsError && <div className={styles.errorCard}>{classificationsError}</div>}

                        <div className={styles.tableContainer}>
                            {classificationsLoading ? (
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
                                                <th>Teks Prompt</th>
                                                <th>Urutan</th>
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
                                                                onClick={() => openViewClassificationModal(item)}
                                                                title="Lihat Detail"
                                                            >
                                                                <FiEye />
                                                            </button>
                                                            <button
                                                                className={`${styles.actionBtn} ${styles.editBtn}`}
                                                                onClick={() => openEditClassificationModal(item)}
                                                                title="Edit"
                                                            >
                                                                <FiEdit2 />
                                                            </button>
                                                            <button
                                                                className={`${styles.actionBtn} ${styles.deleteBtn}`}
                                                                onClick={() => handleDeleteClassification(item)}
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

                                    {classificationTotalPages > 1 && (
                                        <div className={styles.pagination}>
                                            <button
                                                className={styles.pageBtn}
                                                onClick={() => setClassificationCurrentPage(p => Math.max(1, p - 1))}
                                                disabled={classificationCurrentPage === 1}
                                            >
                                                <FiChevronLeft />
                                            </button>
                                            <span className={styles.pageInfo}>
                                                Halaman {classificationCurrentPage} dari {classificationTotalPages}
                                            </span>
                                            <button
                                                className={styles.pageBtn}
                                                onClick={() => setClassificationCurrentPage(p => Math.min(classificationTotalPages, p + 1))}
                                                disabled={classificationCurrentPage === classificationTotalPages}
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
            {/* SESSION MODAL */}
            {/* ============================================ */}
            {showSessionModal && (
                <div className={styles.modalOverlay} onClick={() => setShowSessionModal(false)}>
                    <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>
                                {sessionModalMode === 'add' && 'Tambah Sesi Pembelajaran'}
                                {sessionModalMode === 'edit' && 'Edit Sesi Pembelajaran'}
                                {sessionModalMode === 'view' && 'Detail Sesi Pembelajaran'}
                            </h3>
                            <button className={styles.closeBtn} onClick={() => setShowSessionModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        {sessionModalMode === 'view' && selectedSession ? (
                            <div className={styles.modalBody}>
                                <div className={styles.viewGrid}>
                                    <div className={styles.viewItem}>
                                        <label>Siswa</label>
                                        <p>{getSessionUser(selectedSession).name}</p>
                                        <small>{getSessionUser(selectedSession).email || selectedSession.user_id}</small>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Kursus</label>
                                        <p>{getSessionCourse(selectedSession).title}</p>
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
                                        <label>Total Prompt</label>
                                        <p>{selectedSession.total_prompts || 0}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Total Revisi</label>
                                        <p>{selectedSession.total_revisions || 0}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Tahap Dominan</label>
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
                                        onClick={() => setShowSessionModal(false)}
                                    >
                                        Tutup
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.submitBtn}
                                        onClick={() => openEditSessionModal(selectedSession)}
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleSessionSubmit}>
                                <div className={styles.modalBody}>
                                    <div className={styles.formGroup}>
                                        <label>Siswa *</label>
                                        <select
                                            value={sessionFormData.user_id}
                                            onChange={(e) => setSessionFormData({ ...sessionFormData, user_id: e.target.value })}
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
                                                    value={sessionFormData.user_id}
                                                    onChange={(e) => setSessionFormData({ ...sessionFormData, user_id: e.target.value })}
                                                    placeholder="UUID siswa"
                                                    style={{ marginTop: '4px' }}
                                                />
                                            </small>
                                        )}
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Kursus *</label>
                                        <select
                                            value={sessionFormData.course_id}
                                            onChange={(e) => setSessionFormData({ ...sessionFormData, course_id: e.target.value })}
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
                                                    value={sessionFormData.course_id}
                                                    onChange={(e) => setSessionFormData({ ...sessionFormData, course_id: e.target.value })}
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
                                            value={sessionFormData.session_number}
                                            onChange={(e) => setSessionFormData({ ...sessionFormData, session_number: parseInt(e.target.value) })}
                                            required
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Tanggal Sesi *</label>
                                        <input
                                            type="date"
                                            value={sessionFormData.session_date}
                                            onChange={(e) => setSessionFormData({ ...sessionFormData, session_date: e.target.value })}
                                            required
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Fokus Topik</label>
                                        <input
                                            type="text"
                                            value={sessionFormData.topic_focus}
                                            onChange={(e) => setSessionFormData({ ...sessionFormData, topic_focus: e.target.value })}
                                            placeholder="Topik yang dipelajari"
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Durasi (menit)</label>
                                        <input
                                            type="number"
                                            min="0"
                                            value={sessionFormData.duration_minutes || ''}
                                            onChange={(e) => setSessionFormData({ ...sessionFormData, duration_minutes: e.target.value ? parseInt(e.target.value) : null })}
                                            placeholder="Durasi dalam menit"
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Status</label>
                                        <select
                                            value={sessionFormData.status}
                                            onChange={(e) => setSessionFormData({ ...sessionFormData, status: e.target.value as 'active' | 'completed' | 'paused' })}
                                        >
                                            <option value="active">Aktif</option>
                                            <option value="completed">Selesai</option>
                                            <option value="paused">Dijeda</option>
                                        </select>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Catatan</label>
                                        <textarea
                                            value={sessionFormData.notes}
                                            onChange={(e) => setSessionFormData({ ...sessionFormData, notes: e.target.value })}
                                            placeholder="Catatan tambahan..."
                                        />
                                    </div>
                                </div>
                                <div className={styles.modalFooter}>
                                    <button
                                        type="button"
                                        className={styles.cancelBtn}
                                        onClick={() => setShowSessionModal(false)}
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        className={styles.submitBtn}
                                        disabled={sessionSubmitting}
                                    >
                                        {sessionSubmitting ? 'Menyimpan...' : 'Simpan'}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {/* ============================================ */}
            {/* CLASSIFICATION MODAL */}
            {/* ============================================ */}
            {showClassificationModal && (
                <div className={styles.modalOverlay} onClick={() => setShowClassificationModal(false)}>
                    <div className={styles.modalWide} onClick={(e) => e.stopPropagation()}>
                        <div className={styles.modalHeader}>
                            <h3>
                                {classificationModalMode === 'add' && 'Tambah Klasifikasi Prompt'}
                                {classificationModalMode === 'edit' && 'Edit Klasifikasi Prompt'}
                                {classificationModalMode === 'view' && 'Detail Klasifikasi Prompt'}
                            </h3>
                            <button className={styles.closeBtn} onClick={() => setShowClassificationModal(false)}>
                                <FiX />
                            </button>
                        </div>

                        {classificationModalMode === 'view' && selectedClassification ? (
                            <div className={styles.modalBody}>
                                <div className={styles.viewGrid}>
                                    <div className={styles.viewItem}>
                                        <label>Sesi</label>
                                        <p>#{selectedClassification.learning_sessions?.session_number || '-'}</p>
                                        <small>{selectedClassification.learning_sessions?.users?.name || selectedClassification.session_id}</small>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Urutan</label>
                                        <p>#{selectedClassification.prompt_sequence}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Tahap Prompt</label>
                                        <p>{getStageBadge(selectedClassification.prompt_stage)}</p>
                                        <small>{PROMPT_STAGE_LABELS[selectedClassification.prompt_stage]}</small>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Kedalaman Kognitif</label>
                                        <p>{getDepthBadge(selectedClassification.cognitive_depth_level)}</p>
                                    </div>
                                    <div className={`${styles.viewItem} ${styles.fullWidth}`}>
                                        <label>Teks Prompt</label>
                                        <p>{selectedClassification.prompt_text}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Micro Markers</label>
                                        <p>
                                            {selectedClassification.micro_markers?.map((marker) => (
                                                <span key={marker} className={styles.markerBadge} style={{ marginRight: '4px' }}>
                                                    {marker} - {MICRO_MARKER_LABELS[marker]}
                                                </span>
                                            ))}
                                            {(!selectedClassification.micro_markers || selectedClassification.micro_markers.length === 0) && '-'}
                                        </p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Skor Keyakinan</label>
                                        <p>{selectedClassification.confidence_score !== null ? `${(selectedClassification.confidence_score * 100).toFixed(0)}%` : '-'}</p>
                                    </div>
                                    <div className={styles.viewItem}>
                                        <label>Diklasifikasikan Oleh</label>
                                        <p>{selectedClassification.classified_by}</p>
                                    </div>
                                    {selectedClassification.classification_rationale && (
                                        <div className={`${styles.viewItem} ${styles.fullWidth}`}>
                                            <label>Alasan Klasifikasi</label>
                                            <p>{selectedClassification.classification_rationale}</p>
                                        </div>
                                    )}
                                </div>
                                <div className={styles.modalFooter}>
                                    <button
                                        type="button"
                                        className={styles.cancelBtn}
                                        onClick={() => setShowClassificationModal(false)}
                                    >
                                        Tutup
                                    </button>
                                    <button
                                        type="button"
                                        className={styles.submitBtn}
                                        onClick={() => openEditClassificationModal(selectedClassification)}
                                    >
                                        Edit
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <form onSubmit={handleClassificationSubmit}>
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
                                            value={classificationFormData.session_id}
                                            onChange={(e) => setClassificationFormData({ ...classificationFormData, session_id: e.target.value })}
                                            required
                                        >
                                            <option value="">Pilih Sesi</option>
                                            {classificationSessions.map((session) => {
                                                const sessionUser = getSessionUser(session)
                                                const sessionCourse = getSessionCourse(session)

                                                return (
                                                <option key={session.id} value={session.id}>
                                                    Sesi #{session.session_number} - {sessionUser.name} ({sessionCourse.title})
                                                </option>
                                                )
                                            })}
                                        </select>
                                        {classificationSessions.length === 0 && (
                                            <small className={styles.helpText}>
                                                Atau masukkan UUID manual:
                                                <input
                                                    type="text"
                                                    value={classificationFormData.session_id}
                                                    onChange={(e) => setClassificationFormData({ ...classificationFormData, session_id: e.target.value })}
                                                    placeholder="UUID sesi pembelajaran"
                                                    style={{ marginTop: '4px' }}
                                                />
                                            </small>
                                        )}
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Teks Prompt *</label>
                                        <textarea
                                            value={classificationFormData.prompt_text}
                                            onChange={(e) => setClassificationFormData({ ...classificationFormData, prompt_text: e.target.value })}
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
                                                value={classificationFormData.prompt_sequence}
                                                onChange={(e) => setClassificationFormData({ ...classificationFormData, prompt_sequence: parseInt(e.target.value) })}
                                                required
                                            />
                                        </div>

                                        <div className={styles.formGroup}>
                                            <label>Tahap Prompt *</label>
                                            <select
                                                value={classificationFormData.prompt_stage}
                                                onChange={(e) => setClassificationFormData({ ...classificationFormData, prompt_stage: e.target.value as PromptStage })}
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
                                                        checked={classificationFormData.micro_markers.includes(marker)}
                                                        onChange={() => handleMarkerToggle(marker)}
                                                    />
                                                    {marker} ({MICRO_MARKER_LABELS[marker]})
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className={styles.formRow}>
                                        <div className={styles.formGroup}>
                                            <label>Level Kedalaman Kognitif (1-4) *</label>
                                            <select
                                                value={classificationFormData.cognitive_depth_level}
                                                onChange={(e) => setClassificationFormData({ ...classificationFormData, cognitive_depth_level: parseInt(e.target.value) })}
                                                required
                                            >
                                                <option value={1}>1 - Dasar Deskriptif</option>
                                                <option value={2}>2 - Analitik Awal</option>
                                                <option value={3}>3 - Analitik-Reflektif</option>
                                                <option value={4}>4 - Metakognitif Mendalam</option>
                                            </select>
                                        </div>

                                        <div className={styles.formGroup}>
                                            <label>Skor Keyakinan (0-1)</label>
                                            <input
                                                type="number"
                                                min="0"
                                                max="1"
                                                step="0.1"
                                                value={classificationFormData.confidence_score || ''}
                                                onChange={(e) => setClassificationFormData({ ...classificationFormData, confidence_score: e.target.value ? parseFloat(e.target.value) : null })}
                                                placeholder="0.0 - 1.0"
                                            />
                                        </div>
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Alasan Klasifikasi</label>
                                        <textarea
                                            value={classificationFormData.classification_rationale}
                                            onChange={(e) => setClassificationFormData({ ...classificationFormData, classification_rationale: e.target.value })}
                                            placeholder="Alasan mengapa prompt diklasifikasikan ke tahap ini..."
                                        />
                                    </div>

                                    <div className={styles.formGroup}>
                                        <label>Diklasifikasikan Oleh</label>
                                        <input
                                            type="text"
                                            value={classificationFormData.classified_by}
                                            onChange={(e) => setClassificationFormData({ ...classificationFormData, classified_by: e.target.value })}
                                            placeholder="Nama penilai"
                                        />
                                    </div>
                                </div>
                                <div className={styles.modalFooter}>
                                    <button
                                        type="button"
                                        className={styles.cancelBtn}
                                        onClick={() => setShowClassificationModal(false)}
                                    >
                                        Batal
                                    </button>
                                    <button
                                        type="submit"
                                        className={styles.submitBtn}
                                        disabled={classificationSubmitting}
                                    >
                                        {classificationSubmitting ? 'Menyimpan...' : 'Simpan'}
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
