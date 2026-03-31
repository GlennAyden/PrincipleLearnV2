import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken, generateAccessToken, getTokenExpiration } from '@/lib/jwt';
import { DatabaseService } from '@/lib/database';
import { randomBytes } from 'crypto';

export async function POST(req: Request) {
  try {
    const cookieStore = await cookies();
    const refreshToken = cookieStore.get('refresh_token')?.value;

    // If no refresh token exists, return unauthorized
    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No refresh token provided' },
        { status: 401 }
      );
    }

    // Verify the refresh token
    const payload = verifyToken(refreshToken);

    // If token is invalid or expired, return unauthorized
    if (!payload) {
      const response = NextResponse.json(
        { error: 'Invalid or expired refresh token' },
        { status: 401 }
      );

      // Clear the invalid tokens
      response.cookies.delete('access_token');
      response.cookies.delete('refresh_token');
      response.cookies.delete('csrf_token');

      return response;
    }

    // Validate user exists in the database (replaces old mock users)
    let user: any = null;
    try {
      const users = await DatabaseService.getRecords('users', {
        filter: { id: payload.userId },
        limit: 1
      });
      user = users.length > 0 ? users[0] : null;
    } catch (dbError) {
      console.error('Token refresh - database error:', dbError);
      return NextResponse.json(
        { error: 'Database error during token refresh' },
        { status: 500 }
      );
    }

    // Check if user still exists (e.g., admin may have deleted the user)
    if (!user) {
      const response = NextResponse.json(
        { error: 'User no longer exists' },
        { status: 401 }
      );

      // Clear the invalid tokens
      response.cookies.delete('access_token');
      response.cookies.delete('refresh_token');
      response.cookies.delete('csrf_token');

      return response;
    }

    // Generate new access token with real user data
    const newAccessToken = generateAccessToken({
      userId: user.id,
      email: user.email,
      role: user.role
    });

    // Generate new CSRF token
    const csrfToken = randomBytes(32).toString('hex');

    // Create response
    const response = NextResponse.json({
      success: true,
      csrfToken
    });

    // Set new access token cookie
    response.cookies.set('access_token', newAccessToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/'
    });

    // Set new CSRF token cookie
    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: false, // Accessible from JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 15 * 60, // 15 minutes
      path: '/'
    });

    return response;
  } catch (error: any) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to refresh token' },
      { status: 500 }
    );
  }
}
