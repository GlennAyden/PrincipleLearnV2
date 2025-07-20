import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(
  request: NextRequest,
  context: { params: any }
) {
  try {
    const { id } = context.params;

    // Fetch quiz attempt with detailed answers
    const attempt = await prisma.quizAttempt.findUnique({
      where: { id },
      include: {
        answers: {
          orderBy: { questionIndex: 'asc' },
        },
      },
    });

    if (!attempt) {
      return NextResponse.json(
        { error: 'Quiz attempt not found' },
        { status: 404 }
      );
    }

    // Transform to the shape expected by QuizResultModal
    const result = attempt.answers.map((ans, idx) => ({
      no: idx + 1,
      question: ans.question,
      options: ans.options,
      userAnswer: ans.userAnswer,
      status: ans.isCorrect ? 'Benar' : 'Salah',
    }));

    return NextResponse.json({ id, result });
  } catch (error) {
    console.error('Error fetching quiz attempt:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quiz attempt details' },
      { status: 500 }
    );
  }
} 