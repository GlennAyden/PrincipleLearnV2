import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { withProtection } from '@/lib/api-middleware'

type SubmissionRow = {
  id: string
  quiz_id: string
  quiz_attempt_id?: string | null
  answer: string
  is_correct: boolean
  reasoning_note?: string | null
}

type QuizRow = {
  question?: string
  options?: string[]
}

async function fetchQuizzesBySubmissionIds(submissions: SubmissionRow[]) {
  const result = new Map<string, QuizRow | null>()

  await Promise.all(
    submissions.map(async (submission) => {
      const { data: quizzes, error } = await adminDb
        .from('quiz')
        .select('question, options')
        .eq('id', submission.quiz_id)
        .limit(1)

      if (error) {
        console.error('Error fetching quiz question:', error)
        result.set(submission.id, null)
        return
      }

      result.set(
        submission.id,
        (quizzes && quizzes.length > 0 ? quizzes[0] : null) as QuizRow | null
      )
    })
  )

  return result
}

async function handler(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await context.params

    if (!id) {
      return NextResponse.json(
        { error: 'Quiz attempt ID is required' },
        { status: 400 }
      )
    }

    const queryByAttemptId = async (attemptId: string) =>
      adminDb
        .from('quiz_submissions')
        .select('id, quiz_id, quiz_attempt_id, answer, is_correct, reasoning_note')
        .eq('quiz_attempt_id', attemptId)
        .order('created_at', { ascending: true })

    const queryBySubmissionId = async (submissionId: string) =>
      adminDb
        .from('quiz_submissions')
        .select('id, quiz_id, quiz_attempt_id, answer, is_correct, reasoning_note')
        .eq('id', submissionId)
        .order('created_at', { ascending: true })

    let submissions: SubmissionRow[] = []

    const attemptResult = await queryByAttemptId(id)
    if (attemptResult.error) {
      console.error('Error fetching quiz submissions by attempt id:', attemptResult.error)
      return NextResponse.json(
        { error: 'Failed to fetch quiz attempt' },
        { status: 500 }
      )
    }

    if (attemptResult.data && attemptResult.data.length > 0) {
      submissions = attemptResult.data as SubmissionRow[]
    } else {
      const submissionResult = await queryBySubmissionId(id)
      if (submissionResult.error) {
        console.error('Error fetching quiz submission:', submissionResult.error)
        return NextResponse.json(
          { error: 'Failed to fetch quiz attempt' },
          { status: 500 }
        )
      }
      submissions = (submissionResult.data ?? []) as SubmissionRow[]
    }

    if (submissions.length === 0) {
      return NextResponse.json(
        { error: 'Quiz attempt not found' },
        { status: 404 }
      )
    }

    const quizzesBySubmissionId = await fetchQuizzesBySubmissionIds(submissions)
    const quizAttemptId = submissions[0]?.quiz_attempt_id ?? id
    const result = submissions.map((attempt, index) => {
      const quiz = quizzesBySubmissionId.get(attempt.id) ?? null
      return {
        no: index + 1,
        submissionId: attempt.id,
        quizAttemptId,
        question: quiz?.question || '-',
        options: Array.isArray(quiz?.options) ? quiz?.options : [],
        userAnswer: attempt.answer,
        status: attempt.is_correct ? 'Benar' : 'Salah',
        reasoningNote: attempt.reasoning_note || '',
      }
    })

    return NextResponse.json({
      id,
      quizAttemptId,
      result,
      totalQuestions: result.length,
      correctCount: result.filter((item) => item.status === 'Benar').length,
    })
  } catch (error) {
    console.error('Error fetching quiz attempt:', error)
    return NextResponse.json(
      { error: 'Failed to fetch quiz attempt details' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  return withProtection((req) => handler(req, context), { adminOnly: true, requireAuth: true, csrfProtection: false })(request)
}
