import { NextResponse } from 'next/server';
import { loginRateLimiter } from '@/lib/rate-limit';
import { LoginSchema, parseBody } from '@/lib/schemas';
import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
} from '@/lib/jwt';
import {
  findUserByEmail,
  verifyPassword,
  runDummyPasswordCompare,
  generateAuthTokens,
  generateCsrfToken,
  hashRefreshToken,
  updateUserRefreshTokenHash,
} from '@/services/auth.service';

export async function POST(req: Request) {
  try {
    // Get client IP for rate limiting
    const ip = req.headers.get('x-forwarded-for') || 'unknown';

    // Check rate limiting
    if (!(await loginRateLimiter.isAllowed(ip))) {
      return NextResponse.json(
        { error: 'Terlalu banyak percobaan login. Coba lagi nanti.' },
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
      // Burn the same CPU cycles as a real compare to defeat user-enumeration
      // via response-time analysis.
      await runDummyPasswordCompare();
      return NextResponse.json(
        { error: 'Email atau kata sandi salah' },
        { status: 401 }
      );
    }

    // Password verification
    const isPasswordValid = await verifyPassword(password, user.password_hash);
    if (!isPasswordValid) {
      return NextResponse.json(
        { error: 'Email atau kata sandi salah' },
        { status: 401 }
      );
    }

    // Generate tokens
    const { accessToken, refreshToken } = generateAuthTokens(user);

    // Persist the refresh token hash so future refresh calls can verify the
    // presented token still matches the most recently-issued one. Only write
    // when we'll actually set the cookie (rememberMe) so users without a
    // refresh cookie don't get a stale hash stuck on the row.
    if (rememberMe && refreshToken) {
      await updateUserRefreshTokenHash(user.id, hashRefreshToken(refreshToken));
    }

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
      maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
      path: '/'
    });

    // Set refresh token cookie if "remember me" is selected
    if (rememberMe && refreshToken) {
      response.cookies.set('refresh_token', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
        path: '/'
      });
    }

    // CSRF cookie maxAge must track the effective session length or the
    // frontend will POST with a missing csrf_token cookie while the access
    // token is still valid (desync). When rememberMe we ride the refresh
    // lifetime; otherwise we cap at the access token lifetime.
    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: false, // Accessible from JavaScript (double-submit pattern)
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: rememberMe ? REFRESH_TOKEN_MAX_AGE_SECONDS : ACCESS_TOKEN_MAX_AGE_SECONDS,
      path: '/'
    });
    
    return response;
  } catch (error: unknown) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Gagal masuk' },
      { status: 500 }
    );
  }
} 