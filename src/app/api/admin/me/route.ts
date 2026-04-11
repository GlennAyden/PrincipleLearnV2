// principle-learn/src/app/api/admin/me/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/jwt'

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('access_token')?.value
    if (!token) {
      return NextResponse.json({ error: 'Tidak terotorisasi' }, { status: 401 })
    }

    const payload = verifyToken(token)
    if (!payload) {
      return NextResponse.json({ error: 'Token tidak valid' }, { status: 401 })
    }

    // Check if user has admin role (from token payload — avoids unnecessary DB round-trip)
    const role: string = (payload.role as string) || ''
    if (role.toLowerCase() !== 'admin') {
      console.log('[Admin Me] Access denied - user role:', role)
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    // Return user data directly from token payload (no DB query needed)
    const userData = {
      id: payload.userId,
      email: payload.email,
      name: 'Admin User',
      role: role,
    }

    console.log('[Admin Me] Returning user data:', userData)
    return NextResponse.json({ user: userData }, { status: 200 })
    
  } catch (err: unknown) {
    console.error('Error di /api/admin/me:', err)
    return NextResponse.json({ error: 'Kesalahan Server Internal' }, { status: 500 })
  }
}