'use client'

import React from 'react'
import styles from './CourseParameterModal.module.scss'
import { FiX, FiFileText, FiCalendar, FiUser } from 'react-icons/fi'

export interface CourseParameterModalProps {
  isOpen: boolean
  parameterData: string
  courseName: string
  timestamp: string
  onClose: () => void
}

export default function CourseParameterModal({
  isOpen,
  parameterData,
  courseName,
  timestamp,
  onClose,
}: CourseParameterModalProps) {
  if (!isOpen) return null

  // Parse JSON parameter
  let parsedParams = {}
  try {
    parsedParams = JSON.parse(parameterData)
  } catch (error) {
    console.error('Failed to parse parameter data:', error)
    parsedParams = { error: 'Invalid parameter format' }
  }

  const parameterItems = Object.entries(parsedParams).map(([key, value]) => ({
    label: key.charAt(0).toUpperCase() + key.slice(1).replace(/([A-Z])/g, ' $1'),
    value: value
  }))

  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <header className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Detail Parameter Course</h3>
          <button className={styles.closeBtn} onClick={onClose}>
            <FiX /> Tutup
          </button>
        </header>

        <div className={styles.content}>
          <div className={styles.courseInfo}>
            <div className={styles.courseInfoItem}>
              <FiFileText className={styles.infoIcon} />
              <h4 className={styles.courseName}>{courseName}</h4>
            </div>
            <div className={styles.courseInfoItem}>
              <FiCalendar className={styles.infoIcon} />
              <div className={styles.timestamp}>Dibuat pada: {timestamp}</div>
            </div>
          </div>

          <div className={styles.parameterList}>
            {parameterItems.map((item, index) => (
              <div key={index} className={styles.parameterItem}>
                <div className={styles.parameterLabel}>{item.label}:</div>
                <div className={styles.parameterValue}>
                  {typeof item.value === 'string' ? (
                    item.value
                  ) : (
                    <pre className={styles.jsonValue}>
                      {JSON.stringify(item.value, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
} 