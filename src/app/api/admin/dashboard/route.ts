// src/app/api/admin/dashboard/route.ts
// Redesigned dashboard API — auth guard, parallel queries, research integration, time filtering
// Optimized: DB-level filtering, limit safety nets, Map preprocessing, active student calculation

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { adminDb } from '@/lib/database'
import { withCacheHeaders } from '@/lib/api-middleware'
import jwt from 'jsonwebtoken'
import type { TimeRange, ActivityItem, DashboardAPIResponse, CTBreakdown, CThBreakdown } from '@/types/dashboard'

const JWT_SECRET = process.env.JWT_SECRET!

// ── Row Interfaces for DB Queries ────────────────────────────────────────────

interface UserRow { id: string; email: string; role: string; created_at: string }
interface CourseRow { id: string; title: string; created_at: string; created_by: string }
interface QuizSubmissionRow { id: string; user_id: string; is_correct: boolean; reasoning_note: string; created_at: string }
interface DiscussionRow { id: string; user_id: string; status: string; learning_goals: unknown; created_at: string }
interface JournalRow { id: string; user_id: string; type: string; content: string; created_at: string }
interface ChallengeRow { id: string; user_id: string; question: string; created_at: string }
interface AskHistoryRow { id: string; user_id: string; question: string; prompt_components: unknown; prompt_version: string; session_number: number; created_at: string }
interface FeedbackRow { id: string; user_id: string; rating: number; comment: string; created_at: string }
interface TranscriptRow { id: string; user_id: string; created_at: string }
interface LearningProfileRow { id: string; user_id: string; created_at: string }
interface PromptClassificationRow { id: string; user_id: string; prompt_stage: string; prompt_stage_score: number; micro_markers: unknown; primary_marker: string; created_at: string }
interface CognitiveIndicatorRow {
  id: string; user_id: string; ct_total_score: number; cth_total_score: number;
  ct_decomposition: number; ct_pattern_recognition: number; ct_abstraction: number;
  ct_algorithm_design: number; ct_evaluation_debugging: number; ct_generalization: number;
  cth_interpretation: number; cth_analysis: number; cth_evaluation: number;
  cth_inference: number; cth_explanation: number; cth_self_regulation: number;
  cognitive_depth_level: string; created_at: string
}

interface CognitiveAccumulator {
  ct_total: number; cth_total: number;
  ct_decomposition: number; ct_pattern_recognition: number; ct_abstraction: number;
  ct_algorithm_design: number; ct_evaluation_debugging: number; ct_generalization: number;
  cth_interpretation: number; cth_analysis: number; cth_evaluation: number;
  cth_inference: number; cth_explanation: number; cth_self_regulation: number;
}

interface LearningGoal { id?: string; covered?: boolean; description?: string }

// ── Auth Helper ──────────────────────────────────────────────────────────────

function verifyAdminFromCookie(request: NextRequest): { userId: string; email: string; role: string } | null {
  const token = request.cookies.get('access_token')?.value
  if (!token) return null

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string; email: string; role: string }
    if (payload.role?.toLowerCase() !== 'admin') return null
    return payload
  } catch {
    return null
  }
}

// ── Time Range Helper ────────────────────────────────────────────────────────

function getDateSince(range: TimeRange): Date | null {
  if (range === 'all') return null
  const now = new Date()
  const days = range === '7d' ? 7 : range === '30d' ? 30 : 90
  now.setDate(now.getDate() - days)
  return now
}

// ── Safe Table Query (handles missing tables gracefully) ─────────────────────
// Enhanced with optional date filtering, limit, and ordering at database level

async function safeQuery<T = Record<string, unknown>>(
  tableName: string,
  selectFields: string = '*',
  filters?: Record<string, string | number | boolean | null>,
  options?: { dateSince?: Date | null; limit?: number; orderBy?: { column: string; ascending: boolean } }
): Promise<T[]> {
  try {
    let query = adminDb.from(tableName).select(selectFields)

    // Apply equality filters
    if (filters) {
      for (const [key, value] of Object.entries(filters)) {
        query = query.eq(key, value)
      }
    }

    // Apply date filter at database level (instead of in-memory)
    if (options?.dateSince) {
      query = query.gte('created_at', options.dateSince.toISOString())
    }

    // Apply ordering
    if (options?.orderBy) {
      query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending })
    }

    // Apply limit safety net
    if (options?.limit) {
      query = query.limit(options.limit)
    }

    const { data, error } = await query
    if (error) {
      // Table might not exist yet — return empty
      console.warn(`[Dashboard] Query ${tableName} failed:`, error.message || error)
      return []
    }
    return Array.isArray(data) ? data : []
  } catch (err) {
    console.warn(`[Dashboard] Query ${tableName} exception:`, err)
    return []
  }
}

// ── Helper: Build user-indexed Map from array ────────────────────────────────

function buildUserMap<T extends { user_id?: string; created_by?: string }>(
  items: T[],
  userIdField: 'user_id' | 'created_by' = 'user_id'
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const uid = item[userIdField]
    if (!uid) continue
    if (!map.has(uid)) map.set(uid, [])
    map.get(uid)!.push(item)
  }
  return map
}

// ── Heuristic Prompt Stage Classification (fallback) ─────────────────────────

function classifyPromptStageHeuristic(promptComponents: unknown): string {
  if (!promptComponents) return 'SCP'
  const comps = typeof promptComponents === 'string'
    ? (() => { try { return JSON.parse(promptComponents) } catch { return {} } })()
    : promptComponents

  let count = 0
  if (comps?.tujuan) count++
  if (comps?.konteks) count++
  if (comps?.batasan) count++

  if (count >= 3) return 'Reflektif'
  if (count >= 2) return 'MQP'
  if (count >= 1) return 'SRP'
  return 'SCP'
}

// ── Main GET Handler ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    // ── Auth Guard ──
    const admin = verifyAdminFromCookie(request)
    if (!admin) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // ── Parse time range ──
    const { searchParams } = new URL(request.url)
    const timeRange = (searchParams.get('range') || 'all') as TimeRange
    const dateSince = getDateSince(timeRange)

    // ── Parallel Data Fetching with DB-level filtering ──────────────────────
    // NOTE: 'courses' table uses 'created_by' not 'user_id'
    const queryOpts = { dateSince, limit: 5000 }

    const [
      users,
      courses,
      quizSubmissions,
      discussions,
      journals,
      challenges,
      askHistory,
      feedbacks,
      transcripts,
      learningProfiles,
      // Research tables (may not exist yet)
      promptClassifications,
      cognitiveIndicators,
    ] = await Promise.all([
      // Users: always fetch ALL (not time-filtered) for user lookup
      safeQuery<UserRow>('users', 'id, email, role, created_at', { role: 'user' }, { limit: 5000 }),
      // FIX: removed non-existent 'user_id' column — courses use 'created_by'
      safeQuery<CourseRow>('courses', 'id, title, created_at, created_by', {}, queryOpts),
      safeQuery<QuizSubmissionRow>('quiz_submissions', 'id, user_id, is_correct, reasoning_note, created_at', {}, queryOpts),
      safeQuery<DiscussionRow>('discussion_sessions', 'id, user_id, status, learning_goals, created_at', {}, queryOpts),
      safeQuery<JournalRow>('jurnal', 'id, user_id, type, content, created_at', {}, queryOpts),
      safeQuery<ChallengeRow>('challenge_responses', 'id, user_id, question, created_at', {}, queryOpts),
      safeQuery<AskHistoryRow>('ask_question_history', 'id, user_id, question, prompt_components, prompt_version, session_number, created_at', {}, queryOpts),
      safeQuery<FeedbackRow>('feedback', 'id, user_id, rating, comment, created_at', {}, queryOpts),
      safeQuery<TranscriptRow>('transcript', 'id, user_id, created_at', {}, queryOpts),
      safeQuery<LearningProfileRow>('learning_profiles', 'id, user_id, created_at', {}, queryOpts),
      // Research tables — graceful fallback if not created
      safeQuery<PromptClassificationRow>('prompt_classifications', 'id, user_id, prompt_stage, prompt_stage_score, micro_markers, primary_marker, created_at', {}, queryOpts),
      safeQuery<CognitiveIndicatorRow>('cognitive_indicators', 'id, user_id, ct_total_score, cth_total_score, ct_decomposition, ct_pattern_recognition, ct_abstraction, ct_algorithm_design, ct_evaluation_debugging, ct_generalization, cth_interpretation, cth_analysis, cth_evaluation, cth_inference, cth_explanation, cth_self_regulation, cognitive_depth_level, created_at', {}, queryOpts),
    ])

    // Data is already time-filtered at DB level, no need for in-memory filterByTime
    // References below use the fetched arrays directly

    // ── Pre-build User Maps for O(1) lookups (instead of O(n×m) filtering) ──
    const coursesByUser = buildUserMap(courses, 'created_by')
    const quizByUser = buildUserMap(quizSubmissions)
    const discussionsByUser = buildUserMap(discussions)
    const journalsByUser = buildUserMap(journals)
    const challengesByUser = buildUserMap(challenges)
    const askByUser = buildUserMap(askHistory)
    const transcriptsByUser = buildUserMap(transcripts)

    // ── 1. KPI Calculations ─────────────────────────────────────────────────

    // FIX: activeStudents — count users who actually have activity in the period
    // If 'all' time range, count all users; otherwise count users with at least 1 activity
    let activeStudents: number
    if (!dateSince) {
      activeStudents = users.length
    } else {
      const activeUserIds = new Set<string>()
      courses.forEach(c => { if (c.created_by) activeUserIds.add(c.created_by) })
      quizSubmissions.forEach(q => { if (q.user_id) activeUserIds.add(q.user_id) })
      discussions.forEach(d => { if (d.user_id) activeUserIds.add(d.user_id) })
      journals.forEach(j => { if (j.user_id) activeUserIds.add(j.user_id) })
      challenges.forEach(c => { if (c.user_id) activeUserIds.add(c.user_id) })
      askHistory.forEach(a => { if (a.user_id) activeUserIds.add(a.user_id) })
      feedbacks.forEach(f => { if (f.user_id) activeUserIds.add(f.user_id) })
      transcripts.forEach(t => { if (t.user_id) activeUserIds.add(t.user_id) })
      activeStudents = activeUserIds.size
    }

    const totalQuizzes = quizSubmissions.length
    const correctQuizzes = quizSubmissions.filter(q => q.is_correct === true).length
    const quizAccuracy = totalQuizzes > 0 ? Math.round((correctQuizzes / totalQuizzes) * 100) : 0

    const totalDiscussions = discussions.length
    const completedDiscussions = discussions.filter(d => d.status === 'completed').length

    const totalFeedbacks = feedbacks.length
    const ratedFeedbacks = feedbacks.filter(f => f.rating)
    const avgRating = ratedFeedbacks.length > 0
      ? Math.round((ratedFeedbacks.reduce((sum: number, f) => sum + (f.rating || 0), 0) / ratedFeedbacks.length) * 10) / 10
      : 0

    // CT Coverage Rate from discussions
    let totalGoals = 0
    let coveredGoals = 0
    discussions.forEach(d => {
      const goals = typeof d.learning_goals === 'string'
        ? (() => { try { return JSON.parse(d.learning_goals as string) } catch { return [] } })()
        : (d.learning_goals || [])
      if (Array.isArray(goals)) {
        totalGoals += goals.length
        coveredGoals += goals.filter((g: LearningGoal) => g.covered).length
      }
    })
    const ctCoverageRate = totalGoals > 0 ? Math.round((coveredGoals / totalGoals) * 100) : 0

    const totalLearningProfiles = learningProfiles.length
    const onboardingCompletionRate = users.length > 0
      ? Math.round((totalLearningProfiles / users.length) * 100)
      : 0

    const kpi = {
      activeStudents,
      totalCourses: courses.length,
      quizAccuracy,
      totalDiscussions,
      completedDiscussions,
      totalJournals: journals.length,
      totalChallenges: challenges.length,
      totalAskQuestions: askHistory.length,
      totalFeedbacks,
      avgRating,
      ctCoverageRate,
      totalTranscripts: transcripts.length,
      totalLearningProfiles,
      onboardingCompletionRate,
    }

    // ── 2. RM2 — Prompt Stage Distribution ──────────────────────────────────
    const hasResearchRM2 = promptClassifications.length > 0
    let stageDistribution: Record<string, number> = { SCP: 0, SRP: 0, MQP: 0, Reflektif: 0 }
    let totalPrompts = 0
    let avgStageScore = 0
    let microMarkerDistribution: Record<string, number> | undefined = undefined

    if (hasResearchRM2) {
      // Use research data from prompt_classifications table (already time-filtered)
      totalPrompts = promptClassifications.length

      const researchStages: Record<string, number> = { SCP: 0, SRP: 0, MQP: 0, REFLECTIVE: 0 }
      let totalScore = 0
      const markerDist: Record<string, number> = { GCP: 0, PP: 0, ARP: 0 }

      promptClassifications.forEach(pc => {
        const stage = pc.prompt_stage || 'SCP'
        if (stage in researchStages) researchStages[stage]++
        totalScore += pc.prompt_stage_score || 1

        // Micro markers
        if (pc.primary_marker) {
          markerDist[pc.primary_marker] = (markerDist[pc.primary_marker] || 0) + 1
        }
      })

      // Map REFLECTIVE → Reflektif for frontend consistency
      stageDistribution = {
        SCP: researchStages.SCP,
        SRP: researchStages.SRP,
        MQP: researchStages.MQP,
        Reflektif: researchStages.REFLECTIVE,
      }
      avgStageScore = totalPrompts > 0 ? Math.round((totalScore / totalPrompts) * 100) / 100 : 0
      microMarkerDistribution = markerDist
    } else {
      // Fallback: Heuristic classification from ask_question_history (already time-filtered)
      totalPrompts = askHistory.length
      let totalScore = 0

      askHistory.forEach(a => {
        const stage = classifyPromptStageHeuristic(a.prompt_components)
        stageDistribution[stage] = (stageDistribution[stage] || 0) + 1
        const scoreMap: Record<string, number> = { SCP: 1, SRP: 2, MQP: 3, Reflektif: 4 }
        totalScore += scoreMap[stage] || 1
      })

      avgStageScore = totalPrompts > 0 ? Math.round((totalScore / totalPrompts) * 100) / 100 : 0
    }

    const rm2 = {
      stages: stageDistribution,
      totalPrompts,
      hasResearchData: hasResearchRM2,
      avgStageScore,
      microMarkerDistribution,
    }

    // ── 3. RM3 — Cognitive Indicators ───────────────────────────────────────
    const hasResearchRM3 = cognitiveIndicators.length > 0

    let avgCTScore: number | undefined = undefined
    let avgCThScore: number | undefined = undefined
    let ctBreakdown: CTBreakdown | undefined = undefined
    let cthBreakdown: CThBreakdown | undefined = undefined

    if (hasResearchRM3) {
      // Already time-filtered at DB level
      const ciCount = cognitiveIndicators.length

      if (ciCount > 0) {
        const sumCI = cognitiveIndicators.reduce((acc: CognitiveAccumulator, ci) => ({
          ct_total: acc.ct_total + (ci.ct_total_score || 0),
          cth_total: acc.cth_total + (ci.cth_total_score || 0),
          ct_decomposition: acc.ct_decomposition + (ci.ct_decomposition || 0),
          ct_pattern_recognition: acc.ct_pattern_recognition + (ci.ct_pattern_recognition || 0),
          ct_abstraction: acc.ct_abstraction + (ci.ct_abstraction || 0),
          ct_algorithm_design: acc.ct_algorithm_design + (ci.ct_algorithm_design || 0),
          ct_evaluation_debugging: acc.ct_evaluation_debugging + (ci.ct_evaluation_debugging || 0),
          ct_generalization: acc.ct_generalization + (ci.ct_generalization || 0),
          cth_interpretation: acc.cth_interpretation + (ci.cth_interpretation || 0),
          cth_analysis: acc.cth_analysis + (ci.cth_analysis || 0),
          cth_evaluation: acc.cth_evaluation + (ci.cth_evaluation || 0),
          cth_inference: acc.cth_inference + (ci.cth_inference || 0),
          cth_explanation: acc.cth_explanation + (ci.cth_explanation || 0),
          cth_self_regulation: acc.cth_self_regulation + (ci.cth_self_regulation || 0),
        }), {
          ct_total: 0, cth_total: 0,
          ct_decomposition: 0, ct_pattern_recognition: 0, ct_abstraction: 0,
          ct_algorithm_design: 0, ct_evaluation_debugging: 0, ct_generalization: 0,
          cth_interpretation: 0, cth_analysis: 0, cth_evaluation: 0,
          cth_inference: 0, cth_explanation: 0, cth_self_regulation: 0,
        })

        const round2 = (v: number) => Math.round(v * 100) / 100
        avgCTScore = round2(sumCI.ct_total / ciCount)
        avgCThScore = round2(sumCI.cth_total / ciCount)

        ctBreakdown = {
          decomposition: round2(sumCI.ct_decomposition / ciCount),
          pattern_recognition: round2(sumCI.ct_pattern_recognition / ciCount),
          abstraction: round2(sumCI.ct_abstraction / ciCount),
          algorithm_design: round2(sumCI.ct_algorithm_design / ciCount),
          evaluation_debugging: round2(sumCI.ct_evaluation_debugging / ciCount),
          generalization: round2(sumCI.ct_generalization / ciCount),
        }

        cthBreakdown = {
          interpretation: round2(sumCI.cth_interpretation / ciCount),
          analysis: round2(sumCI.cth_analysis / ciCount),
          evaluation: round2(sumCI.cth_evaluation / ciCount),
          inference: round2(sumCI.cth_inference / ciCount),
          explanation: round2(sumCI.cth_explanation / ciCount),
          self_regulation: round2(sumCI.cth_self_regulation / ciCount),
        }
      }
    }

    const rm3 = {
      totalGoals,
      coveredGoals,
      ctCoverageRate,
      quizAccuracy,
      totalChallenges: challenges.length,
      hasResearchData: hasResearchRM3,
      avgCTScore,
      avgCThScore,
      ctBreakdown,
      cthBreakdown,
    }

    // ── 4. Student Summary (optimized with pre-built Maps) ──────────────────
    const userMap = new Map(users.map(u => [u.id, u.email]))
    const pcByUser = buildUserMap(promptClassifications)

    const studentSummary = users.map(u => {
      const userId = u.id

      // O(1) lookups via pre-built Maps
      const userCourses = coursesByUser.get(userId) || []
      const userQuizzes = quizByUser.get(userId) || []
      const userJournals = journalsByUser.get(userId) || []
      const userChallenges = challengesByUser.get(userId) || []
      const userDiscussions = discussionsByUser.get(userId) || []
      const userAsk = askByUser.get(userId) || []
      const userTranscripts = transcriptsByUser.get(userId) || []

      const userCorrect = userQuizzes.filter(q => q.is_correct === true).length
      const userQuizAccuracy = userQuizzes.length > 0 ? Math.round((userCorrect / userQuizzes.length) * 100) : 0

      // Determine prompt stage
      let userStage = 'N/A'
      if (hasResearchRM2) {
        const userPC = pcByUser.get(userId) || []
        if (userPC.length > 0) {
          // Get the most recent classification
          const sorted = [...userPC].sort((a, b) =>
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
          userStage = sorted[0].prompt_stage || 'SCP'
          if (userStage === 'REFLECTIVE') userStage = 'Reflektif'
        }
      } else if (userAsk.length > 0) {
        // Heuristic fallback
        const lastAsk = [...userAsk].sort((a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )[0]
        userStage = classifyPromptStageHeuristic(lastAsk?.prompt_components)
      }

      // Last activity
      const allTimestamps = [
        ...userCourses.map(c => c.created_at),
        ...userQuizzes.map(q => q.created_at),
        ...userAsk.map(a => a.created_at),
        ...userChallenges.map(c => c.created_at),
        ...userJournals.map(j => j.created_at),
      ].filter(Boolean).map(t => new Date(t).getTime()).filter(t => !isNaN(t))

      const lastActivity = allTimestamps.length > 0
        ? new Date(Math.max(...allTimestamps)).toISOString()
        : u.created_at || ''

      return {
        id: userId,
        email: u.email,
        courses: userCourses.length,
        quizzes: userQuizzes.length,
        quizAccuracy: userQuizAccuracy,
        journals: userJournals.length,
        challenges: userChallenges.length,
        discussions: userDiscussions.length,
        promptStage: userStage,
        askQuestions: userAsk.length,
        transcripts: userTranscripts.length,
        lastActivity,
      }
    })

    // ── 5. Recent Activity Feed (all 8 types, latest 15) ────────────────────
    // Optimized: use pre-built Maps for email lookup, limit slices
    const recentItems: ActivityItem[] = []

    // FIX: use 'created_by' for courses (not 'user_id' which doesn't exist)
    courses.slice(-10).forEach(c => {
      recentItems.push({
        type: 'course',
        email: userMap.get(c.created_by) || 'Unknown',
        detail: c.title || 'New course generated',
        timestamp: c.created_at,
      })
    })

    askHistory.slice(-10).forEach(a => {
      recentItems.push({
        type: 'ask',
        email: userMap.get(a.user_id) || 'Unknown',
        detail: (a.question || '').substring(0, 80),
        timestamp: a.created_at,
      })
    })

    challenges.slice(-10).forEach(c => {
      recentItems.push({
        type: 'challenge',
        email: userMap.get(c.user_id) || 'Unknown',
        detail: (c.question || '').substring(0, 80),
        timestamp: c.created_at,
      })
    })

    quizSubmissions.slice(-10).forEach(q => {
      recentItems.push({
        type: 'quiz',
        email: userMap.get(q.user_id) || 'Unknown',
        detail: q.is_correct ? 'Jawaban benar' : 'Jawaban salah',
        timestamp: q.created_at,
      })
    })

    journals.slice(-10).forEach(j => {
      recentItems.push({
        type: 'journal',
        email: userMap.get(j.user_id) || 'Unknown',
        detail: j.type === 'structured_reflection' ? 'Refleksi terstruktur' : 'Jurnal entry',
        timestamp: j.created_at,
      })
    })

    transcripts.slice(-10).forEach(t => {
      recentItems.push({
        type: 'transcript',
        email: userMap.get(t.user_id) || 'Unknown',
        detail: 'Transcript saved',
        timestamp: t.created_at,
      })
    })

    feedbacks.slice(-10).forEach(f => {
      recentItems.push({
        type: 'feedback',
        email: userMap.get(f.user_id) || 'Unknown',
        detail: f.rating ? `Rating ${f.rating}/5` : (f.comment || '').substring(0, 80) || 'Feedback submitted',
        timestamp: f.created_at,
      })
    })

    discussions.slice(-10).forEach(d => {
      recentItems.push({
        type: 'discussion',
        email: userMap.get(d.user_id) || 'Unknown',
        detail: `Discussion ${d.status || 'started'}`,
        timestamp: d.created_at,
      })
    })

    // Sort by timestamp descending, take latest 15
    recentItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    const recentActivity = recentItems.slice(0, 15)

    // ── 6. Response ─────────────────────────────────────────────────────────
    const queryTimeMs = Date.now() - startTime

    const response: DashboardAPIResponse = {
      kpi,
      rm2,
      rm3,
      studentSummary,
      recentActivity,
      meta: {
        timeRange,
        generatedAt: new Date().toISOString(),
        queryTimeMs,
      },
    }

    return withCacheHeaders(NextResponse.json(response), 30)
  } catch (err: unknown) {
    console.error('[Admin Dashboard] Error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
