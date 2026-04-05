import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/jwt';
import {
  findUserById,
  generateAuthTokens,
  generateCsrfToken,
} from '@/services/auth.service';

export async function POST(_req: Request) {
  try {
    const cookieStore = await cookies();
    const oldRefreshToken = cookieStore.get('refresh_token')?.value;

    // If no refresh token exists, return unauthorized
    if (!oldRefreshToken) {
      return NextResponse.json(
        { error: 'No refresh token provided' },
        { status: 401 }
      );
    }

    // Verify the refresh token
    const payload = verifyToken(oldRefreshToken);

    // If token is invalid or expired, return unauthorized
    if (!payload) {
      const response = NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );

      response.cookies.delete('access_token');
      response.cookies.delete('refresh_token');
      response.cookies.delete('csrf_token');

      return response;
    }

    // Validate user still exists and has required fields
    const user = await findUserById(payload.userId);

    if (!user || !user.id || !user.email || !user.role) {
      const response = NextResponse.json(
        { error: 'User no longer exists' },
        { status: 401 }
      );

      response.cookies.delete('access_token');
      response.cookies.delete('refresh_token');
      response.cookies.delete('csrf_token');

      return response;
    }

    // Rotate tokens: generate both new access + new refresh token
    // The old refresh token is implicitly invalidated by being overwritten in the cookie
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      generateAuthTokens(user);

    // Generate new CSRF token
    const csrfToken = generateCsrfToken();

    // Create response
    const response = NextResponse.json({
      success: true,
      csrfToken,
    });

    // Set new access token cookie
    response.cookies.set('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/',
    });

    // Set rotated refresh token cookie (new token, fresh 7-day lifetime)
    response.cookies.set('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60, // 7 days
      path: '/',
    });

    // Set new CSRF token cookie
    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: false, // Accessible from JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/',
    });

    return response;
  } catch (error: any) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Failed to refresh token' },
      { status: 500 }
    );
  }
}
