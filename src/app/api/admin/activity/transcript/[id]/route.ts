import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminDb } from '@/lib/database'

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params

    if (!id) {
      return NextResponse.json(
        { error: 'Transcript ID is required' },
        { status: 400 }
      )
    }

    // Fetch transcript by ID using adminDb
    // Try 'transcript' table first, then fall back to 'transcripts'
    let transcriptData: {
      id: string;
      content: string;
      notes: string;
      course_id: string;
      subtopic_id: string;
      created_at: string;
      user_id: string;
    } | null = null;
    let fetchError: { message?: string } | null = null;

    const result1 = await adminDb
      .from('transcript')
      .select('*')
      .eq('id', id)
      .single();

    if (result1.error && String(result1.error?.message || '').includes("public.transcript")) {
      const result2 = await adminDb
        .from('transcripts')
        .select('*')
        .eq('id', id)
        .single();
      transcriptData = result2.data;
      fetchError = result2.error;
    } else {
      transcriptData = result1.data;
      fetchError = result1.error;
    }

    if (fetchError) {
      console.error('Error fetching transcript:', fetchError)
      return NextResponse.json(
        { error: 'Failed to fetch transcript' },
        { status: 500 }
      )
    }

    if (!transcriptData) {
      return NextResponse.json(
        { error: 'Transcript not found' },
        { status: 404 }
      )
    }

    // Fetch user email
    const { data: users } = await adminDb
      .from('users')
      .select('email')
      .eq('id', transcriptData.user_id)
      .limit(1)

    const userEmail = users && users.length > 0 ? (users[0] as { email: string }).email : 'Unknown'

    // Format the response
    const response = {
      id: transcriptData.id,
      content: transcriptData.content,
      notes: transcriptData.notes,
      courseId: transcriptData.course_id,
      subtopicId: transcriptData.subtopic_id,
      createdAt: transcriptData.created_at,
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
