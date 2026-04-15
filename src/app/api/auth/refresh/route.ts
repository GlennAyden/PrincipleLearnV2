import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import {
  ACCESS_TOKEN_MAX_AGE_SECONDS,
  REFRESH_TOKEN_MAX_AGE_SECONDS,
  verifyRefreshToken,
} from '@/lib/jwt';
import {
  findUserById,
  generateAuthTokens,
  generateCsrfToken,
  hashRefreshToken,
  updateUserRefreshTokenHash,
} from '@/services/auth.service';

export async function POST(_req: Request) {
  try {
    const cookieStore = await cookies();
    const oldRefreshToken = cookieStore.get('refresh_token')?.value;

    // If no refresh token exists, return unauthorized
    if (!oldRefreshToken) {
      return NextResponse.json(
        { error: 'Token refresh tidak tersedia' },
        { status: 401 }
      );
    }

    // Verify the refresh token
    const payload = verifyRefreshToken(oldRefreshToken);

    // If token is invalid or expired, return unauthorized
    if (!payload) {
      const response = NextResponse.json(
        { error: 'Token refresh tidak valid atau kedaluwarsa' },
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
        { error: 'Pengguna tidak lagi terdaftar' },
        { status: 401 }
      );

      response.cookies.delete('access_token');
      response.cookies.delete('refresh_token');
      response.cookies.delete('csrf_token');

      return response;
    }

    // Rotation-race defence: the presented refresh token must match the hash
    // we persisted last time we issued one. If there is no stored hash, we
    // tolerate it as a legacy session (a user whose hash predates this fix)
    // and fall through to set a fresh one below. If there IS a stored hash
    // and it doesn't match, treat the cookie as revoked.
    const storedHash = user.refresh_token_hash ?? null;
    if (storedHash) {
      const presentedHash = hashRefreshToken(oldRefreshToken);
      if (presentedHash !== storedHash) {
        const response = NextResponse.json(
          { error: 'Token refresh telah dicabut' },
          { status: 401 }
        );
        response.cookies.delete('access_token');
        response.cookies.delete('refresh_token');
        response.cookies.delete('csrf_token');
        // Defensive: clear the stored hash so any other in-flight replay
        // attempts also fail even if the current one was already valid once.
        await updateUserRefreshTokenHash(user.id, null);
        return response;
      }
    }

    // Rotate tokens: generate both new access + new refresh token.
    const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
      generateAuthTokens(user);

    // Persist the new refresh token hash BEFORE returning the new cookie so
    // the next refresh call can verify it.
    await updateUserRefreshTokenHash(user.id, hashRefreshToken(newRefreshToken));

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
      maxAge: ACCESS_TOKEN_MAX_AGE_SECONDS,
      path: '/',
    });

    // Set rotated refresh token cookie (new token, fresh 7-day lifetime)
    response.cookies.set('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
      path: '/',
    });

    // Refresh flow implies a long-lived session — ride the refresh lifetime
    // so the CSRF cookie doesn't expire before the access token does.
    response.cookies.set('csrf_token', csrfToken, {
      httpOnly: false, // Accessible from JavaScript
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: REFRESH_TOKEN_MAX_AGE_SECONDS,
      path: '/',
    });

    return response;
  } catch (error: unknown) {
    console.error('Token refresh error:', error);
    return NextResponse.json(
      { error: 'Gagal memperbarui token' },
      { status: 500 }
    );
  }
}
