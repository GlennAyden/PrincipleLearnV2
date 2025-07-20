// principle-learn/src/app/api/admin/logout/route.ts

import { NextResponse } from 'next/server'

export async function POST() {
  // Buat response JSON
  const response = NextResponse.json({ ok: true }, { status: 200 })

  // Hapus cookie 'token' dengan path '/'
  response.cookies.delete({ name: 'token', path: '/' })

  return response
}
