'use client'

import React, { useEffect, useMemo, useState } from 'react'
import styles from './page.module.scss'
import {
  FiLogOut,
  FiHome,
  FiUsers,
  FiActivity,
  FiFileText,
  FiHelpCircle,
  FiTarget,
  FiCheckSquare,
  FiStar,
  FiMessageCircle,
} from 'react-icons/fi'
import { useRouter, usePathname } from 'next/navigation'
import { useAdmin } from "@/hooks/useAdmin"

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
  userEmail: string
  userId: string
  courseTitle: string
  moduleIndex: number
  subtopicIndex: number
  pageNumber: number
}

interface ChallengeLogItem extends AskLogItem {
  feedback: string
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
  { id: 'discussion', label: 'Discussion', icon: FiMessageCircle },
]

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

export default function AdminActivityPage() {
  const router = useRouter()
  const pathname = usePathname()
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
  const [discussionLogs, setDiscussionLogs] = useState<DiscussionLogItem[]>([])

  const groupedAskLogs = useMemo(() => groupByTopic(askLogs), [askLogs])
  const groupedChallengeLogs = useMemo(() => groupByTopic(challengeLogs), [challengeLogs])

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

  const requiresCourseFilter = activeTab !== 'generate'
  const requiresTopicFilter = ['ask', 'challenge', 'quiz', 'feedback', 'discussion'].includes(activeTab)

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
      discussion: 'discussion',
    }
    const endpoint = endpointMap[activeTab]
    if (!endpoint) return
    const url = `/api/admin/activity/${endpoint}?${params}`
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
          case 'discussion':
            setDiscussionLogs([])
            break
        }
      })
  }, [activeTab, selectedUser, selectedDate, selectedCourse, selectedTopic, authLoading, admin])

  if (authLoading) return <div className={styles.loading}>Loading...</div>
  if (!admin) return null

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>Principle Learn</div>
        <nav>
          <ul className={styles.navList}>
            <li
              className={`${styles.navItem} ${pathname === '/admin/dashboard' ? styles.active : ''}`}
              onClick={() => router.push('/admin/dashboard')}
            >
              <FiHome className={styles.navIcon} /> Dashboard
            </li>
            <li
              className={`${styles.navItem} ${pathname === '/admin/users' ? styles.active : ''}`}
              onClick={() => router.push('/admin/users')}
            >
              <FiUsers className={styles.navIcon} /> Users
            </li>
            <li
              className={`${styles.navItem} ${pathname === '/admin/activity' ? styles.active : ''}`}
              onClick={() => router.push('/admin/activity')}
            >
              <FiActivity className={styles.navIcon} /> Activity
            </li>
          </ul>
        </nav>
      </aside>

      <main className={styles.main}>
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

          <button className={styles.logout} onClick={() => router.push('/admin/login')}>
            <FiLogOut /> Log out
          </button>
        </div>

        <div className={styles.activityCards}>
          {TABS.map((tab) => (
            <div
              key={tab.id}
              className={`${styles.activityCard} ${activeTab === tab.id ? styles.activeCard : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <div className={styles.cardIcon}>
                <tab.icon />
              </div>
              <span>{tab.label}</span>
            </div>
          ))}
        </div>

        <section className={styles.contentPanel}>
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
                  </article>
                ))
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  )
}
