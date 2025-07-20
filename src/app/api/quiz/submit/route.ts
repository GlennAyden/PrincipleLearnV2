import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
// import prisma from '@/lib/prisma'; // Removed for mock implementation

interface QuizAnswer {
  question: string;
  options: string[];
  userAnswer: string;
  isCorrect: boolean;
  questionIndex: number;
}

interface QuizSubmission {
  userId: string; // Ini adalah email user
  courseId: string;
  subtopic: string;
  score: number;
  answers: QuizAnswer[];
}

export async function POST(req: NextRequest) {
  try {
    const data: QuizSubmission = await req.json();
    
    // Validasi data
    if (!data.userId || !data.courseId || !data.subtopic) {
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

    // Mock quiz attempt creation
    const quizAttempt = {
      id: `quiz-${Date.now()}`,
      userId: data.userId,
      courseId: data.courseId,
      subtopic: data.subtopic,
      score: data.score,
      answers: data.answers
    };
    
    console.log(`Mock quiz submission saved:`, {
      id: quizAttempt.id,
      user: data.userId,
      course: data.courseId,
      score: data.score
    });

    return NextResponse.json({ success: true, id: quizAttempt.id });
  } catch (error: any) {
    console.error('Error saving quiz attempt:', error);
    return NextResponse.json(
      { error: error.message || "Failed to save quiz attempt" },
      { status: 500 }
    );
  }
} 