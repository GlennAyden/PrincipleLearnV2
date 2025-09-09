// principle-learn/src/app/api/admin/me/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
import { DatabaseService } from '@/lib/database'

const JWT_SECRET = process.env.JWT_SECRET!
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET belum di-set di env')
}

interface User {
  id: string;
  email: string;
  password_hash: string;
  name?: string;
  role: string;
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

    // Get user from database
    let users: User[] = []
    try {
      users = await DatabaseService.getRecords<User>('users', {
        filter: { id: payload.userId },
        limit: 1
      })
    } catch (dbError) {
      console.error('[Admin Me] Database error:', dbError)
      return NextResponse.json({ message: 'Database connection error' }, { status: 500 })
    }

    if (users.length === 0) {
      console.log('[Admin Me] User not found in database:', payload.userId)
      return NextResponse.json({ message: 'User not found' }, { status: 404 })
    }

    const user = users[0]
    console.log('[Admin Me] User found:', { id: user.id, email: user.email, role: user.role })

    // Check if user has admin role
    if (user.role !== 'admin') {
      console.log('[Admin Me] Access denied - user role:', user.role)
      return NextResponse.json({ message: 'Access denied' }, { status: 403 })
    }

    // Return user data (without sensitive info)
    const userData = {
      id: user.id,
      email: user.email,
      name: user.name || 'Admin User',
      role: user.role
    }

    console.log('[Admin Me] Returning user data:', userData)
    return NextResponse.json({ user: userData }, { status: 200 })
    
  } catch (err: any) {
    console.error('Error di /api/admin/me:', err)
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 })
  }
}