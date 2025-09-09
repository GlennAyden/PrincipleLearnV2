import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, courseId, moduleIndex, subtopicIndex, pageNumber, question, answer, feedback } = body;

    if (!userId || !courseId || !question || !answer) {
      return NextResponse.json(
        { error: 'Missing required fields: userId, courseId, question, answer' },
        { status: 400 }
      );
    }

    // Create unique identifier for this challenge session
    const challengeId = `${courseId}_${moduleIndex}_${subtopicIndex}_${pageNumber}_${Date.now()}`;

    console.log('[Challenge Response] Attempting to save challenge response:', {
      challengeId,
      userId,
      courseId
    });

    // Try to save challenge response to database
    try {
      const challengeData = {
        id: challengeId,
        user_id: userId,
        course_id: courseId,
        module_index: moduleIndex || 0,
        subtopic_index: subtopicIndex || 0,
        page_number: pageNumber || 0,
        question: question,
        answer: answer,
        feedback: feedback || null,
        created_at: new Date().toISOString(),
      };

      await DatabaseService.insertRecord('challenge_responses', challengeData);
      
      console.log('[Challenge Response] Successfully saved challenge response');
      
      return NextResponse.json({
        success: true,
        challengeId: challengeId,
        message: 'Challenge response saved successfully'
      });
      
    } catch (dbError: any) {
      console.warn('[Challenge Response] Database error (table may not exist):', dbError.message);
      
      // If table doesn't exist, return success but log the issue
      // This allows the feature to work without breaking the user experience
      return NextResponse.json({
        success: true,
        challengeId: challengeId,
        message: 'Challenge response processed (storage temporarily unavailable)',
        warning: 'Response not persisted - challenge_responses table not found'
      });
    }

  } catch (error: any) {
    console.error('Error in challenge response API:', error);
    return NextResponse.json(
      { error: 'Failed to process challenge response: ' + error.message },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    const courseId = searchParams.get('courseId');
    const moduleIndex = searchParams.get('moduleIndex');
    const subtopicIndex = searchParams.get('subtopicIndex');
    const pageNumber = searchParams.get('pageNumber');

    if (!userId) {
      return NextResponse.json(
        { error: 'userId parameter is required' },
        { status: 400 }
      );
    }

    console.log('[Challenge Response] Attempting to retrieve challenge responses for user:', userId);

    try {
      // Build filter conditions
      const filter: any = { user_id: userId };
      if (courseId) filter.course_id = courseId;
      if (moduleIndex !== null) filter.module_index = parseInt(moduleIndex);
      if (subtopicIndex !== null) filter.subtopic_index = parseInt(subtopicIndex);
      if (pageNumber !== null) filter.page_number = parseInt(pageNumber);

      // Get challenge responses from database
      const responses = await DatabaseService.getRecords('challenge_responses', {
        filter,
        orderBy: { column: 'created_at', ascending: false },
        limit: 100
      });

      console.log(`[Challenge Response] Successfully retrieved ${responses.length} responses`);

      return NextResponse.json({
        success: true,
        responses: responses
      });
      
    } catch (dbError: any) {
      console.warn('[Challenge Response] Database error (table may not exist):', dbError.message);
      
      // If table doesn't exist, return empty array instead of error
      return NextResponse.json({
        success: true,
        responses: [],
        warning: 'challenge_responses table not found - returning empty results'
      });
    }

  } catch (error: any) {
    console.error('Error retrieving challenge responses:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve challenge responses: ' + error.message },
      { status: 500 }
    );
  }
}