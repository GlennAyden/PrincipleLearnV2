import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';

export async function POST(req: Request) {
  try {
    // Optional CSRF validation for extra security
    const csrfHeader = req.headers.get('x-csrf-token');
    const cookieStore = await cookies();
    const csrfCookie = cookieStore.get('csrf_token')?.value;

    // If both CSRF token sources exist, validate they match
    if (csrfHeader && csrfCookie && csrfHeader !== csrfCookie) {
      return NextResponse.json(
        { error: 'Invalid CSRF token' },
        { status: 403 }
      );
    }

    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully'
    });
    
    // Clear all auth-related cookies
    response.cookies.delete('access_token');
    response.cookies.delete('refresh_token');
    response.cookies.delete('csrf_token');
    
    return response;
  } catch (error: any) {
    console.error('Logout error:', error);
    return NextResponse.json(
      { error: 'Failed to logout' },
      { status: 500 }
    );
  }
}
