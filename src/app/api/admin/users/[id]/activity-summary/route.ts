// src/app/api/admin/users/[id]/activity-summary/route.ts
// Admin User Activity Summary — real transcript data, all activity types

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { verifyToken } from '@/lib/jwt'

// ── Row Interfaces ──
interface DiscussionSummaryRow { id: string; status: string; phase?: string; updated_at: string; learning_goals: unknown }
interface JournalSummaryRow { id: string; content: string; reflection?: string; created_at: string }
interface TranscriptSummaryRow { id: string; title?: string; created_at: string }
interface AskSummaryRow { id: string; question: string; created_at: string }
interface ChallengeSummaryRow { id: string; challenge_type?: string; created_at: string }
interface QuizSummaryRow { id: string; is_correct: boolean; submitted_at?: string; created_at: string }
interface FeedbackSummaryRow { id: string; rating?: number; created_at: string }
interface IdRow { id: string }
interface UserRecordRow { id: string; email: string }

// ─── Auth ─────────────────────────────────────────────────────────────────────

function unauthorized(message = 'Unauthorized access') {
  return NextResponse.json({ error: message }, { status: 401 })
}

// ─── Safe query helper ────────────────────────────────────────────────────────

async function safeQuery<T>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Supabase query builder returns complex generic types
  query: any,
  label: string,
  fallback: T
): Promise<T> {
  try {
    const { data, error } = await query
    if (error) {
      // Ignore missing table errors for optional tables
      if (error.code === 'PGRST205' || error.code === '42P01') {
        console.log(`[Admin Activity Summary] Table for "${label}" does not exist, using fallback`)
        return fallback
      }
      console.error(`[Admin Activity Summary] ${label} query failed:`, error.message)
      return fallback
    }
    return (data ?? fallback) as T
  } catch (err) {
    console.error(`[Admin Activity Summary] ${label} query threw:`, err)
    return fallback
  }
}

// ─── GET Handler ──────────────────────────────────────────────────────────────

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // Auth guard
    const token =
      request.cookies.get('access_token')?.value
    const payload = token ? verifyToken(token) : null
    if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') {
      return unauthorized()
    }

    const { id: userId } = await context.params
    if (!userId) {
      return NextResponse.json({ error: 'User ID is required' }, { status: 400 })
    }

    // Verify user exists
    const { data: userRecord, error: userError } = await adminDb
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .maybeSingle()

    if (userError || !userRecord) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    // ── Parallel queries for all activity types ───────────────────────────
    const [
      discussionRows,
      journalRows,
      transcriptRows,
      askQuestionRows,
      challengeRows,
      quizRows,
      feedbackRows,
      _courseRows,
      // Count queries
      discussionCountRows,
      journalCountRows,
      transcriptCountRows,
      askCountRows,
      challengeCountRows,
      quizCountRows,
      feedbackCountRows,
      courseCountRows,
    ] = await Promise.all([
      // Recent entries (limit 1, most recent)
      safeQuery<DiscussionSummaryRow[]>(
        adminDb
          .from('discussion_sessions')
          .select('id, status, phase, updated_at, learning_goals')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1),
        'recent discussion',
        []
      ),
      safeQuery<JournalSummaryRow[]>(
        adminDb
          .from('jurnal')
          .select('id, content, reflection, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent journal',
        []
      ),
      safeQuery<TranscriptSummaryRow[]>(
        adminDb
          .from('transcript')
          .select('id, title, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent transcript',
        []
      ),
      safeQuery<AskSummaryRow[]>(
        adminDb
          .from('ask_question_history')
          .select('id, question, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent ask question',
        []
      ),
      safeQuery<ChallengeSummaryRow[]>(
        adminDb
          .from('challenge_responses')
          .select('id, challenge_type, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent challenge',
        []
      ),
      safeQuery<QuizSummaryRow[]>(
        adminDb
          .from('quiz_submissions')
          .select('id, is_correct, submitted_at, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent quiz',
        []
      ),
      safeQuery<FeedbackSummaryRow[]>(
        adminDb
          .from('feedback')
          .select('id, rating, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent feedback',
        []
      ),
      safeQuery<IdRow[]>(
        adminDb
          .from('courses')
          .select('id')
          .eq('created_by', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent course',
        []
      ),
      // Count queries
      safeQuery<IdRow[]>(
        adminDb.from('discussion_sessions').select('id').eq('user_id', userId),
        'discussion count',
        []
      ),
      safeQuery<IdRow[]>(
        adminDb.from('jurnal').select('id').eq('user_id', userId),
        'journal count',
        []
      ),
      safeQuery<IdRow[]>(
        adminDb.from('transcript').select('id').eq('user_id', userId),
        'transcript count',
        []
      ),
      safeQuery<IdRow[]>(
        adminDb.from('ask_question_history').select('id').eq('user_id', userId),
        'ask question count',
        []
      ),
      safeQuery<IdRow[]>(
        adminDb.from('challenge_responses').select('id').eq('user_id', userId),
        'challenge count',
        []
      ),
      safeQuery<IdRow[]>(
        adminDb.from('quiz_submissions').select('id').eq('user_id', userId),
        'quiz count',
        []
      ),
      safeQuery<IdRow[]>(
        adminDb.from('feedback').select('id').eq('user_id', userId),
        'feedback count',
        []
      ),
      safeQuery<IdRow[]>(
        adminDb.from('courses').select('id').eq('created_by', userId),
        'course count',
        []
      ),
    ])

    // ── Build response ────────────────────────────────────────────────────
    const recentDiscussion = discussionRows[0] ?? null
    const recentJournal = journalRows[0] ?? null
    const recentTranscript = transcriptRows[0] ?? null
    const recentAsk = askQuestionRows[0] ?? null
    const recentChallenge = challengeRows[0] ?? null
    const recentQuiz = quizRows[0] ?? null
    const recentFeedback = feedbackRows[0] ?? null

    const typedUser = userRecord as unknown as UserRecordRow;
    const response = {
      userId: typedUser.id,
      email: typedUser.email,

      recentDiscussion: recentDiscussion
        ? {
            sessionId: recentDiscussion.id,
            status: recentDiscussion.status,
            phase: recentDiscussion.phase ?? null,
            updatedAt: recentDiscussion.updated_at,
            goalCount: Array.isArray(recentDiscussion.learning_goals)
              ? recentDiscussion.learning_goals.length
              : 0,
          }
        : null,

      recentJournal: recentJournal
        ? {
            id: recentJournal.id,
            title:
              typeof recentJournal.reflection === 'string'
                ? recentJournal.reflection.replace(/^Subtopic:\s*/i, '')
                : null,
            snippet:
              typeof recentJournal.content === 'string'
                ? recentJournal.content.slice(0, 160)
                : null,
            createdAt: recentJournal.created_at,
          }
        : null,

      recentTranscript: recentTranscript
        ? {
            id: recentTranscript.id,
            title: recentTranscript.title ?? 'Untitled',
            createdAt: recentTranscript.created_at,
          }
        : null,

      recentAskQuestion: recentAsk
        ? {
            id: recentAsk.id,
            question:
              typeof recentAsk.question === 'string'
                ? recentAsk.question.slice(0, 200)
                : '',
            createdAt: recentAsk.created_at,
          }
        : null,

      recentChallenge: recentChallenge
        ? {
            id: recentChallenge.id,
            challengeType: recentChallenge.challenge_type ?? null,
            createdAt: recentChallenge.created_at,
          }
        : null,

      recentQuiz: recentQuiz
        ? {
            id: recentQuiz.id,
            isCorrect: recentQuiz.is_correct ?? false,
            createdAt: recentQuiz.submitted_at ?? recentQuiz.created_at,
          }
        : null,

      recentFeedback: recentFeedback
        ? {
            id: recentFeedback.id,
            rating: recentFeedback.rating ?? null,
            createdAt: recentFeedback.created_at,
          }
        : null,

      totals: {
        discussions: discussionCountRows.length,
        journals: journalCountRows.length,
        transcripts: transcriptCountRows.length,
        askQuestions: askCountRows.length,
        challenges: challengeCountRows.length,
        quizzes: quizCountRows.length,
        feedbacks: feedbackCountRows.length,
        courses: courseCountRows.length,
      },
    }

    return NextResponse.json(response, { status: 200 })
  } catch (error) {
    console.error('[Admin Activity Summary] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Failed to load activity data' },
      { status: 500 }
    )
  }
}
