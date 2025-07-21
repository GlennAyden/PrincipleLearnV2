import { NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    
    console.log(`[Get Courses] Fetching courses for user: ${userId}`);
    
    if (!userId) {
      return NextResponse.json({
        success: false,
        error: 'User ID is required'
      }, { status: 400 });
    }
    
    // Find user by email
    const users = await DatabaseService.getRecords('users', {
      filter: { email: userId },
      limit: 1
    });
    
    if (users.length === 0) {
      return NextResponse.json({
        success: false,
        error: 'User not found'
      }, { status: 404 });
    }
    
    const user = users[0];
    
    // Get courses created by this user
    const courses = await DatabaseService.getRecords('courses', {
      filter: { created_by: user.id },
      orderBy: { column: 'created_at', ascending: false }
    });
    
    console.log(`[Get Courses] Found ${courses.length} courses for user`);
    
    // Transform to match frontend format
    const formattedCourses = courses.map(course => ({
      id: course.id,
      title: course.title,
      level: course.difficulty_level || 'Beginner'
    }));
    
    return NextResponse.json({
      success: true,
      courses: formattedCourses
    });
    
  } catch (error) {
    console.error('[Get Courses] Error fetching courses:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch courses'
    }, { status: 500 });
  }
}