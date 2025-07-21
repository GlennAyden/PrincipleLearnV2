import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService } from '@/lib/database';

interface TranscriptSubmission {
  userId: string; // Email user
  courseId: string;
  subtopic: string;
  question: string;
  answer: string;
}

export async function POST(req: NextRequest) {
  try {
    const data: TranscriptSubmission = await req.json();
    
    // Validasi data
    if (!data.userId || !data.courseId || !data.subtopic || !data.question || !data.answer) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Find user in database
    const users = await DatabaseService.getRecords('users', {
      filter: { email: data.userId },
      limit: 1
    });

    if (users.length === 0) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    const user = users[0];

    // Find course in database
    const courses = await DatabaseService.getRecords('courses', {
      filter: { id: data.courseId },
      limit: 1
    });

    if (courses.length === 0) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
      );
    }

    // Save transcript to database
    const transcriptData = {
      user_id: user.id,
      course_id: data.courseId,
      content: `Q: ${data.question}\n\nA: ${data.answer}`,
      notes: `Subtopic: ${data.subtopic}`
    };

    const transcript = await DatabaseService.insertRecord('transcript', transcriptData);
    
    console.log(`Transcript saved to database:`, {
      id: transcript.id,
      user: data.userId,
      course: data.courseId,
      subtopic: data.subtopic
    });

    return NextResponse.json({ success: true, id: transcript.id });
  } catch (error: any) {
    console.error('Error saving transcript:', error);
    return NextResponse.json(
      { error: error.message || "Failed to save transcript" },
      { status: 500 }
    );
  }
} 