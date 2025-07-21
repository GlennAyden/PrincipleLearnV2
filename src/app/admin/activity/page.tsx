// src/app/admin/activity/page.tsx

'use client'

import React, { useEffect, useState } from 'react'
import styles from './page.module.scss'
import { 
  FiLogOut, FiHome, FiUsers, FiActivity, 
  FiFileText, FiMessageCircle, FiCheckSquare, FiBook,
  FiEye, FiInfo 
} from 'react-icons/fi'
import { useRouter, usePathname } from 'next/navigation'
import { useAdmin } from '@/hooks/useAdmin'
import TranscriptModal from '@/components/admin/TranscriptModal'
import QuizResultModal from '@/components/admin/QuizResultModal'
import JournalModal from '@/components/admin/JournalModal'
import CourseParameterModal from '@/components/admin/CourseParameterModal'
import { getUserSpecificKey } from '@/hooks/useLocalStorage'

interface GenerateLogItem {
  id: string
  timestamp: string
  courseName: string
  parameter: string
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

interface QuizLogItem {
  id: string
  timestamp: string
  topic: string
  score: number
  userEmail: string
  userId: string
}

interface JournalLogItem {
  id: string
  timestamp: string
  topic: string
  content: string
  userEmail: string
  userId: string
}

const TABS = [
  { id: 'generate',  label: 'Log Generate Course', icon: FiFileText },
  { id: 'transcript', label: 'Log Transkrip Q&A', icon: FiMessageCircle },
  { id: 'quiz',      label: 'Log Pengerjaan Quiz', icon: FiCheckSquare },
  { id: 'jurnal',    label: 'Jurnal Refleksi', icon: FiBook },
]

export default function AdminActivityPage() {
  const router     = useRouter()
  const pathname   = usePathname()
  const { admin, loading: authLoading } = useAdmin()

  // filter state
  const [users, setUsers] = useState<{ id: string; email: string }[]>([])
  const [selectedUser,   setSelectedUser]   = useState('')
  const [selectedDate,   setSelectedDate]   = useState('')
  const [selectedCourse, setSelectedCourse] = useState('')
  const [selectedTopic,  setSelectedTopic]  = useState('')
  
  // course and topic/subtopic options for filtering
  const [courses, setCourses] = useState<{ id: string; title: string }[]>([])
  const [topics, setTopics] = useState<{ id: string; title: string }[]>([])

  // tab state
  const [activeTab, setActiveTab] = useState('generate')

  // logs state
  const [generateLogs,   setGenerateLogs]   = useState<GenerateLogItem[]>([])
  const [transcriptLogs, setTranscriptLogs] = useState<TranscriptLogItem[]>([])
  const [quizLogs,       setQuizLogs]       = useState<QuizLogItem[]>([])
  const [journalLogs,    setJournalLogs]    = useState<JournalLogItem[]>([])

  // modal state
  const [transcriptModalOpen, setTranscriptModalOpen] = useState(false)
  const [selectedTranscript,  setSelectedTranscript]  = useState<TranscriptLogItem | null>(null)
  const [quizModalOpen,       setQuizModalOpen]       = useState(false)
  const [selectedQuizLog,     setSelectedQuizLog]     = useState<QuizLogItem | null>(null)
  const [journalModalOpen,    setJournalModalOpen]    = useState(false)
  const [selectedJournal,     setSelectedJournal]     = useState<JournalLogItem | null>(null)
  const [parameterModalOpen,  setParameterModalOpen]  = useState(false)
  const [selectedParameter,   setSelectedParameter]   = useState<GenerateLogItem | null>(null)

  // redirect if not admin
  useEffect(() => {
    if (!authLoading && !admin) router.push('/admin/login')
  }, [authLoading, admin, router])

  // load users
  useEffect(() => {
    if (authLoading || !admin) return
    fetch('/api/admin/users', { credentials: 'include' })
      .then((res) => res.json())
      .then(setUsers)
  }, [authLoading, admin])
  
  // Load available courses for dropdown from database
  useEffect(() => {
    if (authLoading || !admin) return
    
    async function loadAllCourses() {
      try {
        // Fetch all users first to get their course data
        const usersResponse = await fetch('/api/admin/users');
        const usersResult = await usersResponse.json();
        
        if (usersResult.success && usersResult.users) {
          const allCourses: any[] = [];
          
          // For each user, fetch their courses
          for (const user of usersResult.users) {
            try {
              const coursesResponse = await fetch(`/api/courses?userId=${encodeURIComponent(user.email)}`);
              const coursesResult = await coursesResponse.json();
              
              if (coursesResult.success && coursesResult.courses) {
                allCourses.push(...coursesResult.courses);
              }
            } catch (error) {
              console.error(`Error fetching courses for user ${user.email}:`, error);
            }
          }
          
          // Create a map to deduplicate courses by ID
          const courseMap = new Map();
          allCourses.forEach((course) => {
            if (course && course.id) {
              courseMap.set(course.id, course);
            }
          });
          
          // Map to format needed for dropdown
          const courseOptions = Array.from(courseMap.values()).map((course: any) => ({
            id: course.id,
            title: course.title
          }));
          
          setCourses(courseOptions);
        }
      } catch (error) {
        console.error('Error loading courses:', error);
      }
    }
    
    loadAllCourses();
  }, [authLoading, admin])
  
  // Load topics based on selected course from database
  useEffect(() => {
    if (!selectedCourse) {
      setTopics([])
      return
    }
    
    async function loadCourseTopics() {
      try {
        // Fetch course details from database
        const response = await fetch(`/api/courses/${selectedCourse}`);
        const result = await response.json();
        
        if (result.success && result.course) {
          const selectedCourseData = result.course;
          
          // Transform subtopics to outline format
          const outline = selectedCourseData.subtopics?.map((subtopic: any) => {
            let content;
            try {
              content = JSON.parse(subtopic.content);
            } catch (parseError) {
              content = { module: subtopic.title, subtopics: [] };
            }
            
            return {
              module: content.module || subtopic.title || 'Module',
              subtopics: content.subtopics || []
            };
          }) || [];
          
          if (outline.length > 0) {
            // Flatten all modules and subtopics into a single array of topics
            const allTopics: { id: string; title: string }[] = []
            
            outline.forEach((module: any, moduleIndex: number) => {
              // Add the module as a topic option
              allTopics.push({
                id: `Module ${moduleIndex + 1}`,
                title: `Module ${moduleIndex + 1}: ${module.module}`
              })
              
              // Add each subtopic
              if (module.subtopics && module.subtopics.length > 0) {
                module.subtopics.forEach((subtopic: any, subtopicIndex: number) => {
                  const subtopicTitle = typeof subtopic === 'string' 
                    ? subtopic 
                    : subtopic.title
                    
                  // Clean up the title by removing redundant numbering
                  const cleanTitle = subtopicTitle
                    .replace(/^\d+\.\s*\d+\.?\s*/g, '')
                    .replace(/^\d+\.\s*/g, '')
                  
                  allTopics.push({
                    id: `Module ${moduleIndex + 1}, Subtopic ${subtopicIndex + 1}`,
                    title: `${moduleIndex + 1}.${subtopicIndex + 1} ${cleanTitle}`
                  })
                })
              }
            })
            
            setTopics(allTopics)
          } else {
            setTopics([])
          }
        }
      } catch (error) {
        console.error('Error loading course topics:', error)
        setTopics([])
      }
    }
    
    loadCourseTopics();
  }, [selectedCourse])

  // common helper to build query params
  const buildParams = () => {
    const p = new URLSearchParams()
    if (selectedUser)   p.set('userId', selectedUser)
    if (selectedDate)   p.set('date', selectedDate)
    if (activeTab !== 'generate') {
      if (selectedCourse) p.set('course', selectedCourse)
      if (selectedTopic)  p.set('topic', selectedTopic)
    }
    return p.toString()
  }

  // fetch logs on tab change or filters
  useEffect(() => {
    if (authLoading || !admin) return

    // Fetch appropriate data based on the active tab
    const params = buildParams()
    const fetchUrl = `/api/admin/activity/${activeTab === 'generate' ? 'generate-course' : 
                                           activeTab === 'transcript' ? 'transcript' : 
                                           activeTab === 'quiz' ? 'quiz' : 'jurnal'}?${params}`
    
    // Debug: log the API URLs being called
    console.log(`Fetching activity data from: ${fetchUrl}`)
    
    fetch(fetchUrl, { credentials: 'include' })
      .then(response => {
        if (!response.ok) {
          throw new Error(`API request failed with status ${response.status}`)
        }
        return response.json()
      })
      .then(data => {
        // Debug: log the data received
        console.log(`Received ${data.length} records for ${activeTab}`)
        
        // Update the appropriate state based on active tab
        switch (activeTab) {
          case 'generate':
            setGenerateLogs(data)
            break
          case 'transcript':
            setTranscriptLogs(data)
            break
          case 'quiz':
            setQuizLogs(data)
            break
          case 'jurnal':
            setJournalLogs(data)
            break
        }
      })
      .catch(error => {
        console.error(`Error fetching ${activeTab} logs:`, error)
        // Reset the state to empty array on error
    switch (activeTab) {
      case 'generate':
            setGenerateLogs([])
        break
      case 'transcript':
            setTranscriptLogs([])
        break
      case 'quiz':
            setQuizLogs([])
        break
      case 'jurnal':
            setJournalLogs([])
        break
    }
      })
  }, [
    activeTab,
    selectedUser,
    selectedDate,
    selectedCourse,
    selectedTopic,
    authLoading,
    admin,
  ])

  if (authLoading) return <div className={styles.loading}>Loading...</div>
  if (!admin) return null

  return (
    <div className={styles.page}>
      {/* Sidebar */}
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

      {/* Main */}
      <main className={styles.main}>
        {/* Filter bar */}
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

          <select
            className={styles.select}
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
          >
            <option value="">Tanggal</option>
            <option value="2025-04-25">25/04/2025</option>
            <option value="2025-05-12">12/05/2025</option>
          </select>

          {activeTab !== 'generate' && (
            <>
              <select
                className={styles.select}
                value={selectedCourse}
                onChange={(e) => {
                  setSelectedCourse(e.target.value)
                  // Reset topic when course changes
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

              <select
                className={styles.select}
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                disabled={!selectedCourse}
              >
                <option value="">Topic/Subtopic</option>
                {topics.map((topic) => (
                  <option key={topic.id} value={topic.id}>
                    {topic.title}
                  </option>
                ))}
              </select>
            </>
          )}

          <button className={styles.logout} onClick={() => router.push('/admin/login')}>
            <FiLogOut /> Log out
          </button>
        </div>

        {/* Activity Type Cards */}
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

        {/* Table card */}
        <section className={styles.tableWrapper}>
          {/* Generate */}
          {activeTab === 'generate' && (
            <>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Course Name</th>
                    <th>Parameter</th>
                  </tr>
                </thead>
                <tbody>
                  {generateLogs.length === 0 ? (
                    <tr>
                      <td colSpan={4} className={styles.noData}>No course generation logs found</td>
                    </tr>
                  ) : (
                    generateLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{log.timestamp}</td>
                        <td>{log.userEmail}</td>
                        <td>{log.courseName}</td>
                        <td>
                          <button
                            className={styles.detailButton}
                            onClick={() => {
                              setSelectedParameter(log)
                              setParameterModalOpen(true)
                            }}
                          >
                            <FiInfo className={styles.buttonIcon} /> Lihat Selengkapnya
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {selectedParameter && (
                <CourseParameterModal
                  isOpen={parameterModalOpen}
                  parameterData={selectedParameter.parameter}
                  courseName={selectedParameter.courseName}
                  timestamp={selectedParameter.timestamp}
                  onClose={() => setParameterModalOpen(false)}
                />
              )}
            </>
          )}

          {/* Transcript */}
          {activeTab === 'transcript' && (
            <>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Topic/Subtopic</th>
                    <th>Pertanyaan</th>
                    <th>Jawaban</th>
                  </tr>
                </thead>
                <tbody>
                  {transcriptLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.noData}>No transcript logs found</td>
                    </tr>
                  ) : (
                    transcriptLogs.map((log) => {
                      // Extract question and answer from content
                      const contentParts = log.content.split('\nA: ');
                      const question = contentParts[0].replace('Q: ', '');
                      const answer = contentParts[1] || '';
                      
                      // Create a summary of the answer (first 60 characters)
                      const answerSummary = answer.length > 60
                        ? `${answer.slice(0, 60)}...`
                        : answer;
                      
                      return (
                        <tr key={log.id}>
                          <td>{log.timestamp}</td>
                          <td>{log.userEmail}</td>
                          <td>{log.topic}</td>
                          <td>
                            <div className={styles.questionContent}>
                              <span className={styles.questionLabel}>Q:</span> {question}
                            </div>
                          </td>
                          <td>
                            <div className={styles.answerSummary}>
                              <span className={styles.answerLabel}>A:</span> {answerSummary}
                            </div>
                            <button
                              className={styles.detailButton}
                              onClick={() => {
                                setSelectedTranscript(log)
                                setTranscriptModalOpen(true)
                              }}
                            >
                              <FiEye className={styles.buttonIcon} /> Lihat Selengkapnya
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
              {selectedTranscript && (
                <TranscriptModal
                  isOpen={transcriptModalOpen}
                  transcript={selectedTranscript}
                  onClose={() => setTranscriptModalOpen(false)}
                />
              )}
            </>
          )}

          {/* Quiz */}
          {activeTab === 'quiz' && (
            <>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Topic/Subtopic</th>
                    <th>Skor</th>
                    <th>Quiz Result</th>
                  </tr>
                </thead>
                <tbody>
                  {quizLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.noData}>No quiz logs found</td>
                    </tr>
                  ) : (
                    quizLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{log.timestamp}</td>
                        <td>{log.userEmail}</td>
                        <td>{log.topic}</td>
                        <td>{log.score}</td>
                        <td>
                          <button
                            className={styles.detailButton}
                            onClick={() => {
                              setSelectedQuizLog(log)
                              setQuizModalOpen(true)
                            }}
                          >
                            <FiEye className={styles.buttonIcon} /> Lihat Selengkapnya
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {selectedQuizLog && (
                <QuizResultModal
                  isOpen={quizModalOpen}
                  quizLog={selectedQuizLog}
                  onClose={() => setQuizModalOpen(false)}
                />
              )}
            </>
          )}

          {/* Jurnal */}
          {activeTab === 'jurnal' && (
            <>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    <th>Topic/Subtopic</th>
                    <th>Ringkasan</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {journalLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className={styles.noData}>No journal logs found</td>
                    </tr>
                  ) : (
                    journalLogs.map((log) => (
                      <tr key={log.id}>
                        <td>{log.timestamp}</td>
                        <td>{log.userEmail}</td>
                        <td>{log.topic}</td>
                        <td>
                          {log.content.length > 60
                            ? `${log.content.slice(0, 60)}…`
                            : log.content}
                        </td>
                        <td>
                          <button
                            className={styles.detailButton}
                            onClick={() => {
                              setSelectedJournal(log)
                              setJournalModalOpen(true)
                            }}
                          >
                            <FiEye className={styles.buttonIcon} /> Lihat Selengkapnya
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              {selectedJournal && (
                <JournalModal
                  isOpen={journalModalOpen}
                  journal={selectedJournal}
                  onClose={() => setJournalModalOpen(false)}
                />
              )}
            </>
          )}
        </section>
      </main>
    </div>
  )
}
