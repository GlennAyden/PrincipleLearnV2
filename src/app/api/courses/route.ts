import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/jwt';
import { DatabaseService } from '@/lib/database';

interface UserRecord {
  id: string;
  email: string;
}

interface CourseRecord {
  id: string;
  title: string;
  difficulty_level: string;
  created_by: string;
  created_at: string;
}

/**
 * Get the current authenticated user from the access_token cookie.
 * Returns null if no valid token or user not found.
 */
async function getCurrentUser(): Promise<UserRecord | null> {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('access_token')?.value;
    if (!token) return null;

    const payload = verifyToken(token);
    if (!payload || !payload.userId) return null;

    const users = await DatabaseService.getRecords<UserRecord>('users', {
      filter: { id: payload.userId as string },
      limit: 1,
    });

    return users.length > 0 ? users[0] : null;
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  try {
    // Primary: cookie-based auth (secure)
    const currentUser = await getCurrentUser();

    let resolvedUserId: string;

    if (currentUser) {
      resolvedUserId = currentUser.id;
    } else {
      // Fallback: query params (for backward compatibility / middleware-injected headers)
      const headerUserId = request.headers.get('x-user-id');

      if (headerUserId) {
        resolvedUserId = headerUserId;
      } else {
        // Legacy: query params (userId / userEmail)
        const url = new URL(request.url);
        const userId = url.searchParams.get('userId');
        const userEmail = url.searchParams.get('userEmail');

        if (!userId && !userEmail) {
          return NextResponse.json({
            success: false,
            error: 'Authentication required',
          }, { status: 401 });
        }

        if (userId) {
          const users = await DatabaseService.getRecords<UserRecord>('users', {
            filter: { id: userId },
            limit: 1,
          });

          if (users.length === 0) {
            return NextResponse.json({
              success: false,
              error: 'User not found',
            }, { status: 404 });
          }

          resolvedUserId = users[0].id;
        } else {
          const users = await DatabaseService.getRecords<UserRecord>('users', {
            filter: { email: userEmail! },
            limit: 1,
          });

          if (users.length === 0) {
            return NextResponse.json({
              success: false,
              error: 'User not found',
            }, { status: 404 });
          }

          resolvedUserId = users[0].id;
        }
      }
    }

    // Get courses created by this user
    const courses = await DatabaseService.getRecords<CourseRecord>('courses', {
      filter: { created_by: resolvedUserId },
      orderBy: { column: 'created_at', ascending: false },
    });

    // Transform to match frontend format
    const formattedCourses = courses.map(course => ({
      id: course.id,
      title: course.title,
      level: course.difficulty_level || 'Beginner',
    }));

    return NextResponse.json({
      success: true,
      courses: formattedCourses,
    });

  } catch (error) {
    console.error('[Get Courses] Error fetching courses:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch courses',
    }, { status: 500 });
  }
}
