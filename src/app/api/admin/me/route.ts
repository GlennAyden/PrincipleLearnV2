// principle-learn/src/app/api/admin/me/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { verifyToken } from '@/lib/jwt'
import { adminDb } from '@/lib/database'

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

    const role: string = (payload.role as string) || ''
    if (role.toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Akses ditolak' }, { status: 403 })
    }

    const { data: rows } = await adminDb
      .from('users')
      .select('id, email, name, role, deleted_at')
      .eq('id', payload.userId)
      .limit(1)

    interface AdminRow { id: string; email: string; name: string | null; role: string; deleted_at: string | null }
    const list = (rows ?? []) as unknown as AdminRow[]
    const row = list[0]

    if (!row || row.deleted_at) {
      return NextResponse.json({ error: 'Akun admin tidak ditemukan' }, { status: 404 })
    }

    return NextResponse.json(
      {
        user: {
          id: row.id,
          email: row.email,
          name: row.name || row.email,
          role: row.role,
        },
      },
      { status: 200 }
    )
  } catch (err: unknown) {
    console.error('Error di /api/admin/me:', err)
    return NextResponse.json({ error: 'Kesalahan Server Internal' }, { status: 500 })
  }
}