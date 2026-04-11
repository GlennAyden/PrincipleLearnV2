import { NextResponse } from 'next/server';
import { getCurrentUser, resolveUserByIdentifier } from '@/services/auth.service';
import { listUserCourses } from '@/services/course.service';

export async function GET(request: Request) {
  try {
    // Primary: cookie-based auth (secure)
    const currentUser = await getCurrentUser();

    let resolvedUserId: string;

    if (currentUser) {
      resolvedUserId = currentUser.id;
    } else {
      // Fallback: middleware-injected header or legacy query params
      const headerUserId = request.headers.get('x-user-id');

      if (headerUserId) {
        resolvedUserId = headerUserId;
      } else {
        const url = new URL(request.url);
        const identifier = url.searchParams.get('userId') || url.searchParams.get('userEmail');

        if (!identifier) {
          return NextResponse.json({
            error: 'Autentikasi diperlukan',
          }, { status: 401 });
        }

        const user = await resolveUserByIdentifier(identifier);
        if (!user) {
          return NextResponse.json({
            error: 'Pengguna tidak ditemukan',
          }, { status: 404 });
        }

        resolvedUserId = user.id;
      }
    }

    const courses = await listUserCourses(resolvedUserId);

    return NextResponse.json({
      success: true,
      courses,
    });

  } catch (error) {
    console.error('[Get Courses] Error fetching courses:', error);
    return NextResponse.json({
      error: 'Gagal memuat kursus',
    }, { status: 500 });
  }
}
