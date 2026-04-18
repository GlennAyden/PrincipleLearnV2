// principle-learn/src/app/admin/register/page.tsx
'use client'

import React, { useState } from 'react'
import Link from 'next/link'
import { apiFetch } from '@/lib/api-client'
import styles from './page.module.scss'

export default function AdminRegisterPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setLoading(true)
    try {
      const res = await apiFetch('/api/admin/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      if (res.ok) {
        setSuccess('Admin berhasil didaftarkan.')
        setEmail('')
        setPassword('')
      } else {
        const data = await res.json()
        setError(data.error || 'Pendaftaran gagal')
      }
    } catch {
      setError('Terjadi kesalahan tidak terduga.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form className={styles.form} onSubmit={handleSubmit}>
      <h1 className={styles.title}>Daftar Admin</h1>

      {error && <div className={styles.error}>{error}</div>}
      {success && <div className={styles.success}>{success}</div>}

      <label className={styles.label}>
        Email
        <input
          type="email"
          className={styles.input}
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </label>

      <label className={styles.label}>
        Kata Sandi
        <input
          type="password"
          className={styles.input}
          placeholder="Kata Sandi"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
      </label>

      <button
        type="submit"
        className={styles.button}
        disabled={loading}
      >
        {loading ? 'Mendaftar...' : 'Daftar'}
      </button>

      <div className={styles.back}>
        <Link href="/admin/dashboard">Kembali ke Dashboard</Link>
      </div>
    </form>
  )
}
