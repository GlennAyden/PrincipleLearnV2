// src/app/api/admin/users/[id]/activity-summary/route.ts
// Admin User Activity Summary — real transcript data, all activity types

import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/database'
import { verifyToken } from '@/lib/jwt'
import { normalizeText, parseStructuredReflectionFields } from '@/lib/reflection-submission'
import { summarizeQuizAttempts } from '@/lib/admin-quiz-attempts'

// ── Row Interfaces ──
interface DiscussionSummaryRow {
  id: string
  status: string
  phase?: string
  updated_at: string
  learning_goals: unknown
  completion_reason?: string | null
  completion_summary?: unknown
}
interface JournalSummaryRow {
  id: string
  content: string
  reflection?: string
  type?: string
  subtopic_label?: string
  created_at: string
}
interface TranscriptSummaryRow { id: string; content?: string; created_at: string }
interface AskSummaryRow { id: string; question: string; created_at: string }
interface ChallengeSummaryRow { id: string; question?: string; created_at: string }
interface QuizSummaryRow {
  id: string
  user_id?: string | null
  quiz_attempt_id?: string | null
  attempt_number?: number | null
  course_id?: string | null
  subtopic_id?: string | null
  leaf_subtopic_id?: string | null
  subtopic_label?: string | null
  is_correct: boolean
  created_at: string
}
interface FeedbackSummaryRow { id: string; rating?: number; comment?: string; created_at: string }
interface ExampleSummaryRow {
  id: string
  subtopic_label?: string | null
  examples_count?: number | null
  page_number?: number | null
  created_at: string
}
interface IdRow { id: string }
interface UserRecordRow { id: string; email: string }

function parseObjectLike(value: unknown): Record<string, unknown> | null {
  if (typeof value === 'object' && value !== null) {
    return value as Record<string, unknown>
  }

  if (typeof value !== 'string' || value.trim().length === 0) {
    return null
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>
    return parsed && typeof parsed === 'object' ? parsed : null
  } catch {
    return null
  }
}

function buildRecentReflection(
  recentJournal: JournalSummaryRow | null,
  recentFeedback: FeedbackSummaryRow | null,
) {
  if (recentJournal) {
    const reflectionContext = parseObjectLike(recentJournal.reflection)
    const journalFields = parseStructuredReflectionFields({ content: recentJournal.content })
    const snippet =
      journalFields.understood ||
      journalFields.confused ||
      journalFields.strategy ||
      journalFields.promptEvolution ||
      journalFields.contentFeedback ||
      (typeof recentJournal.content === 'string' ? recentJournal.content.slice(0, 160) : '')

    const title =
      normalizeText(reflectionContext?.subtopic) ||
      normalizeText(recentJournal.subtopic_label) ||
      'Refleksi terbaru'

    return {
      id: recentJournal.id,
      title,
      snippet: snippet || null,
      rating: journalFields.contentRating,
      createdAt: recentJournal.created_at,
      source: 'jurnal' as const,
    }
  }

  if (recentFeedback) {
    return {
      id: recentFeedback.id,
      title: 'Refleksi terbaru',
      snippet: normalizeText(recentFeedback.comment) || null,
      rating: recentFeedback.rating ?? null,
      createdAt: recentFeedback.created_at,
      source: 'feedback' as const,
    }
  }

  return null
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

function countGoalsByMastery(learningGoals: unknown, completionSummary: unknown) {
  const summary = parseObjectLike(completionSummary)
  const summaryMet = Number(summary?.metCount)
  const summaryNear = Number(summary?.nearCount)
  const summaryWeak = Number(summary?.weakCount)
  const summaryPending = Number(summary?.pendingCount)
  const summaryTotal = Number(summary?.totalGoals)
  if ([summaryMet, summaryNear, summaryWeak, summaryPending, summaryTotal].some(Number.isFinite)) {
    return {
      met: Number.isFinite(summaryMet) ? summaryMet : 0,
      near: Number.isFinite(summaryNear) ? summaryNear : 0,
      weak: Number.isFinite(summaryWeak) ? summaryWeak : 0,
      pending: Number.isFinite(summaryPending) ? summaryPending : 0,
      total: Number.isFinite(summaryTotal) ? summaryTotal : 0,
    }
  }

  const goals = Array.isArray(learningGoals) ? learningGoals : []
  return goals.reduce(
    (acc, goal) => {
      const raw = parseObjectLike(goal)
      const status = typeof raw?.masteryStatus === 'string'
        ? raw.masteryStatus
        : typeof raw?.mastery_status === 'string'
          ? raw.mastery_status
          : ''
      if (status === 'met') acc.met += 1
      else if (status === 'near') acc.near += 1
      else if (status === 'weak' || status === 'unassessable') acc.weak += 1
      else acc.pending += 1
      acc.total += 1
      return acc
    },
    { met: 0, near: 0, weak: 0, pending: 0, total: 0 },
  )
}

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

    // Verify user exists and is not soft-deleted
    const { data: userRecord, error: userError } = await adminDb
      .from('users')
      .select('id, email')
      .eq('id', userId)
      .is('deleted_at', null)
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
      _recentQuizRows,
      feedbackRows,
      exampleRows,
      _courseRows,
      // Count queries
      discussionCountRows,
      journalCountRows,
      transcriptCountRows,
      askCountRows,
      challengeCountRows,
      quizCountRows,
      feedbackCountRows,
      exampleCountRows,
      courseCountRows,
    ] = await Promise.all([
      // Recent entries (limit 1, most recent)
      safeQuery<DiscussionSummaryRow[]>(
        adminDb
          .from('discussion_sessions')
          .select('id, status, phase, updated_at, learning_goals, completion_reason, completion_summary')
          .eq('user_id', userId)
          .order('updated_at', { ascending: false })
          .limit(1),
        'recent discussion',
        []
      ),
      safeQuery<JournalSummaryRow[]>(
        adminDb
          .from('jurnal')
          .select('id, content, reflection, type, subtopic_label, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent journal',
        []
      ),
      safeQuery<TranscriptSummaryRow[]>(
        adminDb
          .from('transcript')
          .select('id, content, created_at')
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
          .select('id, question, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent challenge',
        []
      ),
      safeQuery<QuizSummaryRow[]>(
        adminDb
          .from('quiz_submissions')
          .select('id, user_id, quiz_attempt_id, attempt_number, course_id, subtopic_id, leaf_subtopic_id, subtopic_label, is_correct, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent quiz',
        []
      ),
      safeQuery<FeedbackSummaryRow[]>(
        adminDb
          .from('feedback')
          .select('id, rating, comment, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent feedback',
        []
      ),
      safeQuery<ExampleSummaryRow[]>(
        adminDb
          .from('example_usage_events')
          .select('id, subtopic_label, examples_count, page_number, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false })
          .limit(1),
        'recent example usage',
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
      safeQuery<QuizSummaryRow[]>(
        adminDb
          .from('quiz_submissions')
          .select('id, user_id, quiz_attempt_id, attempt_number, course_id, subtopic_id, leaf_subtopic_id, subtopic_label, is_correct, created_at')
          .eq('user_id', userId)
          .order('created_at', { ascending: false }),
        'quiz attempt count',
        []
      ),
      safeQuery<IdRow[]>(
        adminDb.from('feedback').select('id').eq('user_id', userId),
        'feedback count',
        []
      ),
      safeQuery<IdRow[]>(
        adminDb.from('example_usage_events').select('id').eq('user_id', userId),
        'example usage count',
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
    const quizAttemptSummaries = summarizeQuizAttempts(quizCountRows, userId)
    const recentQuiz = quizAttemptSummaries[0] ?? null
    const recentFeedback = feedbackRows[0] ?? null
    const recentExample = exampleRows[0] ?? null
    const recentReflection = buildRecentReflection(recentJournal, recentFeedback)
    const reflectionCount = Math.max(journalCountRows.length, feedbackCountRows.length)
    const discussionQuality = recentDiscussion
      ? countGoalsByMastery(recentDiscussion.learning_goals, recentDiscussion.completion_summary)
      : null

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
            completionReason: recentDiscussion.completion_reason ?? null,
            quality: discussionQuality,
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

      recentReflection,

      recentTranscript: recentTranscript
        ? {
            id: recentTranscript.id,
            title: recentTranscript.content ? (typeof recentTranscript.content === 'string' ? recentTranscript.content.slice(0, 80) : 'Untitled') : 'Untitled',
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
            question: recentChallenge.question ? (typeof recentChallenge.question === 'string' ? recentChallenge.question.slice(0, 200) : null) : null,
            createdAt: recentChallenge.created_at,
          }
        : null,

      recentQuiz: recentQuiz
        ? {
            id: recentQuiz.representativeId,
            quizAttemptId: recentQuiz.quizAttemptId,
            isCorrect: recentQuiz.isCorrect,
            correctAnswers: recentQuiz.correctAnswerCount,
            answerRows: recentQuiz.answerRowCount,
            score: recentQuiz.score,
            createdAt: recentQuiz.createdAt ?? '',
          }
        : null,

      recentFeedback: recentFeedback
        ? {
            id: recentFeedback.id,
            rating: recentFeedback.rating ?? null,
            createdAt: recentFeedback.created_at,
          }
        : null,

      recentExampleUsage: recentExample
        ? {
            id: recentExample.id,
            topic: recentExample.subtopic_label ?? 'Beri Contoh',
            examplesCount: recentExample.examples_count ?? 0,
            pageNumber: recentExample.page_number ?? 0,
            createdAt: recentExample.created_at,
          }
        : null,

      totals: {
        discussions: discussionCountRows.length,
        reflections: reflectionCount,
        journals: journalCountRows.length,
        transcripts: transcriptCountRows.length,
        askQuestions: askCountRows.length,
        challenges: challengeCountRows.length,
        quizzes: quizAttemptSummaries.length,
        quizAttempts: quizAttemptSummaries.length,
        quizAnswerRows: quizCountRows.length,
        feedbacks: feedbackCountRows.length,
        examples: exampleCountRows.length,
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
