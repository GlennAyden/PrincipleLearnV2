// principle-learn/src/app/api/admin/logout/route.ts

import { NextResponse } from 'next/server'

export async function POST() {
  try {
    const response = NextResponse.json({ ok: true }, { status: 200 })

    // Clear auth cookie
    response.cookies.delete({ name: 'access_token', path: '/' })

    return response
  } catch (error) {
    console.error('[Admin Logout] Error:', error)
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    )
  }
}
