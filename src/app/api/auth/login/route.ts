import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { generateAccessToken, generateRefreshToken, getTokenExpiration } from '@/lib/jwt';
import { validateEmail } from '@/lib/validation';
import { loginRateLimiter } from '@/lib/rate-limit';
import { randomBytes } from 'crypto';
// import prisma from '@/lib/prisma'; // Removed for mock implementation

export async function POST(req: Request) {
  try {
    // Get client IP for rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown';
    
    // Check rate limiting
    if (!loginRateLimiter.isAllowed(ip)) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }
    
    const { email, password, rememberMe = false } = await req.json();

    // Validate email format
    const emailValidation = validateEmail(email);
    if (!emailValidation.valid) {
      return NextResponse.json(
        { error: emailValidation.message },
        { status: 400 }
      );
    }

    // Validation for required fields
    if (!password) {
      return NextResponse.json(
        { error: 'Password is required' },
        { status: 400 }
      );
    }

    // Mock user data for testing
    const mockUsers = [
      {
        id: 'user-123',
        email: 'user@example.com',
        passwordHash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
        role: 'USER',
        isVerified: true,
        failedLoginAttempts: 0,
        lockedUntil: null
      },
      {
        id: 'admin-456',
        email: 'admin@example.com',
        passwordHash: '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', // password
        role: 'ADMIN',
        isVerified: true,
        failedLoginAttempts: 0,
        lockedUntil: null
      }
    ];

    // Find user by email in mock data
    const user = mockUsers.find(u => u.email === email);

    // Check if user exists
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }
    
    // Check if account is locked (mock check)
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return NextResponse.json(
        { 
          error: 'Account is temporarily locked due to multiple failed login attempts',
          unlockTime: user.lockedUntil
        },
        { status: 403 }
      );
    }

    // Mock password verification (accept "password" as valid password)
    const isPasswordValid = password === 'password' || await bcrypt.compare(password, user.passwordHash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Reset failed login attempts on successful login
    const refreshToken = generateRefreshToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });
    
    const refreshTokenExpiration = getTokenExpiration(refreshToken);
    
    // Generate access token
    const accessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });
    
    // Mock database update - in real implementation, would update user record
    // For mock purposes, we'll just log the successful login
    console.log(`Mock login update for user ${user.id}: reset failed attempts, updated last login`);
    
    // Create response
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        role: user.role,
        isVerified: user.isVerified
      }
    });
    
    // Set access token cookie (short-lived)
    response.cookies.set('access_token', accessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/'
    });
    
    // Set refresh token cookie if "remember me" is selected
    if (rememberMe && refreshToken) {
      response.cookies.set('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60, // 7 days
        path: '/'
      });
    }
    
    // Set CSRF token
    const csrfToken = randomBytes(32).toString('hex');
    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: false, // Accessible from JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/'
    });
    
    // Add CSRF token to response body

    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to login' },
      { status: 500 }
    );
  }
} 