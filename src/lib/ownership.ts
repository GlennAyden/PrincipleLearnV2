// src/lib/ownership.ts
// Shared ownership guard for course-scoped API routes.
//
// Usage:
//   try {
//     await assertCourseOwnership(userId, courseId);
//   } catch (err) {
//     if ((err as { status?: number }).status === 403) {
//       return NextResponse.json({ error: (err as Error).message }, { status: 403 });
//     }
//     throw err;
//   }
//
// Admins can bypass the check by passing their role via `userRole`.

import { DatabaseService } from './database';

export interface OwnershipError extends Error {
  status: number;
}

function ownershipError(message: string, status: number): OwnershipError {
  const err = new Error(message) as OwnershipError;
  err.status = status;
  return err;
}

/**
 * Ensure the given user owns the course (or is an admin).
 * Throws an error with `.status = 403` when the course does not belong
 * to the user, and `.status = 400` when the courseId is missing.
 */
export async function assertCourseOwnership(
  userId: string,
  courseId: string,
  userRole?: string,
): Promise<void> {
  if (!userId) {
    throw ownershipError('Autentikasi diperlukan', 401);
  }
  if (!courseId) {
    throw ownershipError('courseId wajib diisi', 400);
  }

  // Admins bypass ownership checks entirely.
  if (userRole && userRole.toLowerCase() === 'admin') {
    const adminCourses = await DatabaseService.getRecords<{ id: string }>('courses', {
      filter: { id: courseId },
      limit: 1,
    });
    if (adminCourses.length === 0) {
      throw ownershipError('Course not found', 404);
    }
    return;
  }

  const courses = await DatabaseService.getRecords<{ id: string; created_by: string }>('courses', {
    filter: { id: courseId, created_by: userId },
    limit: 1,
  });

  if (courses.length === 0) {
    throw ownershipError('Course not found or access denied', 403);
  }
}

/**
 * Narrow a thrown value into an OwnershipError when possible.
 * Returns `null` when the error was not produced by this helper.
 */
export function toOwnershipError(err: unknown): OwnershipError | null {
  if (err && typeof err === 'object' && 'status' in err && err instanceof Error) {
    const status = (err as OwnershipError).status;
    if (typeof status === 'number') return err as OwnershipError;
  }
  return null;
}
