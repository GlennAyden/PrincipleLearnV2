'use client'

import React, { useEffect, useMemo, useState } from 'react'
import styles from './page.module.scss'
import {
  FiFileText,
  FiHelpCircle,
  FiTarget,
  FiCheckSquare,
  FiStar,
  FiMessageCircle,
  FiFilter,
  FiRotateCcw,
} from 'react-icons/fi'
import { useRouter } from 'next/navigation'
import { useAdmin } from "@/hooks/useAdmin"
import JournalModal from '@/components/admin/JournalModal'
import TranscriptModal from '@/components/admin/TranscriptModal'

interface OutlineSubtopic {
  title: string
  overview: string
}

interface OutlineModule {
  title: string
  subtopics: OutlineSubtopic[]
}

interface GenerateLogItem {
  id: string
  timestamp: string
  courseName: string
  userEmail: string
  userId: string
  courseId: string | null
  requestPayload?: {
    step1?: Record<string, unknown>
    step2?: Record<string, unknown>
    step3?: Record<string, unknown>
    [key: string]: unknown
  }
  steps: {
    step1?: { topic?: string; goal?: string }
    step2?: { level?: string; extraTopics?: string }
    step3?: { problem?: string; assumption?: string }
  }
  outline: OutlineModule[]
}

interface AskLogItem {
  id: string
  timestamp: string
  topic: string
  question: string
  answer: string
  reasoningNote?: string
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

interface ChallengeLogItem extends AskLogItem {
  feedback: string
  reasoningNote?: string
}

interface QuizLogItem {
  id: string
  timestamp: string
  topic: string
  question: string
  options: string[]
  userAnswer: string
  correctAnswer: string
  isCorrect: boolean
  reasoningNote?: string
  userEmail: string
  userId: string
  courseTitle: string
}

interface FeedbackLogItem {
  id: string
  timestamp: string
  topic: string
  comment: string
  rating: number | null
  userEmail: string
  userId: string
  courseTitle: string
  moduleIndex: number | null
  subtopicIndex: number | null
}

interface JurnalLogItem {
  id: string
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
}

interface TranscriptLogItem {
  id: string
  timestamp: string
  topic: string
  content: string
  userEmail: string
  userId: string
}

interface LearningProfileLogItem {
  id: string
  timestamp: string
  userEmail: string
  userId: string
  displayName: string
  programmingExperience: string
  learningStyle: string
  learningGoals: string
  challenges: string
}

interface DiscussionGoal {
  id: string
  description: string
  covered: boolean
  thinkingSkill?: {
    domain?: string
    indicator?: string
    indicatorDescription?: string
  } | null
}

interface DiscussionExchange {
  stepKey: string | null
  prompt: string
  response?: string
  coachFeedback?: string
  thinkingSkills: DiscussionGoal[]
}

interface DiscussionLogItem {
  id: string
  timestamp: string
  status: string
  phase: string
  userEmail: string
  userId: string
  courseTitle: string
  subtopicTitle: string
  goals: DiscussionGoal[]
  exchanges: DiscussionExchange[]
}

const TABS = [
  { id: 'generate', label: 'Generate Course', icon: FiFileText },
  { id: 'ask', label: 'Ask Question', icon: FiHelpCircle },
  { id: 'challenge', label: 'Challenge Thinking', icon: FiTarget },
  { id: 'quiz', label: 'Quiz', icon: FiCheckSquare },
  { id: 'feedback', label: 'Feedback', icon: FiStar },
  { id: 'jurnal', label: 'Jurnal', icon: FiFileText },
  { id: 'transcript', label: 'Transcript', icon: FiFileText },
  { id: 'learningProfile', label: 'Learning Profile', icon: FiFileText },
  { id: 'discussion', label: 'Discussion', icon: FiMessageCircle },
]

const TAB_DESCRIPTIONS: Record<string, string> = {
  generate: 'Course generation requests and produced outlines.',
  ask: 'Automatic question and answer interactions by topic.',
  challenge: 'Challenge-thinking traces with AI feedback quality.',
  quiz: 'Quiz attempts with answer comparison and correctness.',
  feedback: 'Learner feedback and rating snapshots per context.',
  jurnal: 'Learner reflection journal entries.',
  transcript: 'Saved QnA transcript trail from subtopic interactions.',
  learningProfile: 'Onboarding profile records and learner preferences.',
  discussion: 'Guided discussion sessions, goals, and exchange timeline.',
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

const RawDetail = ({
  title,
  data,
}: {
  title: string
  data: unknown
}) => (
  <details className={styles.rawDetail}>
    <summary>{title}</summary>
    <pre>{JSON.stringify(data, null, 2)}</pre>
  </details>
)

export default function AdminActivityPage() {
  const router = useRouter()
  const { admin, loading: authLoading } = useAdmin()

  const [users, setUsers] = useState<{ id: string; email: string }[]>([])
  const [selectedUser, setSelectedUser] = useState('')
  const [selectedDate, setSelectedDate] = useState('')
  const [selectedCourse, setSelectedCourse] = useState('')
  const [selectedTopic, setSelectedTopic] = useState('')

  const [courses, setCourses] = useState<{ id: string; title: string }[]>([])
  const [topics, setTopics] = useState<{ id: string; title: string }[]>([])

  const [activeTab, setActiveTab] = useState('generate')

  const [generateLogs, setGenerateLogs] = useState<GenerateLogItem[]>([])
  const [askLogs, setAskLogs] = useState<AskLogItem[]>([])
  const [challengeLogs, setChallengeLogs] = useState<ChallengeLogItem[]>([])
  const [quizLogs, setQuizLogs] = useState<QuizLogItem[]>([])
  const [feedbackLogs, setFeedbackLogs] = useState<FeedbackLogItem[]>([])
  const [jurnalLogs, setJurnalLogs] = useState<JurnalLogItem[]>([])
  const [selectedJournal, setSelectedJournal] = useState<JurnalLogItem | null>(null)
  const [transcriptLogs, setTranscriptLogs] = useState<TranscriptLogItem[]>([])
  const [selectedTranscript, setSelectedTranscript] = useState<TranscriptLogItem | null>(null)
  const [learningProfileLogs, setLearningProfileLogs] = useState<LearningProfileLogItem[]>([])
  const [discussionLogs, setDiscussionLogs] = useState<DiscussionLogItem[]>([])
  const [logsLoading, setLogsLoading] = useState(false)

  const groupedAskLogs = useMemo(() => groupByTopic(askLogs), [askLogs])
  const groupedChallengeLogs = useMemo(() => groupByTopic(challengeLogs), [challengeLogs])

  const clearAllFilters = () => {
    setSelectedUser('')
    setSelectedDate('')
    setSelectedCourse('')
    setSelectedTopic('')
  }

  const activeFilterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string }> = []
    if (selectedUser) {
      const user = users.find((u) => u.id === selectedUser)
      chips.push({ key: 'user', label: `User: ${user?.email ?? selectedUser}` })
    }
    if (selectedDate) chips.push({ key: 'date', label: `Date: ${selectedDate}` })
    if (selectedCourse) {
      const course = courses.find((c) => c.id === selectedCourse)
      chips.push({ key: 'course', label: `Course: ${course?.title ?? selectedCourse}` })
    }
    if (selectedTopic) chips.push({ key: 'topic', label: `Topic: ${selectedTopic}` })
    return chips
  }, [selectedUser, selectedDate, selectedCourse, selectedTopic, users, courses])

  const summaryCards = useMemo(() => {
    if (activeTab === 'generate') {
      return [
        { label: 'Requests', value: generateLogs.length },
        {
          label: 'Unique Users',
          value: new Set(generateLogs.map((log) => log.userId)).size,
        },
        {
          label: 'With Outline',
          value: generateLogs.filter((log) => log.outline.length > 0).length,
        },
      ]
    }

    if (activeTab === 'ask') {
      return [
        { label: 'Questions', value: askLogs.length },
        { label: 'Topics', value: groupedAskLogs.length },
        {
          label: 'Unique Users',
          value: new Set(askLogs.map((log) => log.userId)).size,
        },
      ]
    }

    if (activeTab === 'challenge') {
      return [
        { label: 'Challenges', value: challengeLogs.length },
        {
          label: 'With Feedback',
          value: challengeLogs.filter((log) => !!log.feedback).length,
        },
        {
          label: 'Unique Users',
          value: new Set(challengeLogs.map((log) => log.userId)).size,
        },
      ]
    }

    if (activeTab === 'quiz') {
      const correct = quizLogs.filter((log) => log.isCorrect).length
      const accuracy = quizLogs.length > 0 ? Math.round((correct / quizLogs.length) * 100) : 0
      return [
        { label: 'Attempts', value: quizLogs.length },
        { label: 'Correct', value: correct },
        { label: 'Accuracy', value: `${accuracy}%` },
      ]
    }

    if (activeTab === 'feedback') {
      const rated = feedbackLogs.filter((log) => typeof log.rating === 'number')
      const avg = rated.length > 0
        ? (rated.reduce((sum, log) => sum + (log.rating ?? 0), 0) / rated.length).toFixed(1)
        : '0.0'
      return [
        { label: 'Feedback Items', value: feedbackLogs.length },
        { label: 'Rated', value: rated.length },
        { label: 'Avg Rating', value: avg },
      ]
    }

    if (activeTab === 'jurnal') {
      return [
        { label: 'Journal Entries', value: jurnalLogs.length },
        {
          label: 'Unique Users',
          value: new Set(jurnalLogs.map((log) => log.userId)).size,
        },
        {
          label: 'Topics',
          value: new Set(jurnalLogs.map((log) => log.topic)).size,
        },
      ]
    }

    if (activeTab === 'transcript') {
      return [
        { label: 'Transcript Entries', value: transcriptLogs.length },
        {
          label: 'Unique Users',
          value: new Set(transcriptLogs.map((log) => log.userId)).size,
        },
        {
          label: 'Topics',
          value: new Set(transcriptLogs.map((log) => log.topic)).size,
        },
      ]
    }

    if (activeTab === 'learningProfile') {
      return [
        { label: 'Profiles', value: learningProfileLogs.length },
        {
          label: 'Unique Users',
          value: new Set(learningProfileLogs.map((log) => log.userId)).size,
        },
        {
          label: 'With Goals',
          value: learningProfileLogs.filter((log) => log.learningGoals.trim().length > 0).length,
        },
      ]
    }

    const coveredGoals = discussionLogs.reduce(
      (sum, log) => sum + log.goals.filter((goal) => goal.covered).length,
      0
    )
    return [
      { label: 'Sessions', value: discussionLogs.length },
      {
        label: 'Total Exchanges',
        value: discussionLogs.reduce((sum, log) => sum + log.exchanges.length, 0),
      },
      { label: 'Covered Goals', value: coveredGoals },
    ]
  }, [
    activeTab,
    askLogs,
    challengeLogs,
    discussionLogs,
    feedbackLogs,
    generateLogs,
    groupedAskLogs.length,
    jurnalLogs,
    learningProfileLogs,
    quizLogs,
    transcriptLogs,
  ])

  const tabCount = useMemo(() => {
    switch (activeTab) {
      case 'generate':
        return generateLogs.length
      case 'ask':
        return askLogs.length
      case 'challenge':
        return challengeLogs.length
      case 'quiz':
        return quizLogs.length
      case 'feedback':
        return feedbackLogs.length
      case 'jurnal':
        return jurnalLogs.length
      case 'transcript':
        return transcriptLogs.length
      case 'learningProfile':
        return learningProfileLogs.length
      case 'discussion':
        return discussionLogs.length
      default:
        return 0
    }
  }, [
    activeTab,
    askLogs.length,
    challengeLogs.length,
    discussionLogs.length,
    feedbackLogs.length,
    generateLogs.length,
    jurnalLogs.length,
    learningProfileLogs.length,
    quizLogs.length,
    transcriptLogs.length,
  ])

  const activeTabLabel = TABS.find((tab) => tab.id === activeTab)?.label ?? 'Activity'

  useEffect(() => {
    if (!authLoading && !admin) router.push('/admin/login')
  }, [authLoading, admin, router])

  useEffect(() => {
    if (authLoading || !admin) return
    fetch('/api/admin/users', { credentials: 'include' })
      .then((res) => res.json())
      .then(setUsers)
  }, [authLoading, admin])

  useEffect(() => {
    if (authLoading || !admin) return
    fetch('/api/admin/activity/courses', { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setCourses(Array.isArray(data.courses) ? data.courses : []))
      .catch(() => setCourses([]))
  }, [authLoading, admin])

  useEffect(() => {
    if (authLoading || !admin) return
    if (!selectedCourse) {
      setTopics([])
      return
    }
    fetch(`/api/admin/activity/topics?courseId=${selectedCourse}`, { credentials: 'include' })
      .then((res) => res.json())
      .then((data) => setTopics(Array.isArray(data.topics) ? data.topics : []))
      .catch(() => setTopics([]))
  }, [selectedCourse, authLoading, admin])

  const requiresCourseFilter = !['generate', 'learningProfile'].includes(activeTab)
  const requiresTopicFilter = ['ask', 'challenge', 'quiz', 'feedback', 'discussion', 'jurnal', 'transcript'].includes(activeTab)

  const buildParams = () => {
    const params = new URLSearchParams()
    if (selectedUser) params.set('userId', selectedUser)
    if (selectedDate) params.set('date', selectedDate)
    if (requiresCourseFilter && selectedCourse) params.set('course', selectedCourse)
    if (requiresTopicFilter && selectedTopic) params.set('topic', selectedTopic)
    return params.toString()
  }

  useEffect(() => {
    if (authLoading || !admin) return
    const params = buildParams()
    const endpointMap: Record<string, string> = {
      generate: 'generate-course',
      ask: 'ask-question',
      challenge: 'challenge',
      quiz: 'quiz',
      feedback: 'feedback',
      jurnal: 'jurnal',
      transcript: 'transcript',
      learningProfile: 'learning-profile',
      discussion: 'discussion',
    }
    const endpoint = endpointMap[activeTab]
    if (!endpoint) return
    const url = `/api/admin/activity/${endpoint}?${params}`

    setLogsLoading(true)
    fetch(url, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Failed to fetch logs')
        return res.json()
      })
      .then((data) => {
        switch (activeTab) {
          case 'generate':
            setGenerateLogs(data)
            break
          case 'ask':
            setAskLogs(data)
            break
          case 'challenge':
            setChallengeLogs(data)
            break
          case 'quiz':
            setQuizLogs(data)
            break
          case 'feedback':
            setFeedbackLogs(data)
            break
          case 'jurnal':
            setJurnalLogs(data)
            break
          case 'transcript':
            setTranscriptLogs(data)
            break
          case 'learningProfile':
            setLearningProfileLogs(data)
            break
          case 'discussion':
            setDiscussionLogs(data)
            break
        }
      })
      .catch(() => {
        switch (activeTab) {
          case 'generate':
            setGenerateLogs([])
            break
          case 'ask':
            setAskLogs([])
            break
          case 'challenge':
            setChallengeLogs([])
            break
          case 'quiz':
            setQuizLogs([])
            break
          case 'feedback':
            setFeedbackLogs([])
            break
          case 'jurnal':
            setJurnalLogs([])
            break
          case 'transcript':
            setTranscriptLogs([])
            break
          case 'learningProfile':
            setLearningProfileLogs([])
            break
          case 'discussion':
            setDiscussionLogs([])
            break
        }
      })
      .finally(() => setLogsLoading(false))
  }, [activeTab, selectedUser, selectedDate, selectedCourse, selectedTopic, authLoading, admin])

  if (authLoading) return <div className={styles.loading}>Loading...</div>
  if (!admin) return null

  return (
    <div className={styles.page}>
      <header className={styles.hero}>
        <div>
          <h1>Activity Intelligence</h1>
          <p>Track student interactions across generation, questioning, challenge, quizzes, feedback, and discussion traces.</p>
        </div>
      </header>

      <div className={styles.summaryStrip}>
        {summaryCards.map((card) => (
          <article key={card.label} className={styles.summaryCard}>
            <span>{card.label}</span>
            <strong>{card.value}</strong>
          </article>
        ))}
      </div>

      <section className={styles.filterPanel}>
        <div className={styles.filterHeader}>
          <div className={styles.filterTitle}>
            <FiFilter />
            <span>Filters</span>
          </div>
          <button
            className={styles.clearFilterBtn}
            type="button"
            onClick={clearAllFilters}
          >
            <FiRotateCcw /> Clear
          </button>
        </div>

        <div className={styles.filterBar}>
          <select
            className={styles.select}
            value={selectedUser}
            onChange={(e) => setSelectedUser(e.target.value)}
          >
            <option value="">Name</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.email}
              </option>
            ))}
          </select>

          <input
            type="date"
            className={styles.select}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            aria-label="Filter tanggal aktivitas"
          />

          {requiresCourseFilter && (
            <select
              className={styles.select}
              value={selectedCourse}
              onChange={(e) => {
                setSelectedCourse(e.target.value)
                setSelectedTopic('')
              }}
            >
              <option value="">Course</option>
              {courses.map((course) => (
                <option key={course.id} value={course.id}>
                  {course.title}
                </option>
              ))}
            </select>
          )}

          {requiresTopicFilter && (
            <select
              className={styles.select}
              value={selectedTopic}
              onChange={(e) => setSelectedTopic(e.target.value)}
              disabled={!selectedCourse}
            >
              <option value="">Topic/Subtopic</option>
              {topics.map((topic) => (
                <option key={topic.id} value={topic.title}>
                  {topic.title}
                </option>
              ))}
            </select>
          )}
        </div>

        {activeFilterChips.length > 0 && (
          <div className={styles.activeFilters}>
            {activeFilterChips.map((chip) => (
              <span key={chip.key} className={styles.filterChip}>{chip.label}</span>
            ))}
          </div>
        )}
      </section>

      <nav className={styles.tabs}>
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`${styles.tabBtn} ${activeTab === tab.id ? styles.tabBtnActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span className={styles.cardIcon}>
              <tab.icon />
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </nav>

      <section className={styles.contentPanel}>
        <header className={styles.sectionHeader}>
          <div>
            <h2>{activeTabLabel}</h2>
            <p>{TAB_DESCRIPTIONS[activeTab] ?? 'Activity records.'}</p>
          </div>
          <div className={styles.sectionMeta}>
            <span>{tabCount} records</span>
          </div>
        </header>

        {logsLoading ? (
          <div className={styles.skeletonWrap}>
            <div className={styles.skeletonCard} />
            <div className={styles.skeletonCard} />
            <div className={styles.skeletonCard} />
          </div>
        ) : (
          <>
            {activeTab === 'generate' && (
              <div className={styles.generateGrid}>
                {generateLogs.length === 0 ? (
                  <EmptyState message="Belum ada log generate course" />
                ) : (
                  generateLogs.map((log) => {
                    const step1 = log.steps.step1 ?? {}
                    const step2 = log.steps.step2 ?? {}
                    const step3 = log.steps.step3 ?? {}
                    return (
                      <article key={log.id} className={styles.generateCard}>
                        <header className={styles.cardHeader}>
                          <div>
                            <h3>{log.courseName}</h3>
                            <p>{log.userEmail}</p>
                          </div>
                          <span className={styles.timestamp}>{log.timestamp}</span>
                        </header>
                        <div className={styles.stepGrid}>
                          <div className={styles.stepCard}>
                            <h4>Step 1 - Need</h4>
                            <dl>
                              <div>
                                <dt>Topic</dt>
                                <dd>{step1.topic || '-'}</dd>
                              </div>
                              <div>
                                <dt>Goal</dt>
                                <dd>{step1.goal || '-'}</dd>
                              </div>
                            </dl>
                          </div>
                          <div className={styles.stepCard}>
                            <h4>Step 2 - Level</h4>
                            <dl>
                              <div>
                                <dt>Level</dt>
                                <dd>{step2.level || '-'}</dd>
                              </div>
                              <div>
                                <dt>Extra Topics</dt>
                                <dd>{step2.extraTopics || '-'}</dd>
                              </div>
                            </dl>
                          </div>
                          <div className={styles.stepCard}>
                            <h4>Step 3 - Context</h4>
                            <dl>
                              <div>
                                <dt>Problem</dt>
                                <dd>{step3.problem || '-'}</dd>
                              </div>
                              <div>
                                <dt>Assumption</dt>
                                <dd>{step3.assumption || '-'}</dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                        <div className={styles.outlineBlock}>
                          <h4>Outline dari OpenAI</h4>
                          {log.outline.length === 0 ? (
                            <p className={styles.muted}>Belum ada outline untuk request ini</p>
                          ) : (
                            <ol>
                              {log.outline.map((module) => (
                                <li key={module.title}>
                                  <strong>{module.title}</strong>
                                  <ul>
                                    {module.subtopics.map((subtopic) => (
                                      <li key={subtopic.title}>
                                        <span>{subtopic.title}</span>
                                        <small>{subtopic.overview}</small>
                                      </li>
                                    ))}
                                  </ul>
                                </li>
                              ))}
                            </ol>
                          )}
                        </div>
                        <div className={styles.outlineBlock}>
                          <h4>Request Payload (Raw)</h4>
                          <pre className={styles.feedbackComment}>
                            {JSON.stringify(log.requestPayload ?? log.steps ?? {}, null, 2)}
                          </pre>
                        </div>
                        <RawDetail title="Buka Detail Record" data={log} />
                      </article>
                    )
                  })
                )}
              </div>
            )}

            {activeTab === 'ask' && (
              <div className={styles.topicGrid}>
                {groupedAskLogs.length === 0 ? (
                  <EmptyState message="Belum ada riwayat pertanyaan otomatis" />
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
                            <div className={styles.promptLine}>
                              <strong>Q:</strong>
                              <p>{log.question}</p>
                            </div>
                            <div className={styles.answerLine}>
                              <strong>A:</strong>
                              <p>{log.answer}</p>
                            </div>
                            {log.promptComponents && (
                              <div className={styles.feedbackBox}>
                                <strong>Komponen Prompt:</strong>
                                <p>
                                  {[
                                    log.promptComponents.tujuan ? 'Tujuan' : null,
                                    log.promptComponents.konteks ? 'Konteks' : null,
                                    log.promptComponents.batasan ? 'Batasan' : null,
                                  ].filter(Boolean).join(', ') || '-'}
                                </p>
                              </div>
                            )}
                            {log.reasoningNote && (
                              <div className={styles.feedbackBox}>
                                <strong>Reasoning Siswa:</strong>
                                <p>{log.reasoningNote}</p>
                              </div>
                            )}
                            <RawDetail title="Buka Detail Record" data={log} />
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
            )}

            {activeTab === 'challenge' && (
              <div className={styles.topicGrid}>
                {groupedChallengeLogs.length === 0 ? (
                  <EmptyState message="Belum ada aktivitas challenge thinking" />
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
                              <strong>Jawaban Siswa:</strong>
                              <p>{log.answer}</p>
                            </div>
                            <div className={styles.feedbackBox}>
                              <strong>Feedback AI:</strong>
                              <p>{log.feedback || 'Belum ada feedback'}</p>
                            </div>
                            {log.reasoningNote && (
                              <div className={styles.feedbackBox}>
                                <strong>Reasoning Siswa:</strong>
                                <p>{log.reasoningNote}</p>
                              </div>
                            )}
                            <RawDetail title="Buka Detail Record" data={log} />
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
            )}

            {activeTab === 'quiz' && (
              <div className={styles.quizList}>
                {quizLogs.length === 0 ? (
                  <EmptyState message="Belum ada pengerjaan kuis" />
                ) : (
                  quizLogs.map((log) => (
                    <article key={log.id} className={styles.quizCard}>
                      <header>
                        <div>
                          <h3>{log.topic}</h3>
                          <p>{log.courseTitle}</p>
                        </div>
                        <div className={log.isCorrect ? styles.pillSuccess : styles.pillMuted}>
                          {log.isCorrect ? 'Benar' : 'Belum tepat'}
                        </div>
                      </header>
                      <div className={styles.questionBox}>
                        <strong>Pertanyaan</strong>
                        <p>{log.question}</p>
                      </div>
                      <div className={styles.answerCompare}>
                        <div>
                          <span>Jawaban User</span>
                          <p>{log.userAnswer || '-'}</p>
                        </div>
                        <div>
                          <span>Kunci</span>
                          <p>{log.correctAnswer || '-'}</p>
                        </div>
                      </div>
                      {log.reasoningNote && (
                        <div className={styles.feedbackBox}>
                          <strong>Reasoning Siswa:</strong>
                          <p>{log.reasoningNote}</p>
                        </div>
                      )}
                      <RawDetail title="Buka Detail Record" data={log} />
                      <footer>
                        <span>{log.userEmail}</span>
                        <span>{log.timestamp}</span>
                      </footer>
                    </article>
                  ))
                )}
              </div>
            )}

            {activeTab === 'feedback' && (
              <div className={styles.feedbackGrid}>
                {feedbackLogs.length === 0 ? (
                  <EmptyState message="Belum ada feedback" />
                ) : (
                  feedbackLogs.map((log) => (
                    <article key={log.id} className={styles.feedbackCard}>
                      <header>
                        <div>
                          <h3>{log.topic}</h3>
                          <p>{log.courseTitle}</p>
                        </div>
                        <span className={styles.ratingBadge}>{log.rating ?? '-'}</span>
                      </header>
                      <p className={styles.feedbackComment}>{log.comment || 'Tidak ada komentar'}</p>
                      <RawDetail title="Buka Detail Record" data={log} />
                      <footer>
                        <div>
                          <small>User</small>
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
            )}

            {activeTab === 'jurnal' && (
              <div className={styles.feedbackGrid}>
                {jurnalLogs.length === 0 ? (
                  <EmptyState message="Belum ada jurnal" />
                ) : (
                  jurnalLogs.map((log) => (
                    <article key={log.id} className={styles.feedbackCard}>
                      <header>
                        <div>
                          <h3>{log.topic}</h3>
                          <p>{log.userEmail}</p>
                        </div>
                      </header>
                      {log.type === 'structured_reflection' ? (
                        <>
                          <div className={styles.feedbackBox}>
                            <strong>Understood:</strong>
                            <p>{log.understood || '-'}</p>
                          </div>
                          <div className={styles.feedbackBox}>
                            <strong>Confused:</strong>
                            <p>{log.confused || '-'}</p>
                          </div>
                          <div className={styles.feedbackBox}>
                            <strong>Strategy:</strong>
                            <p>{log.strategy || '-'}</p>
                          </div>
                          <div className={styles.feedbackBox}>
                            <strong>Prompt Evolution:</strong>
                            <p>{log.promptEvolution || '-'}</p>
                          </div>
                          <div className={styles.answerCompare}>
                            <div>
                              <span>Content Rating</span>
                              <p>{typeof log.contentRating === 'number' ? log.contentRating : '-'}</p>
                            </div>
                            <div>
                              <span>Content Feedback</span>
                              <p>{log.contentFeedback || '-'}</p>
                            </div>
                          </div>
                        </>
                      ) : (
                        <p className={styles.feedbackComment}>{log.content || 'Tidak ada konten'}</p>
                      )}
                      <RawDetail title="Buka Detail Record" data={log} />
                      <footer>
                        <div>
                          <small>User</small>
                          <span>{log.userEmail}</span>
                        </div>
                        <div>
                          <small>Waktu</small>
                          <span>{log.timestamp}</span>
                        </div>
                        <div>
                          <button
                            type="button"
                            className={styles.clearFilterBtn}
                            onClick={() => setSelectedJournal(log)}
                          >
                            Detail
                          </button>
                        </div>
                      </footer>
                    </article>
                  ))
                )}
              </div>
            )}

            {activeTab === 'transcript' && (
              <div className={styles.feedbackGrid}>
                {transcriptLogs.length === 0 ? (
                  <EmptyState message="Belum ada transcript" />
                ) : (
                  transcriptLogs.map((log) => (
                    <article key={log.id} className={styles.feedbackCard}>
                      <header>
                        <div>
                          <h3>{log.topic}</h3>
                          <p>{log.userEmail}</p>
                        </div>
                      </header>
                      <p className={styles.feedbackComment}>{log.content || 'Tidak ada konten'}</p>
                      <RawDetail title="Buka Detail Record" data={log} />
                      <footer>
                        <div>
                          <small>User</small>
                          <span>{log.userEmail}</span>
                        </div>
                        <div>
                          <small>Waktu</small>
                          <span>{log.timestamp}</span>
                        </div>
                        <div>
                          <button
                            type="button"
                            className={styles.clearFilterBtn}
                            onClick={() => setSelectedTranscript(log)}
                          >
                            Detail
                          </button>
                        </div>
                      </footer>
                    </article>
                  ))
                )}
              </div>
            )}

            {activeTab === 'learningProfile' && (
              <div className={styles.feedbackGrid}>
                {learningProfileLogs.length === 0 ? (
                  <EmptyState message="Belum ada learning profile" />
                ) : (
                  learningProfileLogs.map((log) => (
                    <article key={log.id} className={styles.feedbackCard}>
                      <header>
                        <div>
                          <h3>{log.displayName || log.userEmail}</h3>
                          <p>{log.userEmail}</p>
                        </div>
                      </header>
                      <div className={styles.answerCompare}>
                        <div>
                          <span>Programming Experience</span>
                          <p>{log.programmingExperience || '-'}</p>
                        </div>
                        <div>
                          <span>Learning Style</span>
                          <p>{log.learningStyle || '-'}</p>
                        </div>
                      </div>
                      <div className={styles.feedbackBox}>
                        <strong>Learning Goals:</strong>
                        <p>{log.learningGoals || '-'}</p>
                      </div>
                      <div className={styles.feedbackBox}>
                        <strong>Challenges:</strong>
                        <p>{log.challenges || '-'}</p>
                      </div>
                      <RawDetail title="Buka Detail Record" data={log} />
                      <footer>
                        <div>
                          <small>User</small>
                          <span>{log.userEmail}</span>
                        </div>
                        <div>
                          <small>Update</small>
                          <span>{log.timestamp}</span>
                        </div>
                      </footer>
                    </article>
                  ))
                )}
              </div>
            )}

            {activeTab === 'discussion' && (
              <div className={styles.discussionGrid}>
                {discussionLogs.length === 0 ? (
                  <EmptyState message="Belum ada diskusi" />
                ) : (
                  discussionLogs.map((log, index) => (
                    <article key={log.id} className={styles.discussionCard}>
                      <header>
                        <div>
                          <h3>{log.subtopicTitle}</h3>
                          <p>{log.userEmail}</p>
                        </div>
                        <div className={styles.badgeRow}>
                          <span className={styles.badge}>{log.status}</span>
                          <span className={styles.badgeMuted}>{log.timestamp}</span>
                        </div>
                      </header>
                      <div className={styles.goalList}>
                        {log.goals.length === 0 ? (
                          <p className={styles.muted}>Belum ada goal yang tercatat</p>
                        ) : (
                          log.goals.map((goal) => (
                            <div
                              key={goal.id || `${log.id}-${goal.description}`}
                              className={`${styles.goalChip} ${goal.covered ? styles.goalHit : ''}`}
                            >
                              <span>{goal.description}</span>
                              {goal.thinkingSkill?.indicator && (
                                <small>{goal.thinkingSkill.indicator}</small>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                      <div className={styles.timeline}>
                        {log.exchanges.length === 0 ? (
                          <p className={styles.muted}>Belum ada percakapan</p>
                        ) : (
                          log.exchanges.map((exchange, stepIndex) => (
                            <div
                              key={exchange.stepKey ?? `${log.id}-${index}-${stepIndex}`}
                              className={styles.timelineItem}
                            >
                              <div className={styles.promptBubble}>{exchange.prompt}</div>
                              {exchange.response && (
                                <div className={styles.responseBubble}>{exchange.response}</div>
                              )}
                              {exchange.coachFeedback && (
                                <div className={styles.feedbackBubble}>{exchange.coachFeedback}</div>
                              )}
                              {exchange.thinkingSkills.length > 0 && (
                                <div className={styles.skillBadges}>
                                  {exchange.thinkingSkills.map((skill) => (
                                    <span key={`${exchange.stepKey}-${skill.id}`}>
                                      {skill.thinkingSkill?.indicator ?? 'Goal tercapai'}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))
                        )}
                      </div>
                      <RawDetail title="Buka Detail Record" data={log} />
                    </article>
                  ))
                )}
              </div>
            )}
          </>
        )}
      </section>

      <JournalModal
        isOpen={!!selectedJournal}
        journal={selectedJournal}
        onClose={() => setSelectedJournal(null)}
      />

      <TranscriptModal
        isOpen={!!selectedTranscript}
        transcript={selectedTranscript}
        onClose={() => setSelectedTranscript(null)}
      />
    </div>
  )
}
