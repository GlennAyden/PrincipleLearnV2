// src/app/admin/users/[id]/page.tsx
'use client'

import React, { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import styles from './page.module.scss'
import {
  FiArrowLeft,
  FiAlertCircle,
  FiBookOpen,
  FiCheckSquare,
  FiMessageCircle,
  FiFileText,
  FiHelpCircle,
  FiTarget,
  FiZap,
  FiStar,
  FiUser,
  FiActivity,
} from 'react-icons/fi'
import { useAdmin } from '@/hooks/useAdmin'
import type { StudentDetail } from '@/types/student'

const STAGE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  SCP: { label: 'Simple Clarification', color: '#b45309', bg: 'rgba(245,158,11,0.14)' },
  SRP: { label: 'Structured Reformulation', color: '#0369a1', bg: 'rgba(14,165,233,0.14)' },
  MQP: { label: 'Multi-Question', color: '#7c3aed', bg: 'rgba(124,58,237,0.14)' },
  REFLECTIVE: { label: 'Reflective', color: '#059669', bg: 'rgba(16,185,129,0.14)' },
  'N/A': { label: 'Not Available', color: '#64748b', bg: '#f1f5f9' },
}

const TYPE_ICONS: Record<string, string> = {
  course: '📚', quiz: '✅', journal: '📓', transcript: '📝',
  ask: '❓', challenge: '🧩', discussion: '💬', feedback: '⭐',
}

export default function StudentDetailPage() {
  const params = useParams()
  const router = useRouter()
  const { admin, loading: authLoading } = useAdmin()
  const [student, setStudent] = useState<StudentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<'activity' | 'courses' | 'profile'>('activity')

  const userId = params?.id as string

  useEffect(() => {
    if (authLoading) return
    if (!admin) { router.push('/admin/login'); return }
    if (!userId) return

    setIsLoading(true)
    setError(null)

    fetch(`/api/admin/users/${userId}/detail`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const d = await res.json().catch(() => ({}))
          throw new Error(d.message || 'Failed to load student data')
        }
        return res.json()
      })
      .then(setStudent)
      .catch((err) => { console.error(err); setError(err.message) })
      .finally(() => setIsLoading(false))
  }, [admin, authLoading, userId, router])

  const formatDate = (s: string) => {
    try { return new Date(s).toLocaleDateString('id-ID', { year: 'numeric', month: 'short', day: 'numeric' }) }
    catch { return s }
  }

  const formatDateTime = (s: string) => {
    try { return new Date(s).toLocaleString('id-ID', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) }
    catch { return s }
  }

  if (authLoading) return <div className={styles.loading}>Loading...</div>
  if (!admin) return null

  return (
    <div className={styles.page}>
      {/* Back button */}
      <button className={styles.backBtn} onClick={() => router.push('/admin/users')}>
        <FiArrowLeft /> Back to Students
      </button>

      {isLoading ? (
        <div className={styles.loading}>Loading student data...</div>
      ) : error ? (
        <div className={styles.error}><FiAlertCircle /> {error}</div>
      ) : !student ? (
        <div className={styles.error}><FiAlertCircle /> Student not found</div>
      ) : (
        <>
          {/* Header */}
          <header className={styles.header}>
            <div className={styles.headerInfo}>
              <div className={styles.avatar}><FiUser /></div>
              <div>
                <h1>{student.name !== 'Unknown' ? student.name : student.email}</h1>
                {student.name !== 'Unknown' && <p className={styles.emailText}>{student.email}</p>}
                <div className={styles.headerMeta}>
                  <span className={styles.roleBadge}>{student.role}</span>
                  <span
                    className={styles.stageBadge}
                    style={{
                      color: (STAGE_CONFIG[student.promptStage] ?? STAGE_CONFIG['N/A']).color,
                      background: (STAGE_CONFIG[student.promptStage] ?? STAGE_CONFIG['N/A']).bg,
                    }}
                  >
                    {(STAGE_CONFIG[student.promptStage] ?? STAGE_CONFIG['N/A']).label}
                  </span>
                  <span className={styles.joinDate}>Joined {formatDate(student.createdAt)}</span>
                </div>
              </div>
            </div>
          </header>

          {/* Stats Grid */}
          <section className={styles.statsGrid}>
            <div className={styles.statItem}><FiFileText className={styles.statIconPurple} /><div><span className={styles.statNum}>{student.totalCourses}</span><span className={styles.statLabel}>Courses</span></div></div>
            <div className={styles.statItem}><FiCheckSquare className={styles.statIconGreen} /><div><span className={styles.statNum}>{student.totalQuizzes}</span><span className={styles.statLabel}>Quizzes</span></div></div>
            <div className={styles.statItem}><FiBookOpen className={styles.statIconBlue} /><div><span className={styles.statNum}>{student.totalJournals}</span><span className={styles.statLabel}>Journals</span></div></div>
            <div className={styles.statItem}><FiMessageCircle className={styles.statIconTeal} /><div><span className={styles.statNum}>{student.totalTranscripts}</span><span className={styles.statLabel}>Transcripts</span></div></div>
            <div className={styles.statItem}><FiHelpCircle className={styles.statIconOrange} /><div><span className={styles.statNum}>{student.totalAskQuestions}</span><span className={styles.statLabel}>Questions</span></div></div>
            <div className={styles.statItem}><FiTarget className={styles.statIconRed} /><div><span className={styles.statNum}>{student.totalChallenges}</span><span className={styles.statLabel}>Challenges</span></div></div>
            <div className={styles.statItem}><FiZap className={styles.statIconYellow} /><div><span className={styles.statNum}>{student.totalDiscussions}</span><span className={styles.statLabel}>Discussions</span></div></div>
            <div className={styles.statItem}><FiStar className={styles.statIconPink} /><div><span className={styles.statNum}>{student.totalFeedbacks}</span><span className={styles.statLabel}>Feedbacks</span></div></div>
          </section>

          {/* Engagement & Completion */}
          <section className={styles.progressSection}>
            <div className={styles.progressCard}>
              <div className={styles.progressHeader}>
                <FiActivity />
                <span>Engagement Score</span>
              </div>
              <div className={styles.progressBarOuter}>
                <div className={styles.progressBarFill} style={{ width: `${student.engagementScore}%` }} />
              </div>
              <span className={styles.progressValue}>{student.engagementScore}%</span>
            </div>
            <div className={styles.progressCard}>
              <div className={styles.progressHeader}>
                <FiCheckSquare />
                <span>Course Completion</span>
              </div>
              <div className={styles.progressBarOuter}>
                <div className={styles.progressBarFillGreen} style={{ width: `${student.courseCompletionRate}%` }} />
              </div>
              <span className={styles.progressValue}>{student.courseCompletionRate}%</span>
            </div>
          </section>

          {/* Section Tabs */}
          <div className={styles.tabs}>
            <button className={activeSection === 'activity' ? styles.tabActive : ''} onClick={() => setActiveSection('activity')}>
              Recent Activity
            </button>
            <button className={activeSection === 'courses' ? styles.tabActive : ''} onClick={() => setActiveSection('courses')}>
              Courses ({student.courses.length})
            </button>
            <button className={activeSection === 'profile' ? styles.tabActive : ''} onClick={() => setActiveSection('profile')}>
              Learning Profile
            </button>
          </div>

          {/* Activity Section */}
          {activeSection === 'activity' && (
            <section className={styles.activitySection}>
              {student.recentActivity.length === 0 ? (
                <p className={styles.noData}>No activity recorded yet.</p>
              ) : (
                <div className={styles.activityList}>
                  {student.recentActivity.map((item, idx) => (
                    <article key={`${item.id}-${idx}`} className={styles.activityItem}>
                      <span className={styles.activityIcon}>{TYPE_ICONS[item.type] ?? '📌'}</span>
                      <div className={styles.activityContent}>
                        <div className={styles.activityTop}>
                          <span className={styles.activityType}>{item.type}</span>
                          <time>{formatDateTime(item.timestamp)}</time>
                        </div>
                        <p className={styles.activityTitle}>{item.title}</p>
                        {item.detail && <p className={styles.activityDetail}>{item.detail}</p>}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Courses Section */}
          {activeSection === 'courses' && (
            <section className={styles.coursesSection}>
              {student.courses.length === 0 ? (
                <p className={styles.noData}>No courses generated yet.</p>
              ) : (
                <div className={styles.courseGrid}>
                  {student.courses.map((course) => {
                    const completionPct = course.subtopicCount > 0
                      ? Math.round((course.completedSubtopics / course.subtopicCount) * 100)
                      : 0
                    const quizPct = course.quizCount > 0
                      ? Math.round((course.quizCorrect / course.quizCount) * 100)
                      : 0
                    return (
                      <article key={course.id} className={styles.courseCard}>
                        <h4>{course.title}</h4>
                        <p className={styles.courseDate}>Created {formatDate(course.createdAt)}</p>
                        <div className={styles.courseStats}>
                          <div>
                            <span className={styles.courseStatNum}>{course.completedSubtopics}/{course.subtopicCount}</span>
                            <span className={styles.courseStatLabel}>Subtopics</span>
                            <div className={styles.courseBar}>
                              <div className={styles.courseBarFill} style={{ width: `${completionPct}%` }} />
                            </div>
                          </div>
                          <div>
                            <span className={styles.courseStatNum}>{course.quizCorrect}/{course.quizCount}</span>
                            <span className={styles.courseStatLabel}>Quiz Accuracy</span>
                            <div className={styles.courseBar}>
                              <div className={styles.courseBarFillGreen} style={{ width: `${quizPct}%` }} />
                            </div>
                          </div>
                        </div>
                      </article>
                    )
                  })}
                </div>
              )}
            </section>
          )}

          {/* Learning Profile Section */}
          {activeSection === 'profile' && (
            <section className={styles.profileSection}>
              {!student.learningProfile ? (
                <p className={styles.noData}>Learning profile not available. Student has not completed onboarding.</p>
              ) : (
                <div className={styles.profileGrid}>
                  <div className={styles.profileField}>
                    <label>Display Name</label>
                    <p>{student.learningProfile.displayName || '-'}</p>
                  </div>
                  <div className={styles.profileField}>
                    <label>Programming Experience</label>
                    <p>{student.learningProfile.programmingExperience || '-'}</p>
                  </div>
                  <div className={styles.profileField}>
                    <label>Learning Style</label>
                    <p>{student.learningProfile.learningStyle || '-'}</p>
                  </div>
                  <div className={styles.profileField}>
                    <label>Learning Goals</label>
                    <p>{student.learningProfile.learningGoals || '-'}</p>
                  </div>
                  <div className={styles.profileField}>
                    <label>Challenges</label>
                    <p>{student.learningProfile.challenges || '-'}</p>
                  </div>
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  )
}
