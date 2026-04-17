// src/app/api/admin/login/route.ts
import { NextResponse } from 'next/server'
import { AdminLoginSchema, parseBody } from '@/lib/schemas'
import {
  ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from '@/lib/jwt'
import {
  findUserByEmail,
  verifyPassword,
  runDummyPasswordCompare,
  generateAdminAuthTokens,
  generateCsrfToken,
  hashRefreshToken,
  updateUserRefreshTokenHash,
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
      // Burn cycles so timing doesn't distinguish "no user" from "bad pw".
      await runDummyPasswordCompare()
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

    // Generate admin tokens (30m access + 3d refresh) via service
    const { accessToken: token, refreshToken } = generateAdminAuthTokens(user)

    // Persist the refresh token hash so the refresh endpoint can verify the
    // presented token on the next rotation.
    await updateUserRefreshTokenHash(user.id, hashRefreshToken(refreshToken))

    // Generate CSRF token — previously admin login skipped this, which
    // meant the CSRF middleware check effectively no-op'd on admin sessions
    // because the frontend never had a csrf_token cookie to read.
    const csrfToken = generateCsrfToken()

    // Send response with cookies and user data. Prefer user.name from DB,
    // fall back to email if name is null (no more hardcoded "Admin User").
    const response = NextResponse.json(
      {
        csrfToken,
        user: {
          id: user.id,
          email: user.email,
          name: user.name || user.email,
          role: user.role
        }
      },
      { status: 200 }
    )

    // Unified access_token cookie for both admin and user auth. Admin
    // sessions get the harmonized 30m lifetime (was 2h) — longer than
    // regular users but short enough to narrow the stolen-token window.
    response.cookies.set('access_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: ADMIN_ACCESS_TOKEN_MAX_AGE_SECONDS,
    })

    response.cookies.set('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
    })

    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: false, // Double-submit: frontend must read and echo it back
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
    })

    return response


  } catch (err: unknown) {
    console.error('Error di /api/admin/login:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
