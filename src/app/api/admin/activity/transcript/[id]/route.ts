import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminDb } from '@/lib/database'

export async function GET(
  req: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const id = context.params.id

    if (!id) {
      return NextResponse.json(
        { error: 'Transcript ID is required' },
        { status: 400 }
      )
    }

    // Fetch transcript by ID using adminDb
    // Note: 'transcript' table might be named differently in Notion
    const { data: transcripts, error } = await adminDb
      .from('transcript')
      .select('*')
      .eq('id', id)
      .limit(1)

    if (error) {
      console.error('Error fetching transcript:', error)
      return NextResponse.json(
        { error: 'Failed to fetch transcript' },
        { status: 500 }
      )
    }

    if (!transcripts || transcripts.length === 0) {
      return NextResponse.json(
        { error: 'Transcript not found' },
        { status: 404 }
      )
    }

    const transcript = transcripts[0] as {
      id: string;
      question: string;
      answer: string;
      course_id: string;
      subtopic: string;
      created_at: string;
      user_id: string;
    }

    // Fetch user email
    const { data: users } = await adminDb
      .from('users')
      .select('email')
      .eq('id', transcript.user_id)
      .limit(1)

    const userEmail = users && users.length > 0 ? (users[0] as { email: string }).email : 'Unknown'

    // Format the response
    const response = {
      id: transcript.id,
      question: transcript.question,
      answer: transcript.answer,
      courseId: transcript.course_id,
      subtopic: transcript.subtopic,
      createdAt: transcript.created_at,
      userEmail
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching transcript:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcript details' },
      { status: 500 }
    );
  }
}