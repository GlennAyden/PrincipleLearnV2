// src/components/admin/QuizResultModal.tsx

'use client'

import React, { useState, useEffect } from 'react'
import styles from './QuizResultModal.module.scss'

interface QuizAnswer {
  no: number
  question: string
  options: string[]
  userAnswer: string
  status: string
}

interface QuizResultResponse {
  id: string
  result: QuizAnswer[]
}

export interface QuizLogItem {
  id: string
  timestamp: string
  topic: string
  score: number
}

interface QuizResultModalProps {
  isOpen: boolean
  quizLog: QuizLogItem
  onClose: () => void
}

export default function QuizResultModal({ isOpen, quizLog, onClose }: QuizResultModalProps) {
  const [answers, setAnswers] = useState<QuizAnswer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen || !quizLog) return
    
    setLoading(true)
    fetch(`/api/admin/activity/quiz/${quizLog.id}`, { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Gagal memuat hasil quiz')
        return res.json() as Promise<QuizResultResponse>
      })
      .then((data) => setAnswers(data.result))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }, [isOpen, quizLog])

  if (!isOpen || !quizLog) return null

  const { id: quizId } = quizLog

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Quiz Result</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            Close
          </button>
        </header>

        {loading && <div className={styles.loading}>Loading...</div>}
        {error && <div className={styles.error}>{error}</div>}

        {!loading && !error && (
          <div className={styles.tableWrapper}>
            <table className={styles.modalTable}>
              <thead>
                <tr>
                  <th>No</th>
                  <th>Pertanyaan</th>
                  <th>Option</th>
                  <th>Jawaban user</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {answers.map((ans) => (
                  <tr key={ans.no}>
                    <td>{ans.no}</td>
                    <td>{ans.question}</td>
                    <td>
                      <ul className={styles.optionsList}>
                        {ans.options.map((opt, i) => (
                          <li key={i}>
                            {String.fromCharCode(97 + i)}) {opt}
                          </li>
                        ))}
                      </ul>
                    </td>
                    <td>{ans.userAnswer}</td>
                    <td>{ans.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}