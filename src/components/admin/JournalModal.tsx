// src/components/admin/JournalModal.tsx

'use client'

import React from 'react'
import styles from './JournalModal.module.scss'
import { FiX } from 'react-icons/fi'

export interface JournalLogItem {
  id: string
  timestamp: string
  topic: string
  content: string
}

interface JournalModalProps {
  isOpen: boolean
  journal: JournalLogItem
  onClose: () => void
}

export default function JournalModal({ isOpen, journal, onClose }: JournalModalProps) {
  if (!isOpen || !journal) return null

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Jurnal Refleksi</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <FiX size={20} />
          </button>
        </header>

        <div className={styles.content}>
          <p className={styles.meta}>
            {journal.timestamp} — {journal.topic}
          </p>
          <div className={styles.text}>{journal.content}</div>
        </div>
      </div>
    </div>
  )
}