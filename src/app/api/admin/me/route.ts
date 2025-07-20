// principle-learn/src/app/api/admin/me/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import jwt from 'jsonwebtoken'
// import prisma from '@/lib/prisma' // Removed for mock implementation

const JWT_SECRET = process.env.JWT_SECRET!
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET belum di-set di env')
}

export async function GET(req: NextRequest) {
  try {
    const token = req.cookies.get('token')?.value
    if (!token) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    // Verifikasi token
    let payload: any
    try {
      payload = jwt.verify(token, JWT_SECRET)
    } catch {
      return NextResponse.json({ message: 'Invalid token' }, { status: 401 })
    }

    // Mock admin data lookup
    const mockAdmins = {
      'admin-456': { id: 'admin-456', email: 'admin@example.com', role: 'ADMIN' }
    };
    
    const user = mockAdmins[payload.userId as keyof typeof mockAdmins];
    if (!user) {
      return NextResponse.json({ message: 'User not found' }, { status: 404 })
    }

    return NextResponse.json({ user }, { status: 200 })
  } catch (err: any) {
    console.error('Error di /api/admin/me:', err)
    return NextResponse.json({ message: 'Internal Server Error' }, { status: 500 })
  }
}
