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
        { error: 'Too many registration attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Validate request body (email format + password strength enforced by schema)
    const parsed = parseBody(RegisterSchema, await req.json());
    if (!parsed.success) return parsed.response;
    const { email, password, name } = parsed.data;

    // Normalize email to prevent case-sensitivity duplicates
    const normalizedEmail = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await findUserByEmail(normalizedEmail);
    if (existingUser) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
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
      message: 'Registration successful. You can now log in.'
    });
  } catch (error: unknown) {
    // Handle race condition: another request created the same email between check and insert
    if (error instanceof DatabaseError && error.isUniqueViolation) {
      return NextResponse.json(
        { error: 'User with this email already exists' },
        { status: 409 }
      );
    }
    console.error('Registration error:', error);
    return NextResponse.json(
      { error: 'Failed to register user' },
      { status: 500 }
    );
  }
} 