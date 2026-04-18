// src/app/api/admin/users/[id]/route.ts
// Admin Soft-Delete User — sets deleted_at instead of cascading hard delete.
// History is preserved for audit/research purposes.

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { verifyToken } from '@/lib/jwt'
import { verifyCsrfToken } from '@/lib/admin-auth'

function unauthorized(message = 'Unauthorized') {
  return NextResponse.json({ error: message }, { status: 401 })
}

function requireAdmin(request: NextRequest) {
  const token = request.cookies.get('access_token')?.value
  if (!token) return null
  const payload = verifyToken(token)
  if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') return null
  return payload
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const csrfError = verifyCsrfToken(request)
  if (csrfError) return csrfError

  const admin = requireAdmin(request)
  if (!admin) return unauthorized()

  try {
    const { id: userId } = await context.params
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    if (userId === admin.userId) {
      return NextResponse.json(
        { error: 'Cannot delete your own account' },
        { status: 403 }
      )
    }

    const { data: rows, error: getUserError } = await adminDb
      .from('users')
      .select('id, email, role, deleted_at')
      .eq('id', userId)
      .limit(1)

    if (getUserError) {
      console.error('[Admin Delete User] Database error getting user:', getUserError)
      return NextResponse.json({ error: 'Database connection error' }, { status: 500 })
    }

    interface UserRow { id: string; email: string; role: string; deleted_at: string | null }
    const list = (rows ?? []) as unknown as UserRow[]
    if (list.length === 0) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const user = list[0]

    if (user.deleted_at) {
      return NextResponse.json(
        { error: 'User is already deleted', deletedAt: user.deleted_at },
        { status: 410 }
      )
    }

    if ((user.role ?? '').toLowerCase() === 'admin') {
      return NextResponse.json({ error: 'Cannot delete admin users' }, { status: 403 })
    }

    const { error: updateError } = await adminDb
      .from('users')
      .eq('id', userId)
      .update({
        deleted_at: new Date().toISOString(),
        refresh_token_hash: null,
      })

    if (updateError) {
      console.error('[Admin Delete User] Failed to soft-delete user:', updateError)
      return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
    }

    console.log(`[Admin Delete User] Admin ${admin.email} soft-deleted user ${user.email}`)

    return NextResponse.json({
      success: true,
      message: `User ${user.email} telah ditandai sebagai dihapus`,
    })
  } catch (error: unknown) {
    console.error('[Admin Delete User] Unexpected error:', error)
    return NextResponse.json({ error: 'Failed to delete user' }, { status: 500 })
  }
}
