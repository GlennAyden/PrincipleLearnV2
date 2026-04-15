// principle-learn/src/app/api/admin/register/route.ts

import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { DatabaseService, DatabaseError } from '@/lib/database'
import { verifyToken } from '@/lib/jwt'
import { AdminRegisterSchema, parseBody } from '@/lib/schemas'
import { findUserByEmail, hashPassword } from '@/services/auth.service'

export async function POST(request: Request) {
  try {
    // Require existing admin authentication to create new admin accounts.
    //
    // Preferred path: middleware.ts injects x-user-role / x-user-id after
    // verifying the access_token cookie, so we can trust those headers and
    // avoid re-parsing cookies by hand. Fall back to cookies() from
    // next/headers only if the headers aren't present (e.g. route hit
    // without going through middleware during local dev).
    let adminRole = request.headers.get('x-user-role') || null
    let adminId = request.headers.get('x-user-id') || null

    if (!adminRole || !adminId) {
      const cookieStore = await cookies()
      const activeToken = cookieStore.get('access_token')?.value
      if (!activeToken) {
        return NextResponse.json(
          { error: 'Autentikasi diperlukan. Hanya admin yang dapat mendaftarkan admin baru.' },
          { status: 401 }
        )
      }
      const payload = verifyToken(activeToken)
      if (!payload) {
        return NextResponse.json(
          { error: 'Autentikasi diperlukan. Hanya admin yang dapat mendaftarkan admin baru.' },
          { status: 401 }
        )
      }
      adminRole = payload.role
      adminId = payload.userId
    }

    if (adminRole?.toLowerCase() !== 'admin') {
      return NextResponse.json(
        { error: 'Akses ditolak. Hanya admin yang dapat mendaftarkan akun admin baru.' },
        { status: 403 }
      )
    }
    // adminId is available here if we ever need to attribute the creation.
    void adminId

    // Validate request body — same password strength as user registration (fixes 6.1.2)
    const parsed = parseBody(AdminRegisterSchema, await request.json())
    if (!parsed.success) return parsed.response
    const { email, password } = parsed.data

    console.log(`[Admin Register] Attempting to register admin: ${email}`);

    // Normalize email
    const normalizedEmail = email.toLowerCase().trim();

    // Check if admin already exists
    const existingUser = await findUserByEmail(normalizedEmail)
    if (existingUser) {
      console.log(`[Admin Register] Admin already exists: ${normalizedEmail}`);
      return NextResponse.json(
        { error: 'Admin sudah terdaftar dengan email ini' },
        { status: 409 }
      )
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create admin in database. We seed name from the local part of the
    // email so later UIs show something meaningful and the admin record is
    // consistent with the login route's fallback (user.name || user.email).
    const adminData = {
      email: normalizedEmail,
      password_hash: passwordHash,
      name: normalizedEmail.split('@')[0] || normalizedEmail,
      role: 'admin',
    };

    const createdAdmin = await DatabaseService.insertRecord<{ id: string; email: string; role: string; created_at: string }>('users', adminData);

    console.log(`[Admin Register] Admin created successfully: ${createdAdmin.email}`);

    return NextResponse.json(
      {
        message: 'Admin berhasil didaftarkan',
        data: {
          id: createdAdmin.id,
          email: createdAdmin.email,
          role: createdAdmin.role,
          created_at: createdAdmin.created_at
        }
      },
      { status: 201 }
    );

  } catch (err: unknown) {
    if (err instanceof DatabaseError && err.isUniqueViolation) {
      return NextResponse.json(
        { error: 'Admin sudah terdaftar dengan email ini' },
        { status: 409 }
      )
    }
    console.error('Error di /api/admin/register:', err)
    return NextResponse.json(
      { error: 'Kesalahan server internal' },
      { status: 500 }
    )
  }
}