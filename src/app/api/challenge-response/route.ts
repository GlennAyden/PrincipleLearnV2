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

    // Save challenge response to database
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

    return NextResponse.json({
      success: true,
      challengeId: challengeId,
      message: 'Challenge response saved successfully'
    });

  } catch (error: any) {
    console.error('Error saving challenge response:', error);
    return NextResponse.json(
      { error: 'Failed to save challenge response: ' + error.message },
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

    // Build filter conditions
    const filter: any = { user_id: userId };
    if (courseId) filter.course_id = courseId;
    if (moduleIndex !== null) filter.module_index = parseInt(moduleIndex);
    if (subtopicIndex !== null) filter.subtopic_index = parseInt(subtopicIndex);
    if (pageNumber !== null) filter.page_number = parseInt(pageNumber);

    // Get challenge responses from database
    const responses = await DatabaseService.getRecords('challenge_responses', {
      filter,
      orderBy: { created_at: 'desc' },
      limit: 100
    });

    return NextResponse.json({
      success: true,
      responses: responses
    });

  } catch (error: any) {
    console.error('Error retrieving challenge responses:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve challenge responses: ' + error.message },
      { status: 500 }
    );
  }
}