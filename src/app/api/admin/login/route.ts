// src/app/api/admin/login/route.ts
import { NextResponse } from 'next/server'
import { AdminLoginSchema, parseBody } from '@/lib/schemas'
import {
  findUserByEmail,
  verifyPassword,
  generateAuthTokens,
} from '@/services/auth.service'

export async function POST(request: Request) {
  try {
    // Validate request body
    const parsed = parseBody(AdminLoginSchema, await request.json())
    if (!parsed.success) return parsed.response
    const { email, password } = parsed.data

    console.log(`[Admin Login] Attempting login for: ${email}`)

    // Find user (normalize email)
    const user = await findUserByEmail(email.toLowerCase().trim())

    if (!user || !user.password_hash) {
      console.log(`[Admin Login] User not found: ${email}`)
      return NextResponse.json(
        { error: 'Email atau password salah' },
        { status: 401 }
      )
    }

    console.log(`[Admin Login] User found: ${user.email}, Role: ${user.role}`)

    // Check if user has admin role
    if (user.role?.toLowerCase() !== 'admin') {
      console.log(`[Admin Login] Access denied - user role: ${user.role}`)
      return NextResponse.json(
        { error: 'Akses ditolak. Hanya admin yang dapat login.' },
        { status: 403 }
      )
    }

    // Validate password
    const isValid = await verifyPassword(password, user.password_hash)

    if (!isValid) {
      console.log(`[Admin Login] Invalid password for: ${email}`)
      return NextResponse.json(
        { error: 'Email atau password salah' },
        { status: 401 }
      )
    }

    console.log(`[Admin Login] Login successful for: ${email}`)

    // Generate tokens via service
    const { accessToken: token } = generateAuthTokens(user)

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
    
    // Unified access_token cookie for both admin and user auth
    response.cookies.set('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 2 * 60 * 60, // 2 hours
    })
    
    return response


  } catch (err: any) {
    console.error('Error di /api/admin/login:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
