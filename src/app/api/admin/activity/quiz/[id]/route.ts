import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';

export async function GET(
  request: NextRequest,
  context: { params: { id: string } }
) {
  try {
    const { id } = context.params;

    if (!id) {
      return NextResponse.json(
        { error: 'Quiz attempt ID is required' },
        { status: 400 }
      );
    }

    // Fetch quiz submission by ID using adminDb
    const { data: submissions, error } = await adminDb
      .from('quiz_submissions')
      .select('*')
      .eq('id', id)
      .limit(1);

    if (error) {
      console.error('Error fetching quiz submission:', error);
      return NextResponse.json(
        { error: 'Failed to fetch quiz attempt' },
        { status: 500 }
      );
    }

    if (!submissions || submissions.length === 0) {
      return NextResponse.json(
        { error: 'Quiz attempt not found' },
        { status: 404 }
      );
    }

    const attempt = submissions[0] as {
      id: string;
      answers: Array<{
        question: string;
        options: string[];
        userAnswer: string;
        isCorrect: boolean;
        questionIndex?: number;
      }>;
    };

    // Sort answers by questionIndex if available
    const sortedAnswers = Array.isArray(attempt.answers)
      ? [...attempt.answers].sort((a, b) => (a.questionIndex || 0) - (b.questionIndex || 0))
      : [];

    // Transform to the shape expected by QuizResultModal
    const result = sortedAnswers.map((ans, idx) => ({
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