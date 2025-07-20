import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// import prisma from '@/lib/prisma'; // Removed for mock implementation

export async function POST(req: NextRequest) {
  try {
    const { subtopicId, moduleIndex, subtopicIndex, feedback, userId, courseId } = await req.json();
    
    // Validasi data
    if (!feedback) {
      return NextResponse.json(
        { error: "Feedback is required" },
        { status: 400 }
      );
    }
    
    // Mock saving of jurnal refleksi
    if (userId && courseId) {
      const validEmails = ['user@example.com', 'admin@example.com', 'test@example.com'];
      
      if (!validEmails.includes(userId)) {
        console.warn(`User with email ${userId} not found in mock data`);
      } else {
        const mockJurnal = {
          id: `feedback-${Date.now()}`,
          userId,
          courseId,
          subtopic: `Module ${moduleIndex + 1} - Subtopic ${subtopicIndex + 1}`,
          content: feedback,
          createdAt: new Date().toISOString()
        };
        
        console.log('Mock jurnal refleksi saved:', mockJurnal);
      }
    }
    
    // Kirim kembali respons ke client
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Error saving feedback:', error);
    return NextResponse.json(
      { error: error.message || "Failed to save feedback" },
      { status: 500 }
    );
  }
} 