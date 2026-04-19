import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyRefreshToken, verifyToken } from '@/lib/jwt';
import { updateUserRefreshTokenHash } from '@/services/auth.service';

export async function POST(req: Request) {
  try {
    // Enforced CSRF validation — logout mutates server-side state (it
    // invalidates the refresh token hash), so we require the double-submit
    // cookie/header pair even if one is missing.
    const csrfHeader = req.headers.get('x-csrf-token');
    const cookieStore = await cookies();
    const csrfCookie = cookieStore.get('csrf_token')?.value;

    if (!csrfHeader || !csrfCookie || csrfHeader !== csrfCookie) {
      return NextResponse.json(
        { error: 'Token CSRF tidak valid' },
        { status: 403 }
      );
    }

    // If we can still identify the user, wipe their stored refresh token
    // hash so any outstanding refresh cookie becomes useless.
    const accessToken = cookieStore.get('access_token')?.value;
    const refreshToken = cookieStore.get('refresh_token')?.value;
    const payload = accessToken ? verifyToken(accessToken) : null;
    const refreshPayload = payload?.userId
      ? null
      : refreshToken
        ? verifyRefreshToken(refreshToken)
        : null;
    const userId = payload?.userId ?? refreshPayload?.userId ?? null;

    if (userId) {
      await updateUserRefreshTokenHash(userId, null);
    }

    const response = NextResponse.json({
      success: true,
      message: 'Berhasil keluar'
    });

    // Clear all auth-related cookies
    response.cookies.delete('access_token');
    response.cookies.delete('refresh_token');
    response.cookies.delete('csrf_token');

    return response;
  } catch (error: unknown) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Gagal keluar' },
      { status: 500 }
    );
  }
}
