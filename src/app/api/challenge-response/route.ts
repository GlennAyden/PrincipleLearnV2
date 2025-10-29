import { NextRequest, NextResponse } from 'next/server';
import { adminDb, DatabaseError } from '@/lib/database';
import { verifyToken } from '@/lib/jwt';

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

    const accessToken = req.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (tokenPayload.userId !== userId) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 });
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
      const timestamp = new Date().toISOString();
      const challengeData = {
        id: challengeId,
        user_id: userId,
        course_id: courseId,
        module_index: moduleIndex ?? 0,
        subtopic_index: subtopicIndex ?? 0,
        page_number: pageNumber ?? 0,
        question,
        answer,
        feedback: feedback || null,
        created_at: timestamp,
        updated_at: timestamp
      };

      const { error: insertError } = await adminDb
        .from('challenge_responses')
        .insert(challengeData);

      if (insertError) {
        throw new DatabaseError('Failed to insert record into challenge_responses', insertError);
      }
      
      console.log('[Challenge Response] Successfully saved challenge response');
      
      return NextResponse.json({
        success: true,
        challengeId: challengeId,
        message: 'Challenge response saved successfully'
      });
      
    } catch (dbError: any) {
      const message = dbError instanceof DatabaseError ? dbError.message : 'Unknown database error';
      console.error('[Challenge Response] Database error:', message, dbError?.originalError || dbError);
      
      return NextResponse.json(
        {
          success: false,
          challengeId,
          error: 'Failed to persist challenge response',
          details: message
        },
        { status: 500 }
      );
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

    const accessToken = req.cookies.get('access_token')?.value;
    const tokenPayload = accessToken ? verifyToken(accessToken) : null;

    if (!tokenPayload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    if (tokenPayload.userId !== userId) {
      return NextResponse.json({ error: 'User mismatch' }, { status: 403 });
    }

    console.log('[Challenge Response] Attempting to retrieve challenge responses for user:', userId);

    try {
      let query = adminDb
        .from('challenge_responses')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (courseId) {
        query = query.eq('course_id', courseId);
      }

      if (moduleIndex !== null) {
        const parsedModule = parseInt(moduleIndex, 10);
        if (!Number.isNaN(parsedModule)) {
          query = query.eq('module_index', parsedModule);
        }
      }

      if (subtopicIndex !== null) {
        const parsedSubtopic = parseInt(subtopicIndex, 10);
        if (!Number.isNaN(parsedSubtopic)) {
          query = query.eq('subtopic_index', parsedSubtopic);
        }
      }

      if (pageNumber !== null) {
        const parsedPage = parseInt(pageNumber, 10);
        if (!Number.isNaN(parsedPage)) {
          query = query.eq('page_number', parsedPage);
        }
      }

      const { data, error: selectError } = await query;

      if (selectError) {
        throw new DatabaseError('Failed to get records from challenge_responses', selectError);
      }

      const responses = data ?? [];
      console.log(`[Challenge Response] Successfully retrieved ${responses.length} responses`);

      return NextResponse.json({
        success: true,
        responses
      });
      
    } catch (dbError: any) {
      const message = dbError instanceof DatabaseError ? dbError.message : 'Unknown database error';
      console.error('[Challenge Response] Database error:', message, dbError?.originalError || dbError);
      
      return NextResponse.json(
        {
          success: false,
          responses: [],
          error: 'Failed to load challenge responses',
          details: message
        },
        { status: 500 }
      );
    }

  } catch (error: any) {
    console.error('Error retrieving challenge responses:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve challenge responses: ' + error.message },
      { status: 500 }
    );
  }
}
