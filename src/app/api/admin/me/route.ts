// principle-learn/src/app/api/admin/me/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET!
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET belum di-set di env')
}

export async function GET(req: NextRequest) {
  try {
    console.log('[Admin Me] Checking authentication...')
    
    const token = req.cookies.get('token')?.value
    if (!token) {
      console.log('[Admin Me] No token found')
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    console.log('[Admin Me] Token found, verifying...')

    // Verifikasi token
    let payload: any
    try {
      payload = jwt.verify(token, JWT_SECRET)
      console.log('[Admin Me] Token verified:', { userId: payload.userId, role: payload.role })
    } catch (tokenError) {
      console.log('[Admin Me] Invalid token:', tokenError)
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 })
    }

    // Check if user has admin role (from token payload — avoids unnecessary DB round-trip)
    const role: string = (payload.role as string) || ''
    if (role.toLowerCase() !== 'admin') {
      console.log('[Admin Me] Access denied - user role:', role)
      return NextResponse.json({ message: 'Access denied' }, { status: 403 })
    }

    // Return user data directly from token payload (no DB query needed)
    const userData = {
      id: payload.userId,
      email: payload.email,
      name: payload.name || 'Admin User',
      role: role,
    }

    console.log('[Admin Me] Returning user data:', userData)
    return NextResponse.json({ user: userData }, { status: 200 })
    
  } catch (err: any) {
    console.error('Error di /api/admin/me:', err)
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 })
  }
}