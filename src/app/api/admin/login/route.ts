// src/app/api/admin/login/route.ts
import { NextResponse } from 'next/server'
// import prisma from '@/lib/prisma' // Removed for mock implementation
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'

const JWT_SECRET = process.env.JWT_SECRET!
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET belum di‐set di env')
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { message: 'Email dan password wajib diisi' },
        { status: 400 }
      )
    }

    // Allow simple username or email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email) && email !== 'admin') {
      return NextResponse.json(
        { message: 'Format email tidak valid atau gunakan username "admin"' },
        { status: 400 }
      )
    }

    // Simple admin credentials for easy access
    const adminUsers = {
      'admin@admin.com': {
        id: 'admin-456',
        email: 'admin@admin.com',
        passwordHash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
        role: 'ADMIN'
      },
      'admin': {
        id: 'admin-123',
        email: 'admin',
        passwordHash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
        role: 'ADMIN'
      }
    };

    const user = adminUsers[email as keyof typeof adminUsers];

    if (!user) {
      return NextResponse.json(
        { message: 'Email atau password salah' },
        { status: 401 }
      )
    }

    // Mock password validation (accept "password" or check hash)
    const isValid = password === 'password' || await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      return NextResponse.json(
        { message: 'Email atau password salah' },
        { status: 401 }
      )
    }

    // generate JWT
    const token = jwt.sign(
      { userId: user.id, role: user.role },
      JWT_SECRET,
      { expiresIn: '2h' }
    )

    // kirim cookie + data user
    const response = NextResponse.json(
      { user: { id: user.id, email: user.email, role: user.role } },
      { status: 200 }
    )
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 2 * 60 * 60, // 2 jam
    })
    return response

  } catch (err: any) {
    console.error('Error di /api/admin/login:', err)
    return NextResponse.json(
      { message: err.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}
