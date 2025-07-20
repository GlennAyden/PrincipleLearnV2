import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// import prisma from '@/lib/prisma'; // Removed for mock implementation

interface JurnalSubmission {
  userId: string; // Email user
  courseId: string;
  subtopic: string;
  content: string;
}

export async function POST(req: NextRequest) {
  try {
    const data: JurnalSubmission = await req.json();
    
    // Validasi data
    if (!data.userId || !data.courseId || !data.subtopic || !data.content) {
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

    // Mock journal creation
    const jurnal = {
      id: `journal-${Date.now()}`,
      userId: data.userId,
      courseId: data.courseId,
      subtopic: data.subtopic,
      content: data.content,
      createdAt: new Date().toISOString()
    };
    
    console.log(`Mock journal saved:`, {
      id: jurnal.id,
      user: data.userId,
      course: data.courseId,
      subtopic: data.subtopic
    });

    return NextResponse.json({ success: true, id: jurnal.id });
  } catch (error: any) {
    console.error('Error saving jurnal refleksi:', error);
    return NextResponse.json(
      { error: error.message || "Failed to save jurnal refleksi" },
      { status: 500 }
    );
  }
} 