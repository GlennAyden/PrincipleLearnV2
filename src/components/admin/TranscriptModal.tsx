// src/components/admin/TranscriptModal.tsx

'use client'

import React from 'react'
import styles from './TranscriptModal.module.scss'

export interface TranscriptLogItem {
  id: string
  timestamp: string
  courseName?: string
  topic?: string
  content: string
}

export interface TranscriptModalProps {
  isOpen: boolean
  transcript: TranscriptLogItem
  onClose: () => void
}

export default function TranscriptModal({
  isOpen,
  transcript,
  onClose,
}: TranscriptModalProps) {
  if (!isOpen || !transcript) return null

  // Parse question & answer from content
  const contentParts = transcript.content.split('\nA: ');
  const question = contentParts[0].replace('Q: ', '');
  const answer = contentParts[1] || '';

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Qna Transkrip</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            Close
          </button>
        </header>

        <div className={styles.tableWrapper}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Timestamp</th>
                <th>Pertanyaan</th>
                <th>Jawaban</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{transcript.timestamp}</td>
                <td>
                  <div className={styles.questionText}>{question}</div>
                </td>
                <td>
                  <div className={styles.answerText}>{answer}</div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
