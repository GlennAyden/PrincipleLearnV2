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
        success: false,
        error: 'Authentication required',
      }, { status: 401 });
    }

    const course = await getCourseById(courseId);
    if (!course) {
      return NextResponse.json({
        success: false,
        error: 'Course not found',
      }, { status: 404 });
    }

    if (!canAccessCourse(course, currentUser.id, currentUser.role)) {
      return NextResponse.json({
        success: false,
        error: 'You do not have permission to delete this course',
      }, { status: 403 });
    }

    await deleteCourse(courseId);

    return NextResponse.json({
      success: true,
      message: 'Course deleted successfully',
    });
  } catch (error) {
    console.error('[Delete Course] Error deleting course:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to delete course',
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
        success: false,
        error: 'Authentication required',
      }, { status: 401 });
    }

    const courseWithSubtopics = await getCourseWithSubtopics(courseId);
    if (!courseWithSubtopics) {
      return NextResponse.json({
        success: false,
        error: 'Course not found',
      }, { status: 404 });
    }

    if (!canAccessCourse(courseWithSubtopics, currentUser.id, currentUser.role)) {
      return NextResponse.json({
        success: false,
        error: 'You do not have permission to view this course',
      }, { status: 403 });
    }

    return NextResponse.json({
      success: true,
      course: courseWithSubtopics,
    });
  } catch (error) {
    console.error('[Get Course] Error fetching course:', error);
    return NextResponse.json({
      success: false,
      error: 'Failed to fetch course',
    }, { status: 500 });
  }
}
