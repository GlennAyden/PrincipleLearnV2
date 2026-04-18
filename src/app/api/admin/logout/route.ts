// principle-learn/src/app/api/admin/logout/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { adminDb } from '@/lib/database'
import { verifyCsrfToken } from '@/lib/admin-auth'

export async function POST(req: NextRequest) {
  try {
    const token = req.cookies.get('access_token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Tidak terotorisasi' }, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const csrfError = verifyCsrfToken(req)
    if (csrfError) return csrfError

    // Invalidate refresh token hash in DB so rotation is impossible after logout
    try {
      await adminDb
        .from('users')
        .eq('id', payload.userId)
        .update({ refresh_token_hash: null })
    } catch (err) {
      console.warn('[Admin Logout] Could not clear refresh_token_hash:', err)
    }

    const response = NextResponse.json({ ok: true }, { status: 200 })
    response.cookies.delete({ name: 'access_token', path: '/' })
    response.cookies.delete({ name: 'refresh_token', path: '/' })
    response.cookies.delete({ name: 'csrf_token', path: '/' })
    return response
  } catch (error) {
    console.error('[Admin Logout] Error:', error)
    return NextResponse.json({ error: 'Gagal keluar' }, { status: 500 })
  }
}
