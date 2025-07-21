import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService } from '@/lib/database';

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

    // Save journal to database
    const jurnalData = {
      user_id: user.id,
      course_id: data.courseId,
      content: data.content,
      reflection: `Subtopic: ${data.subtopic}` // Store subtopic in reflection field
    };

    const jurnal = await DatabaseService.insertRecord('jurnal', jurnalData);
    
    console.log(`Journal saved to database:`, {
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