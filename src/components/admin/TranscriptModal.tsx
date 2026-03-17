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
  transcript: TranscriptLogItem | null
  onClose: () => void
}

export default function TranscriptModal({
  isOpen,
  transcript,
  onClose,
}: TranscriptModalProps) {
  if (!isOpen || !transcript) return null

  // Parse question & answer from content (supports both "Q: ...\nA: ..." and "Q: ...\n\nA: ...")
  const qaMatch = transcript.content.match(/^Q:\s*([\s\S]*?)\n+\s*A:\s*([\s\S]*)$/);
  const question = qaMatch?.[1]?.trim() || transcript.content;
  const answer = qaMatch?.[2]?.trim() || '';

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
