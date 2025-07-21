import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { DatabaseService } from '@/lib/database';

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

    // Find quiz questions in database to get proper quiz IDs
    const quizQuestions = await DatabaseService.getRecords('quiz', {
      filter: { course_id: data.courseId },
      orderBy: 'created_at'
    });

    if (quizQuestions.length === 0) {
      return NextResponse.json(
        { error: "Quiz questions not found in database. Please regenerate the subtopic content." },
        { status: 404 }
      );
    }

    // Save each quiz answer to database with proper quiz_id
    const submissionIds = [];
    for (let i = 0; i < data.answers.length; i++) {
      const answer = data.answers[i];
      
      // Find matching quiz question by question text or index
      let matchingQuiz = quizQuestions.find(q => q.question === answer.question);
      
      // If not found by question text, try by index
      if (!matchingQuiz && i < quizQuestions.length) {
        matchingQuiz = quizQuestions[i];
      }
      
      if (matchingQuiz) {
        const submissionData = {
          user_id: user.id,
          quiz_id: matchingQuiz.id, // Use actual quiz question ID
          answer: answer.userAnswer,
          is_correct: answer.isCorrect
        };

        const submission = await DatabaseService.insertRecord('quiz_submissions', submissionData);
        submissionIds.push(submission.id);
        console.log(`Saved submission for quiz ${matchingQuiz.id}:`, answer.question.substring(0, 50) + '...');
      } else {
        console.warn(`No matching quiz found for answer ${i}:`, answer.question.substring(0, 50) + '...');
      }
    }
    
    console.log(`Quiz submission saved to database:`, {
      user: data.userId,
      course: data.courseId,
      score: data.score,
      submissionCount: submissionIds.length
    });

    return NextResponse.json({ 
      success: true, 
      submissionIds,
      message: `Saved ${submissionIds.length} quiz answers to database`
    });
  } catch (error: any) {
    console.error('Error saving quiz attempt:', error);
    return NextResponse.json(
      { error: error.message || "Failed to save quiz attempt" },
      { status: 500 }
    );
  }
} 