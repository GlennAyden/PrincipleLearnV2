import { NextResponse } from 'next/server';
import { getCurrentUser } from '@/services/auth.service';
import {
  getCourseById,
  getCourseWithSubtopics,
  deleteCourse,
  canAccessCourse,
} from '@/services/course.service';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({
        error: 'Autentikasi diperlukan',
      }, { status: 401 });
    }

    const course = await getCourseById(courseId);
    if (!course) {
      return NextResponse.json({
        error: 'Kursus tidak ditemukan',
      }, { status: 404 });
    }

    if (!canAccessCourse(course, currentUser.id, currentUser.role)) {
      return NextResponse.json({
        error: 'Anda tidak memiliki izin untuk menghapus kursus ini',
      }, { status: 403 });
    }

    await deleteCourse(courseId);

    return NextResponse.json({
      success: true,
      message: 'Kursus berhasil dihapus',
    });
  } catch (error) {
    console.error('[Delete Course] Error deleting course:', error);
    return NextResponse.json({
      error: 'Gagal menghapus kursus',
    }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;

    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return NextResponse.json({
        error: 'Autentikasi diperlukan',
      }, { status: 401 });
    }

    const courseWithSubtopics = await getCourseWithSubtopics(courseId);
    if (!courseWithSubtopics) {
      return NextResponse.json({
        error: 'Kursus tidak ditemukan',
      }, { status: 404 });
    }

    if (!canAccessCourse(courseWithSubtopics, currentUser.id, currentUser.role)) {
      return NextResponse.json({
        error: 'Anda tidak memiliki izin untuk melihat kursus ini',
      }, { status: 403 });
    }

    const response = NextResponse.json({
      success: true,
      course: courseWithSubtopics,
    });
    // Course outline rarely changes — cache for 5 minutes
    response.headers.set('Cache-Control', 'private, max-age=300, stale-while-revalidate=600');
    return response;
  } catch (error) {
    console.error('[Get Course] Error fetching course:', error);
    return NextResponse.json({
      error: 'Gagal memuat kursus',
    }, { status: 500 });
  }
}
