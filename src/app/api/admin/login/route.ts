// src/app/api/admin/login/route.ts
import { NextResponse } from 'next/server'
import bcrypt from 'bcrypt'
import jwt from 'jsonwebtoken'
import { DatabaseService } from '@/lib/database'

const JWT_SECRET = process.env.JWT_SECRET!
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET belum di‐set di env')
}

interface User {
  id: string;
  email: string;
  password_hash: string;
  name?: string;
  role: string;
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

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: 'Format email tidak valid' },
        { status: 400 }
      )
    }

    console.log(`[Admin Login] Attempting login for: ${email}`)

    // Get user from database
    let users: User[] = []
    try {
      users = await DatabaseService.getRecords<User>('users', {
        filter: { email: email },
        limit: 1
      })
    } catch (dbError) {
      console.error('[Admin Login] Database error:', dbError)
      return NextResponse.json(
        { message: 'Database connection error' },
        { status: 500 }
      )
    }

    if (users.length === 0) {
      console.log(`[Admin Login] User not found: ${email}`)
      return NextResponse.json(
        { message: 'Email atau password salah' },
        { status: 401 }
      )
    }

    const user = users[0]
    console.log(`[Admin Login] User found: ${user.email}, Role: ${user.role}`)

    // Check if user has admin role
    if (user.role !== 'admin') {
      console.log(`[Admin Login] Access denied - user role: ${user.role}`)
      return NextResponse.json(
        { message: 'Akses ditolak. Hanya admin yang dapat login.' },
        { status: 403 }
      )
    }

    // Validate password
    console.log(`[Admin Login] Comparing password for: ${email}`)
    console.log(`[Admin Login] Password length: ${password.length}`)
    console.log(`[Admin Login] Hash from DB: ${user.password_hash}`)
    
    let isValid = false
    try {
      isValid = await bcrypt.compare(password, user.password_hash)
      console.log(`[Admin Login] Password comparison result: ${isValid}`)
    } catch (bcryptError) {
      console.error('[Admin Login] Bcrypt error:', bcryptError)
      return NextResponse.json(
        { message: 'Password validation error' },
        { status: 500 }
      )
    }

    if (!isValid) {
      console.log(`[Admin Login] Invalid password for: ${email}`)
      console.log(`[Admin Login] Expected password: admin123`)
      return NextResponse.json(
        { message: 'Email atau password salah' },
        { status: 401 }
      )
    }

    console.log(`[Admin Login] Login successful for: ${email}`)

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user.id, 
        email: user.email,
        role: user.role 
      },
      JWT_SECRET,
      { expiresIn: '2h' }
    )

    // Send response with cookie and user data
    const response = NextResponse.json(
      { 
        user: { 
          id: user.id, 
          email: user.email, 
          name: user.name || 'Admin User',
          role: user.role 
        } 
      },
      { status: 200 }
    )
    
    response.cookies.set('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 2 * 60 * 60, // 2 hours
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