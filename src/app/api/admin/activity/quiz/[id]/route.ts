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

    // Fetch one quiz submission row (current schema stores one row per answered question)
    const { data: submissions, error } = await adminDb
      .from('quiz_submissions')
      .select('id, quiz_id, answer, is_correct, reasoning_note')
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
      quiz_id: string;
      answer: string;
      is_correct: boolean;
      reasoning_note?: string | null;
    };

    const { data: quizzes, error: quizError } = await adminDb
      .from('quiz')
      .select('question, options')
      .eq('id', attempt.quiz_id)
      .limit(1);

    if (quizError) {
      console.error('Error fetching quiz question:', quizError);
      return NextResponse.json(
        { error: 'Failed to fetch quiz question details' },
        { status: 500 }
      );
    }

    const quiz = (quizzes && quizzes.length > 0 ? quizzes[0] : null) as
      | { question?: string; options?: string[] }
      | null;

    const result = [
      {
        no: 1,
        question: quiz?.question || '-',
        options: Array.isArray(quiz?.options) ? quiz!.options : [],
        userAnswer: attempt.answer,
        status: attempt.is_correct ? 'Benar' : 'Salah',
        reasoningNote: attempt.reasoning_note || '',
      },
    ];

    return NextResponse.json({ id, result });
  } catch (error) {
    console.error('Error fetching quiz attempt:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quiz attempt details' },
      { status: 500 }
    );
  }
}