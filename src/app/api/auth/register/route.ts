import { NextResponse } from 'next/server';
import { registerRateLimiter } from '@/lib/rate-limit';
import { RegisterSchema, parseBody } from '@/lib/schemas';
import { DatabaseService, DatabaseError } from '@/lib/database';
import { findUserByEmail, hashPassword } from '@/services/auth.service';

export async function POST(req: Request) {
  try {
    // Get client IP for rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    // Check rate limiting
    if (!(await registerRateLimiter.isAllowed(ip))) {
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan pendaftaran. Coba lagi nanti.' },
        { status: 429 }
      );
    }

    // Validate request body (email format + password strength enforced by schema)
    const parsed = parseBody(RegisterSchema, await req.json());
    if (!parsed.success) return parsed.response;
    const { email, password, name } = parsed.data;

    // Normalize email to prevent case-sensitivity duplicates
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists. We deliberately return a generic message
    // here (and in the unique-violation catch below) — no DB details leak to
    // callers, and the status/wording are identical regardless of which path
    // caught the duplicate first.
    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      return NextResponse.json(
        { error: 'Email sudah terdaftar' },
        { status: 409 }
      );
    }

    // Hash password and create user
    const passwordHash = await hashPassword(password);

    const userData: Record<string, string> = {
      email: normalizedEmail,
      password_hash: passwordHash,
      role: 'user',
    };

    if (name) {
      userData.name = name;
    }

    const newUser = await DatabaseService.insertRecord<{ id: string; email: string; role: string }>('users', userData);
    console.log(`User created in database: ${normalizedEmail}`);

    // Return success without sensitive data
    return NextResponse.json({
      success: true,
      user: {
        id: newUser.id,
        email: newUser.email,
        role: newUser.role
      },
      message: 'Pendaftaran berhasil. Silakan masuk.'
    });
  } catch (error: unknown) {
    // Race condition: another request created the same email between the
    // pre-check and the insert. Return the same generic message as the
    // existence check above so callers can't distinguish races from lookups
    // and we never leak the underlying Postgres error text.
    if (error instanceof DatabaseError && error.isUniqueViolation) {
      return NextResponse.json(
        { error: 'Email sudah terdaftar' },
        { status: 409 }
      );
    }
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Gagal mendaftarkan pengguna' },
      { status: 500 }
    );
  }
} 