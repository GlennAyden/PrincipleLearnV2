// principle-learn/src/app/api/admin/register/route.ts

import { NextResponse } from 'next/server'
import { DatabaseService, DatabaseError } from '@/lib/database'
import { verifyToken } from '@/lib/jwt'
import { AdminRegisterSchema, parseBody } from '@/lib/schemas'
import { findUserByEmail, hashPassword } from '@/services/auth.service'

export async function POST(request: Request) {
  try {
    // Require existing admin authentication to create new admin accounts
    const cookieHeader = request.headers.get('cookie') || '';
    const accessTokenMatch = cookieHeader.match(/(?:^|;\s*)access_token=([^;]*)/);
    const activeToken = accessTokenMatch?.[1];

    if (!activeToken) {
      return NextResponse.json(
        { error: 'Autentikasi diperlukan. Hanya admin yang dapat mendaftarkan admin baru.' },
        { status: 401 }
      )
    }

    const payload = verifyToken(activeToken);
    if (!payload || payload.role?.toLowerCase() !== 'admin') {
      return NextResponse.json(
        { error: 'Akses ditolak. Hanya admin yang dapat mendaftarkan akun admin baru.' },
        { status: 403 }
      )
    }

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

    // Create admin in database
    const adminData = {
      email: normalizedEmail,
      password_hash: passwordHash,
      name: 'Admin User',
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