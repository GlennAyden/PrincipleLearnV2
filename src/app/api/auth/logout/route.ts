import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/jwt';
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
    if (accessToken) {
      const payload = verifyToken(accessToken);
      if (payload?.userId) {
        await updateUserRefreshTokenHash(payload.userId, null);
      }
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
