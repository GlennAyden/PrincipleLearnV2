import { NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const courseId = params.id;
    
    console.log(`[Delete Course] Deleting course with ID: ${courseId}`);
    
    // Delete course from database (CASCADE will delete subtopics automatically)
    await DatabaseService.deleteRecord('courses', courseId);
    
    console.log(`[Delete Course] Successfully deleted course: ${courseId}`);
    
    return NextResponse.json({
      success: true,
      message: 'Course deleted successfully'
    });
    
  } catch (error) {
    console.error('[Delete Course] Error deleting course:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete course'
    }, { status: 500 });
  }
}

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const courseId = params.id;
    
    console.log(`[Get Course] Fetching course with ID: ${courseId}`);
    
    // Get course from database
    const courses = await DatabaseService.getRecords('courses', {
      filter: { id: courseId },
      limit: 1
    });
    
    if (courses.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'Course not found'
      }, { status: 404 });
    }
    
    const course = courses[0];
    
    // Get subtopics for this course
    const subtopics = await DatabaseService.getRecords('subtopics', {
      filter: { course_id: courseId },
      orderBy: { column: 'order_index', ascending: true }
    });
    
    console.log(`[Get Course] Found course with ${subtopics.length} subtopics`);
    
    return NextResponse.json({
      success: true,
      course: {
        ...course,
        subtopics
      }
    });
    
  } catch (error) {
    console.error('[Get Course] Error fetching course:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch course'
    }, { status: 500 });
  }
}