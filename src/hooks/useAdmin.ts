// principle-learn/src/hooks/useAdmin.ts
import { useEffect, useState } from 'react'

export function useAdmin() {
  const [admin, setAdmin] = useState<{ email: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/me', { credentials: 'include' })
      .then(res => res.ok ? res.json() : Promise.reject())
      .then(data => setAdmin(data.user))
      .catch(() => setAdmin(null))
      .finally(() => setLoading(false))
  }, [])

  return { admin, loading }
}
