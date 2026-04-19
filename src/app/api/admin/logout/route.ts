// principle-learn/src/app/api/admin/logout/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyRefreshToken, verifyToken } from '@/lib/jwt'
import { adminDb } from '@/lib/database'
import { verifyCsrfToken } from '@/lib/admin-auth'

export async function POST(req: NextRequest) {
  try {
    const csrfError = verifyCsrfToken(req)
    if (csrfError) return csrfError

    const token = req.cookies.get('access_token')?.value
    const refreshToken = req.cookies.get('refresh_token')?.value
    if (!token && !refreshToken) {
      return NextResponse.json({ error: 'Tidak terotorisasi' }, { status: 401 })
    }

    const payload = token ? verifyToken(token) : null
    const refreshPayload = payload?.userId ? null : refreshToken ? verifyRefreshToken(refreshToken) : null
    const authPayload = payload ?? refreshPayload

    if (!authPayload) {
      return NextResponse.json({ error: 'Token admin tidak valid atau kedaluwarsa' }, { status: 401 })
    }

    if ((authPayload.role ?? '').toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    // Invalidate refresh token hash in DB so rotation is impossible after logout
    try {
      await adminDb
        .from('users')
        .eq('id', authPayload.userId)
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
