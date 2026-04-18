'use client'

import React, { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  FiHelpCircle,
  FiTarget,
  FiCheckSquare,
  FiBookOpen,
  FiEye,
  FiFilter,
  FiRotateCcw,
} from 'react-icons/fi'
import styles from './page.module.scss'
import { useAdmin } from '@/hooks/useAdmin'
import type { ReflectionActivityItem } from '@/lib/admin-reflection-activity'

import type {
  DiscussionSessionListItem,
  DiscussionMessage,
  DiscussionAssessment,
  AdminAction,
  ModulePrerequisiteDetails,
} from '@/types/discussion'

import {
  normalizeAdminActions,
  normalizeDiscussionAssessments,
  normalizeDiscussionMessages,
  normalizeDiscussionSession,
  normalizeDiscussionSessions,
} from '@/types/discussion'

// ── Shared Types ──

interface AskLogItem {
  id: string
  timestamp: string
  topic: string
  question: string
  answer: string
  reasoningNote?: string
  promptStage?: string
  promptComponents?: {
    tujuan?: string
    konteks?: string
    batasan?: string
  } | null
  userEmail: string
  userId: string
  courseTitle: string
  moduleIndex: number
  subtopicIndex: number
  pageNumber: number
}

interface ChallengeLogItem {
  id: string
  timestamp: string
  topic: string
  question: string
  answer: string
  feedback: string
  reasoningNote?: string
  userEmail: string
  userId: string
  courseTitle: string
  moduleIndex: number
  subtopicIndex: number
  pageNumber: number
}

interface QuizLogItem {
  id: string
  timestamp: string
  rawTimestamp?: string | null
  topic: string
  subtopicId?: string | null
  question: string
  options: string[]
  userAnswer: string
  correctAnswer: string
  isCorrect: boolean
  reasoningNote?: string
  userEmail: string
  userId: string
  courseTitle: string
  attemptNumber?: number
  quizAttemptId?: string | null
}

interface QuizPaginationMeta {
  page: number
  pageSize: number
  totalItems: number
  totalPages: number
  hasNextPage: boolean
  hasPreviousPage: boolean
}

interface ExampleUsageItem {
  id: string
  timestamp: string
  rawTimestamp?: string | null
  topic: string
  userEmail: string
  userId: string
  courseTitle: string
  courseId?: string | null
  moduleIndex: number
  subtopicIndex: number
  pageNumber: number
  examplesCount: number
  contextLength: number
  usageScope: string
  dataCollectionWeek?: string | null
}

interface QuizActivityResponse {
  data?: QuizLogItem[]
  items?: QuizLogItem[]
  pagination?: QuizPaginationMeta
}

interface QuizAttemptGroup {
  key: string
  userEmail: string
  userId: string
  courseTitle: string
  topic: string
  attemptNumber: number
  quizAttemptId: string | null
  timestamp: string
  rawTimestamp: string | null
  correctCount: number
  totalCount: number
  score: number
  items: QuizLogItem[]
}

function groupQuizByAttempt(logs: QuizLogItem[]): QuizAttemptGroup[] {
  const groups = new Map<string, QuizAttemptGroup>()
  for (const log of logs) {
    // Group key: quiz_attempt_id if present, else fall back to a composite key
    // that includes log.id as the final disambiguator so two submissions with
    // the same user/subtopic/timestamp never collide into a single group.
    const key = log.quizAttemptId
      ?? `${log.userId}::${log.subtopicId ?? log.topic}::${log.rawTimestamp ?? log.timestamp}::${log.attemptNumber ?? 1}::${log.id}`
    const existing = groups.get(key)
    if (existing) {
      existing.items.push(log)
      existing.totalCount++
      if (log.isCorrect) existing.correctCount++
    } else {
      groups.set(key, {
        key,
        userEmail: log.userEmail,
        userId: log.userId,
        courseTitle: log.courseTitle,
        topic: log.topic,
        attemptNumber: log.attemptNumber ?? 1,
        quizAttemptId: log.quizAttemptId ?? null,
        timestamp: log.timestamp,
        rawTimestamp: log.rawTimestamp ?? null,
        correctCount: log.isCorrect ? 1 : 0,
        totalCount: 1,
        score: 0,
        items: [log],
      })
    }
  }
  // Compute score and sort by rawTimestamp DESC (fallback lexical)
  const result: QuizAttemptGroup[] = []
  for (const g of groups.values()) {
    g.score = g.totalCount > 0 ? Math.round((g.correctCount / g.totalCount) * 100) : 0
    result.push(g)
  }
  result.sort((a, b) => {
    const ta = a.rawTimestamp ?? ''
    const tb = b.rawTimestamp ?? ''
    if (ta && tb) return tb.localeCompare(ta)
    return 0
  })
  return result
}

interface _JurnalLogItem {
  id: string
  journalId?: string | null
  feedbackId?: string | null
  source?: 'journal' | 'journal_with_feedback' | 'feedback_only'
  timestamp: string
  topic: string
  content: string
  type?: string
  moduleIndex?: number | null
  subtopicIndex?: number | null
  understood?: string
  confused?: string
  strategy?: string
  promptEvolution?: string
  contentRating?: number | null
  contentFeedback?: string
  userEmail: string
  userId: string
  // Feedback fields (merged)
  comment?: string
  rating?: number | null
  courseTitle?: string
}

// ── Discussion types ──

type SessionListItem = DiscussionSessionListItem

type SessionDetail = {
  session: SessionListItem
  messages: DiscussionMessage[]
  assessments: DiscussionAssessment[]
  adminActions: AdminAction[]
}

// ── Constants ──

const TABS = [
  { id: 'ask', label: 'Tanya Jawab', icon: FiHelpCircle },
  { id: 'challenge', label: 'Tantangan', icon: FiTarget },
  { id: 'examples', label: 'Contoh', icon: FiEye },
  { id: 'quiz', label: 'Kuis', icon: FiCheckSquare },
  { id: 'refleksi', label: 'Refleksi', icon: FiBookOpen },
  { id: 'diskusi', label: 'Diskusi', icon: FiRotateCcw },
]

const TAB_DESCRIPTIONS: Record<string, string> = {
  ask: 'Log tanya jawab otomatis: pertanyaan, jawaban, reasoning, tahap prompt, dan komponen prompt.',
  challenge: 'Jejak tantangan berpikir kritis beserta umpan balik AI.',
  examples: 'Jejak pemakaian fitur Beri Contoh per subtopik. Isi contoh tetap sementara di sisi siswa.',
  quiz: 'Percobaan kuis: pertanyaan, opsi, jawaban siswa vs kunci, dan status kebenaran.',
  refleksi: 'Refleksi terpadu dari jurnal dan feedback, dengan riwayat per subtopik.',
  diskusi: 'Sesi diskusi Socratic: transkrip, tujuan pembelajaran, dan monitoring baca-saja.',
}

const STATUS_OPTIONS = [
  { value: 'all', label: 'Semua Status' },
  { value: 'in_progress', label: 'Sedang Berlangsung' },
  { value: 'completed', label: 'Selesai' },
]

const PHASE_LABELS: Record<string, string> = {
  diagnosis: 'Diagnosis',
  exploration: 'Penjelasan',
  explanation: 'Penjelasan',
  practice: 'Latihan',
  synthesis: 'Konsolidasi',
  consolidation: 'Konsolidasi',
  completed: 'Selesai',
}

// ── Helpers ──

function getPhaseLabel(phase?: string) {
  if (!phase) return 'Belum Mulai'
  return PHASE_LABELS[phase.toLowerCase()] ?? phase
}

function getSessionStatusLabel(status?: string) {
  if (status === 'completed') return 'Selesai'
  if (status === 'failed') return 'Gagal'
  return 'Berjalan'
}

function getSessionStatusClass(status?: string) {
  return status === 'completed' ? styles.statusBadgeDone : styles.statusBadgeProgress
}

function getGoalMasteryLabel(goal: { covered?: boolean; masteryStatus?: string; acceptedBy?: string | null }) {
  if (goal.masteryStatus === 'met') return 'Kuat'
  if (goal.masteryStatus === 'near') return 'Mendekati'
  if (goal.masteryStatus === 'weak') return 'Perlu diperkuat'
  if (goal.masteryStatus === 'off_topic') return 'Tidak relevan'
  if (goal.masteryStatus === 'unassessable') return 'Belum dapat dinilai'
  if (goal.acceptedBy === 'remediation_attempt_limit') return 'Lanjut dengan catatan'
  if (goal.covered) return 'Diproses'
  return 'Perlu bimbingan'
}

function getAssessmentStatusLabel(status?: string) {
  if (status === 'met') return 'Sesuai'
  if (status === 'near') return 'Mendekati'
  if (status === 'off_topic') return 'Tidak relevan'
  if (status === 'unassessable') return 'Tidak dapat dinilai'
  return 'Masih jauh'
}

function getMessageTypeLabel(message: DiscussionMessage) {
  const type = String(message.metadata?.type || '').toLowerCase()
  if (type === 'student_input') return 'Input Siswa'
  if (type === 'coach_feedback') return 'Umpan Balik Mentor'
  if (type === 'manual_note') return 'Catatan Admin'
  if (type === 'manual_intervention') return 'Intervensi Admin'
  if (type === 'closing') return 'Pesan Penutup'
  if (type === 'agent_response') return 'Respons Agen'
  if (message.role === 'student') return 'Input Siswa'
  return 'Respons Agen'
}

function groupByTopic<T extends { topic: string }>(entries: T[]) {
  const map = new Map<string, T[]>()
  entries.forEach((entry) => {
    const key = entry.topic || 'Tanpa Topik'
    map.set(key, [...(map.get(key) ?? []), entry])
  })
  return Array.from(map.entries()).map(([topic, items]) => ({ topic, items }))
}

const EmptyState = ({ message }: { message: string }) => (
  <p className={styles.noData}>{message}</p>
)

const RawDetail = ({ title, data }: { title: string; data: unknown }) => (
  <details className={styles.rawDetail}>
    <summary>{title}</summary>
    <pre>{JSON.stringify(data, null, 2)}</pre>
  </details>
)

// ── Main Component ──

export default function AdminAktivitasPage() {
  const router = useRouter()
  const { admin, loading: authLoading } = useAdmin()

  // ── Shared filter state ──
  const [users, setUsers] = useState<{ id: string; email: string }[]>([])
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedCourse, setSelectedCourse] = useState('')
  const [selectedDateFrom, setSelectedDateFrom] = useState('')
  const [selectedDateTo, setSelectedDateTo] = useState('')

  const [activeTab, setActiveTab] = useState('ask')

  // ── Tab data state ──
  const [askLogs, setAskLogs] = useState<AskLogItem[]>([])
  const [challengeLogs, setChallengeLogs] = useState<ChallengeLogItem[]>([])
  const [exampleLogs, setExampleLogs] = useState<ExampleUsageItem[]>([])
  const [quizLogs, setQuizLogs] = useState<QuizLogItem[]>([])
  const [quizPagination, setQuizPagination] = useState<QuizPaginationMeta | null>(null)
  const [quizPage, setQuizPage] = useState(1)
  const [refleksiLogs, setRefleksiLogs] = useState<ReflectionActivityItem[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  // ── Diskusi tab state ──
  const [diskusiStatusFilter, setDiskusiStatusFilter] = useState('all')
  const [sessions, setSessions] = useState<SessionListItem[]>([])
  const [loadingSessions, setLoadingSessions] = useState(false)
  const [listError, setListError] = useState<string | null>(null)
  const [reloadCounter, setReloadCounter] = useState(0)

  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [detail, setDetail] = useState<SessionDetail | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [detailError, setDetailError] = useState<string | null>(null)
  const [prereqInfo, setPrereqInfo] = useState<ModulePrerequisiteDetails | null>(null)
  const [prereqLoading, setPrereqLoading] = useState(false)
  const [prereqError, setPrereqError] = useState<string | null>(null)

  // ── Derived data ──
  const groupedAskLogs = useMemo(() => groupByTopic(askLogs), [askLogs])
  const groupedChallengeLogs = useMemo(() => groupByTopic(challengeLogs), [challengeLogs])
  const groupedExampleLogs = useMemo(() => groupByTopic(exampleLogs), [exampleLogs])
  const groupedQuizAttempts = useMemo(() => groupQuizByAttempt(quizLogs), [quizLogs])

  const clearAllFilters = () => {
    setSelectedUser('')
    setSelectedCourse('')
    setSelectedDateFrom('')
    setSelectedDateTo('')
    setQuizPage(1)
  }

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string }> = []
    if (selectedUser) {
      const user = users.find((u) => u.id === selectedUser)
      chips.push({ key: 'user', label: `Pengguna: ${user?.email ?? selectedUser}` })
    }
    if (selectedDateFrom) chips.push({ key: 'dateFrom', label: `Dari: ${selectedDateFrom}` })
    if (selectedDateTo) chips.push({ key: 'dateTo', label: `Sampai: ${selectedDateTo}` })
    if (selectedCourse) {
      const course = courses.find((c) => c.id === selectedCourse)
      chips.push({ key: 'course', label: `Kursus: ${course?.title ?? selectedCourse}` })
    }
    return chips
  }, [selectedUser, selectedDateFrom, selectedDateTo, selectedCourse, users, courses])

  // ── Summary cards per tab ──
  const summaryCards = useMemo(() => {
    if (activeTab === 'ask') {
      return [
        { label: 'Pertanyaan', value: askLogs.length },
        { label: 'Topik', value: groupedAskLogs.length },
        { label: 'Pengguna Unik', value: new Set(askLogs.map((l) => l.userId)).size },
      ]
    }
    if (activeTab === 'challenge') {
      return [
        { label: 'Tantangan', value: challengeLogs.length },
        { label: 'Dengan Umpan Balik', value: challengeLogs.filter((l) => !!l.feedback).length },
        { label: 'Pengguna Unik', value: new Set(challengeLogs.map((l) => l.userId)).size },
      ]
    }
    if (activeTab === 'examples') {
      return [
        { label: 'Pemakaian Contoh', value: exampleLogs.length },
        { label: 'Subtopik', value: groupedExampleLogs.length },
        { label: 'Pengguna Unik', value: new Set(exampleLogs.map((l) => l.userId)).size },
      ]
    }
    if (activeTab === 'quiz') {
      const correct = quizLogs.filter((l) => l.isCorrect).length
      const accuracy = quizLogs.length > 0 ? Math.round((correct / quizLogs.length) * 100) : 0
      return [
        { label: 'Percobaan', value: groupedQuizAttempts.length },
        { label: 'Jawaban Tercatat', value: quizPagination?.totalItems ?? quizLogs.length },
        { label: 'Akurasi Jawaban', value: `${accuracy}%` },
      ]
    }
    if (activeTab === 'refleksi') {
      const rated = refleksiLogs.filter((l) => typeof l.rating === 'number' || typeof l.contentRating === 'number')
      return [
        { label: 'Entri Refleksi', value: refleksiLogs.length },
        { label: 'Pengguna Unik', value: new Set(refleksiLogs.map((l) => l.userId)).size },
        { label: 'Dengan Rating', value: rated.length },
      ]
    }
    // diskusi
    const coveredGoals = sessions.reduce(
      (sum, s) => sum + s.learningGoals.filter((g) => g.covered).length,
      0
    )
    return [
      { label: 'Sesi', value: sessions.length },
      { label: 'Sedang Berlangsung', value: sessions.filter((s) => s.status === 'in_progress').length },
      { label: 'Tujuan Tercapai', value: coveredGoals },
    ]
  }, [activeTab, askLogs, challengeLogs, exampleLogs, quizLogs, refleksiLogs, sessions, groupedAskLogs.length, groupedExampleLogs.length, groupedQuizAttempts.length, quizPagination?.totalItems])

  const tabCount = useMemo(() => {
    switch (activeTab) {
      case 'ask': return askLogs.length
      case 'challenge': return challengeLogs.length
      case 'examples': return exampleLogs.length
      case 'quiz': return quizPagination?.totalItems ?? quizLogs.length
      case 'refleksi': return refleksiLogs.length
      case 'diskusi': return sessions.length
      default: return 0
    }
  }, [activeTab, askLogs.length, challengeLogs.length, exampleLogs.length, quizLogs.length, refleksiLogs.length, sessions.length, groupedQuizAttempts.length, quizPagination?.totalItems])

  const activeTabLabel = TABS.find((t) => t.id === activeTab)?.label ?? 'Aktivitas'
  const activeTabMetaLabel = activeTab === 'quiz' ? 'jawaban' : 'catatan'

  // ── Auth guard ──
  useEffect(() => {
    if (!authLoading && !admin) router.push('/admin/login')
  }, [authLoading, admin, router])

  // ── Load users & courses for filters ──
  useEffect(() => {
    if (authLoading || !admin) return
    fetch('/api/admin/users?limit=100', { credentials: 'include' })
      .then((res) => res.json())
      .then(setUsers)
      .catch(() => setUsers([]))
  }, [authLoading, admin])

  useEffect(() => {
    if (authLoading || !admin) return
    fetch('/api/admin/activity/courses', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setCourses(Array.isArray(data.courses) ? data.courses : []))
      .catch(() => setCourses([]))
  }, [authLoading, admin])

  // ── Build query params ──
  const buildParams = () => {
    const params = new URLSearchParams()
    if (selectedUser) params.set('userId', selectedUser)
    if (selectedDateFrom) params.set('date', selectedDateFrom)
    if (selectedDateTo) params.set('dateTo', selectedDateTo)
    if (selectedCourse) params.set('course', selectedCourse)
    return params.toString()
  }

  useEffect(() => {
    setQuizPage(1)
  }, [selectedUser, selectedDateFrom, selectedDateTo, selectedCourse])

  // ── Fetch tab data (non-diskusi) ──
  useEffect(() => {
    if (authLoading || !admin) return
    if (activeTab === 'diskusi') return // diskusi has its own fetch

    const endpointMap: Record<string, string> = {
      ask: 'ask-question',
      challenge: 'challenge',
      examples: 'examples',
      quiz: 'quiz',
      refleksi: 'jurnal',
    }
    const endpoint = endpointMap[activeTab]
    if (!endpoint) return

    const params = new URLSearchParams(buildParams())
    if (activeTab === 'quiz') {
      params.set('page', String(quizPage))
      params.set('pageSize', '25')
    }
    const url = `/api/admin/activity/${endpoint}?${params.toString()}`

    setLogsLoading(true)
    const controller = new AbortController()
    fetch(url, { credentials: 'include', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error('Gagal memuat data')
        return res.json()
      })
      .then((data) => {
        const payload: QuizActivityResponse = Array.isArray(data)
          ? { data }
          : data ?? {}
        const quizRecords = Array.isArray(payload.data)
          ? payload.data
          : Array.isArray(payload.items)
            ? payload.items
            : []
        switch (activeTab) {
          case 'ask': setAskLogs(data); break
          case 'challenge': setChallengeLogs(data); break
          case 'examples': setExampleLogs(data); break
          case 'quiz':
            setQuizLogs(quizRecords)
            setQuizPagination(payload.pagination ?? null)
            break
          case 'refleksi': setRefleksiLogs(data); break
        }
      })
      .catch(() => {
        switch (activeTab) {
          case 'ask': setAskLogs([]); break
          case 'challenge': setChallengeLogs([]); break
          case 'examples': setExampleLogs([]); break
          case 'quiz':
            setQuizLogs([])
            setQuizPagination(null)
            break
          case 'refleksi': setRefleksiLogs([]); break
        }
      })
      .finally(() => setLogsLoading(false))

    return () => controller.abort()
  }, [activeTab, selectedUser, selectedDateFrom, selectedDateTo, selectedCourse, quizPage, authLoading, admin])

  // ── Diskusi: load session list ──
  useEffect(() => {
    if (authLoading || !admin) return
    if (activeTab !== 'diskusi') return

    const controller = new AbortController()
    async function loadSessions() {
      setLoadingSessions(true)
      setListError(null)
      try {
        const params = new URLSearchParams()
        if (diskusiStatusFilter !== 'all') params.append('status', diskusiStatusFilter)
        const response = await fetch(`/api/admin/discussions?${params.toString()}`, {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.error || 'Gagal memuat sesi diskusi')
        }
        const payload = await response.json()
        setSessions(normalizeDiscussionSessions(payload.sessions ?? []))
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          setListError(error.message ?? 'Tidak dapat memuat sesi diskusi')
        } else if (!(error instanceof Error)) {
          setListError('Tidak dapat memuat sesi diskusi')
        }
      } finally {
        setLoadingSessions(false)
      }
    }
    loadSessions()
    return () => controller.abort()
  }, [admin, authLoading, activeTab, diskusiStatusFilter, reloadCounter])

  // ── Diskusi: clear selection when sessions change ──
  useEffect(() => {
    if (!selectedSessionId) return
    const stillExists = sessions.some((s) => s.id === selectedSessionId)
    if (!stillExists) setSelectedSessionId(null)
  }, [sessions, selectedSessionId])

  // ── Diskusi: load session detail ──
  useEffect(() => {
    if (!selectedSessionId) {
      setDetail(null)
      return
    }
    const controller = new AbortController()
    async function loadDetail() {
      setLoadingDetail(true)
      setDetailError(null)
      try {
        const response = await fetch(`/api/admin/discussions/${selectedSessionId}`, {
          credentials: 'include',
          signal: controller.signal,
        })
        if (!response.ok) {
          const err = await response.json().catch(() => ({}))
          throw new Error(err.error || 'Gagal memuat detail sesi')
        }
        const payload = await response.json()
        setDetail({
          session: normalizeDiscussionSession(payload.session ?? {}),
          messages: normalizeDiscussionMessages(payload.messages ?? []),
          assessments: normalizeDiscussionAssessments(payload.assessments ?? []),
          adminActions: normalizeAdminActions(payload.adminActions ?? []),
        })
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== 'AbortError') {
          setDetailError(error.message ?? 'Tidak dapat memuat detail sesi')
        } else if (!(error instanceof Error)) {
          setDetailError('Tidak dapat memuat detail sesi')
        }
      } finally {
        setLoadingDetail(false)
      }
    }
    loadDetail()
    return () => controller.abort()
  }, [selectedSessionId])

  // ── Diskusi: goal stats ──
  const selectedSessionGoals = useMemo(
    () => detail?.session?.learningGoals ?? [],
    [detail?.session?.learningGoals]
  )
  const goalStats = useMemo(() => {
    const total = selectedSessionGoals.length
    const covered = selectedSessionGoals.filter((g) => g.covered).length
    const percentage = total ? Math.round((covered / total) * 100) : 0
    return { total, covered, percentage }
  }, [selectedSessionGoals])
  const masteryStats = useMemo(() => {
    const met = selectedSessionGoals.filter((g) => g.masteryStatus === 'met').length
    const near = selectedSessionGoals.filter((g) => g.masteryStatus === 'near').length
    const weak = selectedSessionGoals.filter((g) => g.masteryStatus === 'weak').length
    const unassessable = selectedSessionGoals.filter((g) => g.masteryStatus === 'unassessable').length
    return { met, near, weak, unassessable }
  }, [selectedSessionGoals])
  const assessmentsByMessage = useMemo(() => {
    const map = new Map<string, DiscussionAssessment[]>()
    for (const assessment of detail?.assessments ?? []) {
      const items = map.get(assessment.studentMessageId) ?? []
      items.push(assessment)
      map.set(assessment.studentMessageId, items)
    }
    return map
  }, [detail?.assessments])

  // ── Diskusi: load prereq info ──
  useEffect(() => {
    const courseId = detail?.session?.course?.id
    const moduleId = detail?.session?.subtopic?.id
    if (!courseId || !moduleId) {
      setPrereqInfo(null)
      setPrereqError(null)
      setPrereqLoading(false)
      return
    }
    let cancelled = false
    setPrereqLoading(true)
    setPrereqError(null)
    fetch(`/api/admin/discussions/module-status?courseId=${courseId}&moduleId=${moduleId}`, {
      credentials: 'include',
    })
      .then(async (res) => {
        if (!res.ok) {
          const payload = await res.json().catch(() => ({}))
          throw new Error(payload.error || 'Gagal memuat prasyarat modul')
        }
        return res.json()
      })
      .then((data: ModulePrerequisiteDetails) => {
        if (!cancelled) setPrereqInfo(data)
      })
      .catch((error) => {
        if (!cancelled) {
          setPrereqInfo(null)
          setPrereqError(error?.message ?? 'Tidak dapat memuat prasyarat modul')
        }
      })
      .finally(() => {
        if (!cancelled) setPrereqLoading(false)
      })
    return () => { cancelled = true }
  }, [detail?.session?.course?.id, detail?.session?.subtopic?.id])

  // ── Diskusi: selection & refresh ──
  const handleSelectSession = (sessionId: string) => {
    setSelectedSessionId(sessionId)
  }

  // ── Auth loading gate ──
  if (authLoading) return <div className={styles.loading}>Memuat...</div>
  if (!admin) return null

  // ── Render ──
  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <h2>Aktivitas Mahasiswa</h2>
        <p>
          Pantau interaksi mahasiswa: tanya jawab, tantangan berpikir, kuis, refleksi, dan diskusi
          terpandu.
        </p>
      </div>

      {/* Summary Cards */}
      <div className={styles.summaryStrip}>
        {summaryCards.map((card) => (
          <article key={card.label} className={styles.summaryCard}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      {/* Shared Filters */}
      <section className={styles.filterPanel}>
        <div className={styles.filterHeader}>
          <div className={styles.filterTitle}>
            <FiFilter />
            <span>Filter</span>
          </div>
          <button className={styles.clearFilterBtn} type="button" onClick={clearAllFilters}>
            <FiRotateCcw /> Hapus
          </button>
        </div>

        <div className={styles.filterBar}>
          <select
            className={styles.select}
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="">Semua Pengguna</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>{u.email}</option>
            ))}
          </select>

          <select
            className={styles.select}
            value={selectedCourse}
            onChange={(e) => setSelectedCourse(e.target.value)}
          >
            <option value="">Semua Kursus</option>
            {courses.map((c) => (
              <option key={c.id} value={c.id}>{c.title}</option>
            ))}
          </select>

          <input
            type="date"
            className={styles.dateInput}
            value={selectedDateFrom}
            onChange={(e) => setSelectedDateFrom(e.target.value)}
            aria-label="Tanggal mulai"
            title="Dari tanggal"
          />
          <input
            type="date"
            className={styles.dateInput}
            value={selectedDateTo}
            onChange={(e) => setSelectedDateTo(e.target.value)}
            aria-label="Tanggal akhir"
            title="Sampai tanggal"
          />
        </div>

        {activeFilterChips.length > 0 && (
          <div className={styles.activeFilters}>
            {activeFilterChips.map((chip) => (
              <span key={chip.key} className={styles.filterChip}>{chip.label}</span>
            ))}
          </div>
        )}
      </section>

      {/* Tabs */}
      <nav className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={[styles.tabBtn, activeTab === tab.id ? styles.tabBtnActive : ''].filter(Boolean).join(' ')}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon />
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      {/* Content Panel */}
      <section className={styles.contentPanel}>
        <header className={styles.sectionHeader}>
          <div>
            <h2>{activeTabLabel}</h2>
            <p>{TAB_DESCRIPTIONS[activeTab] ?? 'Data aktivitas.'}</p>
          </div>
          <div className={styles.sectionMeta}>
            <span>{tabCount} {activeTabMetaLabel}</span>
          </div>
        </header>

        {/* ────────────────────────────────────────────────
            Tab 1: Tanya Jawab
        ──────────────────────────────────────────────── */}
        {activeTab === 'ask' && (
          logsLoading ? <Skeleton /> : (
            <div className={styles.topicGrid}>
              {groupedAskLogs.length === 0 ? (
                <EmptyState message="Belum ada riwayat tanya jawab" />
              ) : (
                groupedAskLogs.map(({ topic, items }) => (
                  <article key={topic} className={styles.topicCard}>
                    <header>
                      <h3>{topic}</h3>
                      <span>{items.length} percakapan</span>
                    </header>
                    <ul>
                      {items.map((log) => (
                        <li key={log.id}>
                          {/* Prompt stage badge */}
                          {log.promptStage && (
                            <span className={styles.promptStageBadge}>
                              Tahap: {log.promptStage}
                            </span>
                          )}

                          <div className={styles.promptLine}>
                            <strong>T:</strong>
                            <p>{log.question}</p>
                          </div>
                          <div className={styles.answerLine}>
                            <strong>J:</strong>
                            <p>{log.answer.length > 300 ? log.answer.slice(0, 300) + '...' : log.answer}</p>
                          </div>

                          {/* Prompt component chips */}
                          {log.promptComponents && (
                            <div className={styles.promptChips}>
                              {(['tujuan', 'konteks', 'batasan'] as const).map((key) => (
                                <span
                                  key={key}
                                  className={`${styles.promptChip} ${log.promptComponents?.[key] ? styles.promptChipActive : ''}`}
                                >
                                  {key.charAt(0).toUpperCase() + key.slice(1)}
                                </span>
                              ))}
                            </div>
                          )}

                          {/* Reasoning note */}
                          {log.reasoningNote && (
                            <div className={styles.feedbackBox}>
                              <strong>Reasoning Siswa:</strong>
                              <p>{log.reasoningNote}</p>
                            </div>
                          )}

                          <RawDetail title="Lihat Detail" data={log} />
                          <footer>
                            <span>{log.userEmail}</span>
                            <span>{log.timestamp}</span>
                          </footer>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))
              )}
            </div>
          )
        )}

        {/* ────────────────────────────────────────────────
            Tab 2: Tantangan
        ──────────────────────────────────────────────── */}
        {activeTab === 'challenge' && (
          logsLoading ? <Skeleton /> : (
            <div className={styles.topicGrid}>
              {groupedChallengeLogs.length === 0 ? (
                <EmptyState message="Belum ada aktivitas tantangan berpikir" />
              ) : (
                groupedChallengeLogs.map(({ topic, items }) => (
                  <article key={topic} className={styles.topicCard}>
                    <header>
                      <h3>{topic}</h3>
                      <span>{items.length} tantangan</span>
                    </header>
                    <ul>
                      {items.map((log) => (
                        <li key={log.id}>
                          <div className={styles.promptLine}>
                            <strong>Tantangan:</strong>
                            <p>{log.question}</p>
                          </div>
                          <div className={styles.answerLine}>
                            <strong>Jawaban:</strong>
                            <p>{log.answer}</p>
                          </div>
                          <div className={styles.feedbackBox}>
                            <strong>Umpan Balik AI:</strong>
                            <p>{log.feedback || 'Belum ada umpan balik'}</p>
                          </div>
                          {log.reasoningNote && (
                            <div className={styles.feedbackBox}>
                              <strong>Reasoning Siswa:</strong>
                              <p>{log.reasoningNote}</p>
                            </div>
                          )}
                          <RawDetail title="Lihat Detail" data={log} />
                          <footer>
                            <span>{log.userEmail}</span>
                            <span>{log.timestamp}</span>
                          </footer>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))
              )}
            </div>
          )
        )}

        {/* ────────────────────────────────────────────────
            Tab 3: Kuis — grouped by attempt
        ──────────────────────────────────────────────── */}
        {activeTab === 'examples' && (
          logsLoading ? <Skeleton /> : (
            <div className={styles.topicGrid}>
              {groupedExampleLogs.length === 0 ? (
                <EmptyState message="Belum ada pemakaian fitur Beri Contoh" />
              ) : (
                groupedExampleLogs.map(({ topic, items }) => (
                  <article key={topic} className={styles.topicCard}>
                    <header>
                      <h3>{topic}</h3>
                      <span>{items.length} pemakaian</span>
                    </header>
                    <ul>
                      {items.map((log) => (
                        <li key={log.id}>
                          <div className={styles.promptLine}>
                            <strong>Dipakai pada:</strong>
                            <p>Halaman {log.pageNumber + 1} · {log.examplesCount} contoh digenerate</p>
                          </div>
                          <div className={styles.feedbackBox}>
                            <strong>Status penyimpanan:</strong>
                            <p>Isi contoh tetap sementara di browser siswa; admin hanya menyimpan bukti pemakaian fitur.</p>
                          </div>
                          <RawDetail title="Lihat Detail" data={log} />
                          <footer>
                            <span>{log.userEmail}</span>
                            <span>{log.timestamp}</span>
                          </footer>
                        </li>
                      ))}
                    </ul>
                  </article>
                ))
              )}
            </div>
          )
        )}

        {activeTab === 'quiz' && (
          logsLoading ? <Skeleton /> : (
            <div className={styles.quizList}>
              {quizPagination && (
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
                  <p style={{ margin: 0, color: '#6b7280', fontSize: '0.92rem' }}>
                    Menampilkan {quizLogs.length} dari {quizPagination.totalItems} jawaban
                    {' '}
                    · Halaman {quizPagination.page}/{Math.max(quizPagination.totalPages, 1)}
                  </p>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button
                      type="button"
                      className={styles.refreshBtn}
                      onClick={() => setQuizPage((current) => Math.max(1, current - 1))}
                      disabled={logsLoading || !quizPagination.hasPreviousPage}
                    >
                      Sebelumnya
                    </button>
                    <button
                      type="button"
                      className={styles.refreshBtn}
                      onClick={() => setQuizPage((current) => current + 1)}
                      disabled={logsLoading || !quizPagination.hasNextPage}
                    >
                      Berikutnya
                    </button>
                  </div>
                </div>
              )}
              {quizLogs.length === 0 ? (
                <EmptyState message="Belum ada pengerjaan kuis" />
              ) : (
                groupedQuizAttempts.map((group) => (
                  <article key={group.key} className={styles.quizCard}>
                    <header>
                      <div>
                        <h3>
                          {group.topic}
                          <span style={{ marginLeft: 8, fontSize: '0.75rem', padding: '2px 8px', background: '#eef2ff', color: '#4338ca', borderRadius: 999, fontWeight: 600 }}>
                            Attempt #{group.attemptNumber}
                          </span>
                        </h3>
                        <p>{group.courseTitle}</p>
                        <p style={{ marginTop: 4, fontSize: '0.8rem', color: '#6b7280' }}>
                          {group.quizAttemptId ? `Attempt ID: ${group.quizAttemptId}` : 'Attempt ID belum tersedia'}
                        </p>
                      </div>
                      <div className={group.score >= 80 ? styles.pillSuccess : styles.pillMuted}>
                        {group.correctCount}/{group.totalCount} jawaban benar · {group.score}%
                      </div>
                    </header>

                    {group.items.map((log) => (
                      <div key={log.id} style={{ borderTop: '1px solid #e5e7eb', paddingTop: '0.85rem', marginTop: '0.85rem' }}>
                        <div className={styles.questionBox}>
                          <strong>Pertanyaan</strong>
                          <p>{log.question}</p>
                        </div>

                        {log.options && log.options.length > 0 && (
                          <div className={styles.optionsList}>
                            {log.options.map((opt, idx) => {
                              const isUserAnswer = opt === log.userAnswer
                              const isCorrectAnswer = opt === log.correctAnswer
                              let optClass = styles.optionItem
                              if (isCorrectAnswer) optClass += ` ${styles.optionItemCorrect}`
                              else if (isUserAnswer && !log.isCorrect) optClass += ` ${styles.optionItemWrong}`
                              return (
                                <div key={idx} className={optClass}>
                                  {String.fromCharCode(65 + idx)}. {opt}
                                  {isUserAnswer && !isCorrectAnswer && ' (jawaban siswa)'}
                                </div>
                              )
                            })}
                          </div>
                        )}

                        <div className={styles.answerCompare}>
                          <div>
                            <span>Jawaban Siswa</span>
                            <p>{log.userAnswer || '-'}</p>
                          </div>
                          <div>
                            <span>Kunci Jawaban</span>
                            <p>{log.correctAnswer || '-'}</p>
                          </div>
                        </div>

                        {log.reasoningNote && (
                          <div className={styles.feedbackBox}>
                            <strong>Reasoning Siswa:</strong>
                            <p>{log.reasoningNote}</p>
                          </div>
                        )}
                      </div>
                    ))}

                    <RawDetail title="Lihat Detail Attempt" data={group} />
                    <footer>
                      <span>{group.userEmail}</span>
                      <span>{group.timestamp}</span>
                    </footer>
                  </article>
                ))
              )}
            </div>
          )
        )}

        {/* ────────────────────────────────────────────────
            Tab 4: Refleksi (Jurnal + Feedback merged)
        ──────────────────────────────────────────────── */}
        {activeTab === 'refleksi' && (
          logsLoading ? <Skeleton /> : (
            <div className={styles.refleksiGrid}>
              {refleksiLogs.length === 0 ? (
                <EmptyState message="Belum ada entri refleksi" />
              ) : (
                refleksiLogs.map((log) => (
                  <article key={log.id} className={styles.refleksiCard}>
                    <header>
                      <div>
                        <h3>{log.topic}</h3>
                        <p>{log.userEmail}</p>
                      </div>
                      <div className={styles.refleksiHeaderMeta}>
                        {log.hasJournal && log.hasFeedback && (
                          <span className={styles.sourceBadge}>Jurnal + Feedback</span>
                        )}
                        {log.hasJournal && !log.hasFeedback && (
                          <span className={styles.sourceBadge}>Jurnal</span>
                        )}
                        {log.hasFeedback && !log.hasJournal && (
                          <span className={styles.sourceBadge}>Feedback</span>
                        )}
                        {(typeof log.rating === 'number' || typeof log.contentRating === 'number') && (
                          <span className={styles.ratingBadge}>
                            {log.rating ?? log.contentRating ?? '-'}
                          </span>
                        )}
                      </div>
                    </header>

                    {log.hasJournal ? (
                      <>
                        <div className={styles.feedbackBox}>
                          <strong>Yang Dipahami:</strong>
                          <p>{log.understood || '-'}</p>
                        </div>
                        <div className={styles.feedbackBox}>
                          <strong>Yang Membingungkan:</strong>
                          <p>{log.confused || '-'}</p>
                        </div>
                        <div className={styles.feedbackBox}>
                          <strong>Strategi:</strong>
                          <p>{log.strategy || '-'}</p>
                        </div>
                        <div className={styles.feedbackBox}>
                          <strong>Evolusi Prompt:</strong>
                          <p>{log.promptEvolution || '-'}</p>
                        </div>
                        {log.contentFeedback && (
                          <div className={styles.feedbackBox}>
                            <strong>Umpan Balik Konten:</strong>
                            <p>{log.contentFeedback}</p>
                          </div>
                        )}
                      </>
                    ) : log.comment ? (
                      /* Feedback-type entry */
                      <div className={styles.feedbackBox}>
                        <strong>Komentar:</strong>
                        <p>{log.comment}</p>
                      </div>
                    ) : (
                      <div className={styles.feedbackBox}>
                        <strong>Konten:</strong>
                        <p>{log.content || 'Tidak ada konten'}</p>
                      </div>
                    )}

                    <RawDetail title="Lihat Detail" data={log} />
                    <footer>
                      <div>
                        <small>Pengguna</small>
                        <span>{log.userEmail}</span>
                      </div>
                      <div>
                        <small>Waktu</small>
                        <span>{log.timestamp}</span>
                      </div>
                    </footer>
                  </article>
                ))
              )}
            </div>
          )
        )}

        {/* ────────────────────────────────────────────────
            Tab 5: Diskusi
        ──────────────────────────────────────────────── */}
        {activeTab === 'diskusi' && (
          <>
            {/* Diskusi top bar: status filter + refresh */}
            <div className={styles.diskusiTopBar}>
              <select
                value={diskusiStatusFilter}
                onChange={(e) => setDiskusiStatusFilter(e.target.value)}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <button
                type="button"
                className={styles.refreshBtn}
                onClick={() => setReloadCounter((c) => c + 1)}
                disabled={loadingSessions}
              >
                <FiRotateCcw /> {loadingSessions ? 'Memuat...' : 'Segarkan'}
              </button>
            </div>

            {listError && <div className={styles.errorBanner}>{listError}</div>}

            <div className={styles.diskusiLayout}>
              {/* Session List */}
              <div className={styles.sessionList}>
                <h3>Daftar Sesi</h3>
                {loadingSessions ? (
                  <div className={styles.placeholder}>Memuat sesi diskusi...</div>
                ) : sessions.length === 0 ? (
                  <div className={styles.placeholder}>Belum ada sesi untuk filter ini.</div>
                ) : (
                  <ul className={styles.sessionItems}>
                    {sessions.map((session) => {
                      const coveredCount = session.learningGoals.filter((g) => g.covered).length
                      return (
                        <li
                          key={session.id}
                          className={`${styles.sessionItem} ${session.id === selectedSessionId ? styles.sessionItemActive : ''}`}
                          onClick={() => handleSelectSession(session.id)}
                        >
                          <div className={styles.sessionHeader}>
                            <span className={styles.sessionCourse}>
                              {session.course.title ?? 'Tanpa judul'}
                            </span>
                            <span className={`${styles.statusBadge} ${getSessionStatusClass(session.status)}`}>
                              {getSessionStatusLabel(session.status)}
                            </span>
                          </div>
                          <p className={styles.sessionSubtopic}>
                            {session.subtopic.title ?? 'Subtopik tidak diketahui'}
                          </p>
                          <div className={styles.sessionMeta}>
                            <span>{session.user.email ?? 'Anonim'}</span>
                            <span>Goals: {coveredCount}/{session.learningGoals.length}</span>
                            <span>Fase: {getPhaseLabel(session.phase)}</span>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {/* Session Detail Panel */}
              <div className={styles.sessionDetail}>
                {!selectedSessionId ? (
                  <div className={styles.placeholder}>
                    Pilih sesi untuk melihat detail transkrip dan tujuan pembelajaran.
                  </div>
                ) : detailError ? (
                  <div className={styles.errorBanner}>{detailError}</div>
                ) : loadingDetail || !detail ? (
                  <div className={styles.placeholder}>Memuat detail sesi...</div>
                ) : (
                  <>
                    {/* Detail Header */}
                    <div className={styles.detailHeader}>
                      <div>
                        <h3>{detail.session.subtopic.title ?? 'Subtopik'}</h3>
                        <p>
                          {detail.session.course.title ?? 'Tanpa kursus'} /{' '}
                          {detail.session.user.email ?? 'Anonim'}
                        </p>
                      </div>
                      <div className={styles.headerBadges}>
                        <span className={styles.phaseBadge}>
                          {getPhaseLabel(detail.session.phase)}
                        </span>
                        <span className={`${styles.statusBadge} ${getSessionStatusClass(detail.session.status)}`}>
                          {getSessionStatusLabel(detail.session.status)}
                        </span>
                      </div>
                    </div>

                    {/* Highlights */}
                    <div className={styles.detailHighlights}>
                      <div className={styles.highlightCard}>
                        <span className={styles.highlightLabel}>Fase Diskusi</span>
                        <strong className={styles.highlightValue}>
                          {getPhaseLabel(detail.session.phase)}
                        </strong>
                          <p className={styles.highlightHint}>
                            Terakhir diperbarui:{' '}
                          {new Date(detail.session.updatedAt || detail.session.createdAt || Date.now()).toLocaleString('id-ID')}
                          </p>
                      </div>
                      <div className={styles.highlightCard}>
                        <span className={styles.highlightLabel}>Pencapaian Tujuan</span>
                        <div className={styles.goalProgress}>
                          <div className={styles.goalScore}>
                            {goalStats.covered}/{goalStats.total || '-'}
                          </div>
                          <div className={styles.progressBar}>
                            <div
                              className={styles.progressFill}
                              style={{ width: `${goalStats.percentage}%` }}
                            />
                          </div>
                          <small>{goalStats.percentage}% tujuan tercapai</small>
                        </div>
                      </div>
                      <div className={styles.highlightCard}>
                        <span className={styles.highlightLabel}>Kesiapan Modul</span>
                        {prereqLoading ? (
                          <p className={styles.highlightHint}>Memuat evaluasi prasyarat...</p>
                        ) : prereqError ? (
                          <p className={styles.highlightHint}>{prereqError}</p>
                        ) : prereqInfo ? (
                          <>
                            <span className={`${styles.prereqBadge} ${prereqInfo.ready ? styles.prereqReady : styles.prereqPending}`}>
                              {prereqInfo.ready ? 'Siap untuk diskusi' : 'Butuh persiapan'}
                            </span>
                            <div className={styles.prereqStats}>
                              <div>
                                <label>Subtopik</label>
                                <strong>
                                  {prereqInfo.summary.generatedSubtopics}/
                                  {prereqInfo.summary.expectedSubtopics}
                                </strong>
                              </div>
                              <div>
                                <label>Kuis Terjawab</label>
                                <strong>
                                  {prereqInfo.summary.answeredQuizQuestions}/
                                  {prereqInfo.summary.totalQuizQuestions}
                                </strong>
                              </div>
                            </div>
                            {prereqInfo.subtopics.some((item) => !item.generated || !item.quizCompleted) && (
                              <ul className={styles.prereqList}>
                                {prereqInfo.subtopics
                                  .filter((item) => !item.generated || !item.quizCompleted)
                                  .slice(0, 3)
                                  .map((item) => (
                                    <li key={item.key}>
                                      <span>{item.title}</span>
                                      <small>
                                        {!item.generated ? 'Materi belum digenerate' : 'Kuis belum lengkap'}
                                      </small>
                                    </li>
                                  ))}
                              </ul>
                            )}
                          </>
                        ) : (
                          <p className={styles.highlightHint}>Tidak ada data prasyarat.</p>
                        )}
                      </div>
                    </div>

                    {/* Goals + Monitoring Snapshot */}
                    <div className={styles.detailGrid}>
                      <div className={styles.card}>
                        <h4>Tujuan Pembelajaran</h4>
                        <ul className={styles.goalList}>
                          {selectedSessionGoals.map((goal) => (
                            <li key={goal.id} className={styles.goalItem}>
                              <div>
                                <p>{goal.description}</p>
                                {!!goal.rubric?.success_summary && (
                                  <small>{String(goal.rubric.success_summary)}</small>
                                )}
                                {(goal.assessmentNotes || goal.mentorNote || goal.modelAnswer) && (
                                  <small>
                                    {goal.assessmentNotes || goal.mentorNote || goal.modelAnswer}
                                  </small>
                                )}
                              </div>
                              <span
                                className={`${styles.goalToggleBtn} ${goal.covered ? styles.goalToggleBtnCovered : styles.goalToggleBtnUncovered}`}
                              >
                                {getGoalMasteryLabel(goal)}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      <div className={styles.card}>
                        <h4>Monitoring Cepat</h4>
                        <div className={styles.feedbackBox}>
                          <strong>Status Sesi:</strong>
                          <p>{getSessionStatusLabel(detail.session.status)}</p>
                        </div>
                        <div className={styles.feedbackBox}>
                          <strong>Tujuan Tercapai:</strong>
                          <p>
                            {goalStats.covered}/{goalStats.total || '-'} tujuan
                          </p>
                        </div>
                        <div className={styles.feedbackBox}>
                          <strong>Kualitas Pemahaman:</strong>
                          <p>
                            {masteryStats.met} kuat, {masteryStats.near} mendekati, {masteryStats.weak} perlu diperkuat
                            {masteryStats.unassessable ? `, ${masteryStats.unassessable} belum dapat dinilai` : ''}
                          </p>
                        </div>
                        <div className={styles.feedbackBox}>
                          <strong>Alasan Penyelesaian:</strong>
                          <p>{detail.session.completionReason || 'Belum selesai'}</p>
                        </div>
                        <div className={styles.feedbackBox}>
                          <strong>Assessment Terekam:</strong>
                          <p>{detail.assessments.length} penilaian goal</p>
                        </div>
                        <div className={styles.feedbackBox}>
                          <strong>Pembaruan Terakhir:</strong>
                          <p>{new Date(detail.session.updatedAt || detail.session.createdAt || Date.now()).toLocaleString('id-ID')}</p>
                        </div>
                        {detail.adminActions.length > 0 && (
                          <div className={styles.actionHistory}>
                            <h5>Riwayat Aktivitas Admin</h5>
                            <ul>
                              {detail.adminActions.map((action) => (
                                <li key={action.id}>
                                  <strong>{action.action}</strong>
                                  {action.adminEmail ? ` oleh ${action.adminEmail}` : ''}
                                  {' '}
                                  pada {new Date(action.createdAt || Date.now().toString()).toLocaleString('id-ID')}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Transcript */}
                    <div className={styles.card}>
                      <h4>Transkrip Diskusi</h4>
                      <div className={styles.messages}>
                        {detail.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`${styles.message} ${message.role === 'agent' ? styles.messageAgent : styles.messageStudent}`}
                          >
                            <div className={styles.messageHeader}>
                              <span>
                                {message.role === 'agent' ? 'Mentor' : 'Siswa'} -{' '}
                                {new Date(message.createdAt).toLocaleTimeString('id-ID')}
                              </span>
                              <small>{getMessageTypeLabel(message)}</small>
                              {!!message.metadata?.phase && (
                                <small>{String(message.metadata.phase)}</small>
                              )}
                              {!!(message.metadata?.adminEmail || message.metadata?.admin_email) && (
                                <small>
                                  {String(message.metadata.adminEmail || message.metadata.admin_email)}
                                </small>
                              )}
                            </div>
                            <p>{message.content}</p>
                            {message.role === 'student' && (assessmentsByMessage.get(message.id)?.length ?? 0) > 0 && (
                              <div className={styles.assessmentPanel}>
                                <strong>Penilaian Jawaban</strong>
                                <div className={styles.assessmentGrid}>
                                  {assessmentsByMessage.get(message.id)?.map((assessment) => (
                                    <div key={assessment.id} className={styles.assessmentCard}>
                                      <div className={styles.assessmentCardHeader}>
                                        <span>{getAssessmentStatusLabel(assessment.assessmentStatus)}</span>
                                        <small>Skor {assessment.proximityScore}/100</small>
                                      </div>
                                      <p>{assessment.goalDescription || assessment.goalId}</p>
                                      <small>
                                        Attempt {assessment.attemptNumber}
                                        {assessment.remediationRound ? ` - Remediation ${assessment.remediationRound}` : ''}
                                        {assessment.advanceAllowed ? ' - lanjut' : ' - perlu perbaikan'}
                                      </small>
                                      {assessment.coachFeedback && (
                                        <p className={styles.assessmentNote}>{assessment.coachFeedback}</p>
                                      )}
                                      {assessment.idealAnswer && (
                                        <p className={styles.assessmentIdeal}>
                                          Jawaban ideal: {assessment.idealAnswer}
                                        </p>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}

// ── Skeleton loader component ──

function Skeleton() {
  return (
    <div className={styles.skeletonWrap}>
      <div className={styles.skeletonCard} />
      <div className={styles.skeletonCard} />
      <div className={styles.skeletonCard} />
    </div>
  )
}
