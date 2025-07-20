import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// import prisma from '@/lib/prisma'; // Removed for mock implementation

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

    // Mock user lookup
    const validEmails = ['user@example.com', 'admin@example.com', 'test@example.com'];

    if (!validEmails.includes(data.userId)) {
      return NextResponse.json(
        { error: "User not found" },
        { status: 404 }
      );
    }

    // Mock transcript creation
    const transcript = {
      id: `transcript-${Date.now()}`,
      userId: data.userId,
      courseId: data.courseId,
      subtopic: data.subtopic,
      question: data.question,
      answer: data.answer,
      createdAt: new Date().toISOString()
    };
    
    console.log(`Mock transcript saved:`, {
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