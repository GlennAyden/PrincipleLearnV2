import { NextResponse } from 'next/server';
import { loginRateLimiter } from '@/lib/rate-limit';
import { LoginSchema, parseBody } from '@/lib/schemas';
import {
  findUserByEmail,
  verifyPassword,
  generateAuthTokens,
  generateCsrfToken,
} from '@/services/auth.service';

export async function POST(req: Request) {
  try {
    // Get client IP for rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    // Check rate limiting
    if (!(await loginRateLimiter.isAllowed(ip))) {
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429 }
      );
    }

    // Validate request body
    const parsed = parseBody(LoginSchema, await req.json());
    if (!parsed.success) return parsed.response;
    const { email, password, rememberMe } = parsed.data;

    // Find user by email (normalize to lowercase)
    const user = await findUserByEmail(email.toLowerCase().trim());
    if (!user || !user.password_hash) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Password verification
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateAuthTokens(user);

    // Log successful login
    console.log(`User logged in successfully: ${user.id}`);

    // Set CSRF token
    const csrfToken = generateCsrfToken();
    
    // Create response (csrfToken in body kept for API consumers; frontend reads from cookie)
    const response = NextResponse.json({
      success: true,
      csrfToken,
      user: {
        id: user.id,
        email: user.email,
        role: user.role
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
    
    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: false, // Accessible from JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/'
    });
    
    return response;
  } catch (error: any) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Failed to login' },
      { status: 500 }
    );
  }
} 