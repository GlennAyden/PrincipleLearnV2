// src/app/api/admin/activity/generate-course/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DatabaseService } from '@/lib/database'

interface Course {
  id: string;
  title: string;
  description?: string;
  subject?: string;
  difficulty_level?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface User {
  id: string;
  email: string;
  role: string;
}

export async function GET(req: NextRequest) {
  console.log('[Activity API] Starting generate-course activity fetch');
  
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const date = searchParams.get('date')
    
    console.log('[Activity API] Request params:', { userId, date });

    // Get all courses from database
    let courses: Course[] = [];
    try {
      courses = await DatabaseService.getRecords<Course>('courses', {
        orderBy: { column: 'created_at', ascending: false }
      });
    } catch (dbError) {
      console.error('[Activity API] Database error fetching courses:', dbError);
      return NextResponse.json([], { status: 200 }); // Return empty array if database fails
    }

    console.log(`[Activity API] Found ${courses.length} total courses in database`);
    
    // Filter courses based on parameters
    let filteredCourses = courses;
    
    // Filter by user if specified
    if (userId) {
      filteredCourses = filteredCourses.filter(course => course.created_by === userId);
      console.log(`[Activity API] Filtered by user ${userId}: ${filteredCourses.length} courses`);
    }
    
    // Filter by date if specified
    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      filteredCourses = filteredCourses.filter(course => {
        const courseDate = new Date(course.created_at);
        return courseDate >= startOfDay && courseDate <= endOfDay;
      });
      console.log(`[Activity API] Filtered by date ${date}: ${filteredCourses.length} courses`);
    }

    // Get user information for each course
    const payload = [];
    for (const course of filteredCourses) {
      try {
        // Get user info
        const users: User[] = await DatabaseService.getRecords<User>('users', {
          filter: { id: course.created_by },
          limit: 1
        });
        
        const user = users.length > 0 ? users[0] : null;
        
        // Create activity log item
        const logItem = {
          id: course.id,
          timestamp: new Date(course.created_at).toLocaleDateString('id-ID'),
          courseName: course.title || 'Untitled Course',
          parameter: JSON.stringify({
            subject: course.subject || 'General',
            difficulty: course.difficulty_level || 'Beginner',
            description: course.description || 'No description',
            estimatedDuration: '60 minutes' // Default since we don't have this in current schema
          }),
          userEmail: user?.email || 'Unknown User',
          userId: course.created_by
        };
        
        payload.push(logItem);
        
      } catch (userError) {
        console.error(`[Activity API] Error getting user info for course ${course.id}:`, userError);
        
        // Add course with unknown user info
        const logItem = {
          id: course.id,
          timestamp: new Date(course.created_at).toLocaleDateString('id-ID'),
          courseName: course.title || 'Untitled Course',
          parameter: JSON.stringify({
            subject: course.subject || 'General',
            difficulty: course.difficulty_level || 'Beginner',
            description: course.description || 'No description',
            estimatedDuration: '60 minutes'
          }),
          userEmail: 'Unknown User',
          userId: course.created_by
        };
        
        payload.push(logItem);
      }
    }
    
    console.log(`[Activity API] Returning ${payload.length} formatted course generation records`);
    return NextResponse.json(payload);
    
  } catch (error) {
    console.error('[Activity API] Error fetching generate-course logs:', error);
    if (error instanceof Error) {
      console.error('[Activity API] Error details:', error.message);
      console.error('[Activity API] Error stack:', error.stack);
    }
    return NextResponse.json(
      { error: 'Failed to fetch generate-course logs' },
      { status: 500 }
    );
  }
}