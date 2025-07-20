// src/app/admin/layout.tsx
import React from 'react'
import styles from './layout.module.scss'

interface AdminLayoutProps {
  children: React.ReactNode
}

export default function AdminLayout({ children }: AdminLayoutProps) {
  return (
    <div className={styles.container}>
      <div className={styles.card}>
        {children}
      </div>
    </div>
  )
}
