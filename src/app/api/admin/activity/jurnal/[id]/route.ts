import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminDb } from '@/lib/database'

export async function GET(req: NextRequest) {
  try {
    // Ambil id dari URL
    const url = new URL(req.url)
    const id = url.pathname.split('/').pop()

    if (!id) {
      return NextResponse.json(
        { error: 'Journal ID is required' },
        { status: 400 }
      )
    }

    // Fetch journal entry by ID using adminDb
    const { data: journals, error } = await adminDb
      .from('jurnal')
      .select('*')
      .eq('id', id)
      .limit(1)

    if (error) {
      console.error('Error fetching journal:', error)
      return NextResponse.json(
        { error: 'Failed to fetch journal entry' },
        { status: 500 }
      )
    }

    if (!journals || journals.length === 0) {
      return NextResponse.json(
        { error: 'Journal entry not found' },
        { status: 404 }
      )
    }

    const journal = journals[0] as {
      id: string;
      content: string;
      course_id: string;
      reflection: unknown;
      created_at: string;
      user_id: string;
    }

    // Fetch user email
    const { data: users } = await adminDb
      .from('users')
      .select('email')
      .eq('id', journal.user_id)
      .limit(1)

    const userEmail = users && users.length > 0 ? (users[0] as { email: string }).email : 'Unknown'

    // Extract subtopic from reflection (JSONB column). Supports either a
    // structured object (preferred) or a JSON-encoded string (legacy).
    let reflectionObj: Record<string, unknown> | null = null;
    if (journal.reflection && typeof journal.reflection === 'object') {
      reflectionObj = journal.reflection as Record<string, unknown>;
    } else if (typeof journal.reflection === 'string') {
      try {
        const parsed = JSON.parse(journal.reflection);
        if (parsed && typeof parsed === 'object') {
          reflectionObj = parsed as Record<string, unknown>;
        }
      } catch {
        // Not JSON — leave as null; subtopic will be null.
      }
    }
    const subtopic =
      typeof reflectionObj?.subtopic === 'string' ? reflectionObj.subtopic : null;

    // Format the response
    const response = {
      id: journal.id,
      content: journal.content,
      courseId: journal.course_id,
      subtopic,
      createdAt: journal.created_at,
      userEmail
    }

    return NextResponse.json(response)
  } catch (error) {
    console.error('Error fetching journal entry:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal entry details' },
      { status: 500 }
    );
  }
}