import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, courseId, moduleIndex, subtopicIndex, status = 'in_progress', timeSpent = 0 } = body;

    if (!userId || !courseId || moduleIndex === undefined || subtopicIndex === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, courseId, moduleIndex, subtopicIndex' },
        { status: 400 }
      );
    }

    // Create unique identifier for this progress entry
    const progressId = `${courseId}_${moduleIndex}_${subtopicIndex}_${userId}`;

    // Check if progress record already exists
    const existing = await DatabaseService.getRecords('user_progress', {
      filter: { 
        user_id: userId, 
        course_id: courseId, 
        module_index: moduleIndex, 
        subtopic_index: subtopicIndex 
      },
      limit: 1
    });

    const progressData = {
      id: progressId,
      user_id: userId,
      course_id: courseId,
      module_index: moduleIndex,
      subtopic_index: subtopicIndex,
      status: status, // 'not_started', 'in_progress', 'completed'
      time_spent: timeSpent,
      completed_at: status === 'completed' ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    };

    if (existing.length > 0) {
      // Update existing progress
      await DatabaseService.updateRecord('user_progress', existing[0].id, {
        status: status,
        time_spent: timeSpent,
        completed_at: status === 'completed' ? new Date().toISOString() : existing[0].completed_at,
        updated_at: new Date().toISOString(),
      });
    } else {
      // Insert new progress record
      progressData.created_at = new Date().toISOString();
      await DatabaseService.insertRecord('user_progress', progressData);
    }

    return NextResponse.json({
      success: true,
      progressId: progressId,
      message: 'User progress updated successfully'
    });

  } catch (error: any) {
    console.error('Error updating user progress:', error);
    return NextResponse.json(
      { error: 'Failed to update user progress: ' + error.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const courseId = searchParams.get('courseId');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId parameter is required' },
        { status: 400 }
      );
    }

    // Build filter conditions
    const filter: any = { user_id: userId };
    if (courseId) filter.course_id = courseId;

    // Get user progress from database
    const progress = await DatabaseService.getRecords('user_progress', {
      filter,
      orderBy: { updated_at: 'desc' }
    });

    // Calculate statistics
    const stats = {
      total_subtopics: progress.length,
      completed_subtopics: progress.filter(p => p.status === 'completed').length,
      in_progress_subtopics: progress.filter(p => p.status === 'in_progress').length,
      total_time_spent: progress.reduce((sum, p) => sum + (p.time_spent || 0), 0),
    };

    return NextResponse.json({
      success: true,
      progress: progress,
      statistics: stats
    });

  } catch (error: any) {
    console.error('Error retrieving user progress:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve user progress: ' + error.message },
      { status: 500 }
    );
  }
}