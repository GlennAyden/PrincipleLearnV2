import { NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;
    
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
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: courseId } = await params;
    
    console.log(`[Get Course] DEBUG: Starting fetch for course ID: ${courseId}`);
    console.log(`[Get Course] DEBUG: Course ID type:`, typeof courseId);
    console.log(`[Get Course] DEBUG: Course ID length:`, courseId.length);
    
    // Get course from database
    console.log(`[Get Course] DEBUG: Querying courses table`);
    const courses = await DatabaseService.getRecords('courses', {
      filter: { id: courseId },
      limit: 1
    });
    
    console.log(`[Get Course] DEBUG: Course query result:`, courses);
    console.log(`[Get Course] DEBUG: Found ${courses.length} courses`);
    
    if (courses.length === 0) {
      console.log(`[Get Course] DEBUG: Course not found, returning 404`);
      return NextResponse.json({
        success: false,
        error: 'Course not found'
      }, { status: 404 });
    }
    
    const course = courses[0];
    console.log(`[Get Course] DEBUG: Course data:`, course);
    
    // Get subtopics for this course
    console.log(`[Get Course] DEBUG: Querying subtopics table`);
    const subtopics = await DatabaseService.getRecords('subtopics', {
      filter: { course_id: courseId },
      orderBy: { column: 'order_index', ascending: true }
    });
    
    console.log(`[Get Course] DEBUG: Subtopics query result:`, subtopics);
    console.log(`[Get Course] Found course with ${subtopics.length} subtopics`);
    
    const response = {
      success: true,
      course: {
        ...course,
        subtopics
      }
    };
    
    console.log(`[Get Course] DEBUG: Returning response:`, response);
    
    return NextResponse.json(response);
    
  } catch (error) {
    console.error('[Get Course] Error fetching course:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch course'
    }, { status: 500 });
  }
}
