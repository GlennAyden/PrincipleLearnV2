// principle-learn/src/app/api/admin/register/route.ts

import { NextResponse } from 'next/server'
import bcrypt from 'bcrypt'
import { DatabaseService } from '@/lib/database'

interface User {
  id: string;
  email: string;
  password_hash: string;
  name?: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    // Validasi: email & password wajib diisi
    if (!email || !password) {
      return NextResponse.json(
        { message: 'Email dan password wajib diisi' },
        { status: 400 }
      )
    }

    // Validasi format email
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      return NextResponse.json(
        { message: 'Format email tidak valid' },
        { status: 400 }
      )
    }

    // Validasi password minimal 6 karakter
    if (password.length < 6) {
      return NextResponse.json(
        { message: 'Password minimal 6 karakter' },
        { status: 400 }
      )
    }

    console.log(`[Admin Register] Attempting to register admin: ${email}`);

    // Check if admin already exists in database
    let existingUsers: User[] = []
    try {
      existingUsers = await DatabaseService.getRecords<User>('users', {
        filter: { email: email },
        limit: 1
      })
    } catch (dbError) {
      console.error('[Admin Register] Database error checking existing user:', dbError);
      return NextResponse.json(
        { message: 'Database connection error' },
        { status: 500 }
      )
    }

    if (existingUsers.length > 0) {
      console.log(`[Admin Register] Admin already exists: ${email}`);
      return NextResponse.json(
        { message: 'Admin sudah terdaftar dengan email ini' },
        { status: 409 }
      )
    }

    // Hash password
    console.log(`[Admin Register] Hashing password for: ${email}`);
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create admin in database
    console.log(`[Admin Register] Creating admin in database: ${email}`);
    try {
      const adminData = {
        email,
        password_hash: passwordHash,
        name: 'Admin User',
        role: 'admin',
      };

      const createdAdmin = await DatabaseService.insertRecord<User>('users', adminData);
      
      console.log(`[Admin Register] Admin created successfully:`, {
        id: createdAdmin.id,
        email: createdAdmin.email,
        role: createdAdmin.role
      });

      // Return success response (without sensitive data)
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

    } catch (insertError) {
      console.error('[Admin Register] Error creating admin:', insertError);
      return NextResponse.json(
        { message: 'Gagal membuat akun admin' },
        { status: 500 }
      )
    }

  } catch (err: any) {
    console.error('Error di /api/admin/register:', err)
    return NextResponse.json(
      { message: err.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}