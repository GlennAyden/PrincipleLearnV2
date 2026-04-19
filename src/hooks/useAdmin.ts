// principle-learn/src/hooks/useAdmin.ts
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'

export function useAdmin() {
  const [admin, setAdmin] = useState<{ email: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiFetch('/api/admin/me', { cache: 'no-store' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setAdmin(data.user))
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false))
  }, [])

  return { admin, loading }
}
