// src/app/api/admin/dashboard/route.ts
// Redesigned dashboard API — RM2/RM3 aligned metrics

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DatabaseService } from '@/lib/database'

export async function GET(request: NextRequest) {
  try {
    // ── 1. Active Students ──
    const users = await DatabaseService.getRecords<any>('users', {
      filter: { role: 'USER' },
    })
    const activeStudents = users.length

    // ── 2. Total Sessions / Courses ──
    const courses = await DatabaseService.getRecords<any>('courses', {})
    const totalCourses = courses.length

    // ── 3. Quiz Accuracy (RM3 indicator) ──
    const quizSubmissions = await DatabaseService.getRecords<any>('quiz_submissions', {})
    const totalQuizzes = quizSubmissions.length
    const correctQuizzes = quizSubmissions.filter((q: any) => q.is_correct === true).length
    const quizAccuracy = totalQuizzes > 0
      ? Math.round((correctQuizzes / totalQuizzes) * 100)
      : 0

    // ── 4. Discussion Sessions (RM3 — CT through Socratic) ──
    const discussions = await DatabaseService.getRecords<any>('discussion_sessions', {})
    const totalDiscussions = discussions.length
    const completedDiscussions = discussions.filter((d: any) => d.status === 'completed').length

    // ── 5. Journals (Reflective thinking) ──
    const journals = await DatabaseService.getRecords<any>('jurnal', {})
    const totalJournals = journals.length

    // ── 6. Challenge Thinking (CT indicator) ──
    const challenges = await DatabaseService.getRecords<any>('challenge_responses', {})
    const totalChallenges = challenges.length

    // ── 7. Ask Question History ──
    const askHistory = await DatabaseService.getRecords<any>('ask_question_history', {})
    const totalAskQuestions = askHistory.length

    // ── 8. Feedback ──
    const feedbacks = await DatabaseService.getRecords<any>('feedback', {})
    const totalFeedbacks = feedbacks.length
    const avgRating = feedbacks.length > 0
      ? Math.round(
          (feedbacks.reduce((sum: number, f: any) => sum + (f.rating || 0), 0) / feedbacks.filter((f: any) => f.rating).length) * 10
        ) / 10
      : 0

    // ── 9. RM2 — Prompt Stage Distribution ──
    // Classify prompts by quality stage based on generate_course_logs step data
    const generateLogs = await DatabaseService.getRecords<any>('course_generation_activity', {})

    let stageDistribution = { SCP: 0, SRP: 0, MQP: 0, Reflektif: 0 }

    generateLogs.forEach((log: any) => {
      const steps = log.steps || {}
      const step1 = steps.step1 || {}
      const step2 = steps.step2 || {}
      const step3 = steps.step3 || {}

      // Count filled components
      let componentCount = 0
      if (step1.topic && step1.topic.trim()) componentCount++
      if (step1.goal && step1.goal.trim()) componentCount++
      if (step2.level && step2.level.trim()) componentCount++
      if (step2.extraTopics && step2.extraTopics.trim()) componentCount++
      if (step3.problem && step3.problem.trim()) componentCount++
      if (step3.assumption && step3.assumption.trim()) componentCount++

      // Classify into stages (simplified heuristic)
      // SCP: 0-1 components (simple copy-paste style)
      // SRP: 2-3 components (structured with some detail)
      // MQP: 4-5 components (multi-quality prompt)
      // Reflektif: 6 components (full reflective prompt)
      if (componentCount <= 1) {
        stageDistribution.SCP++
      } else if (componentCount <= 3) {
        stageDistribution.SRP++
      } else if (componentCount <= 5) {
        stageDistribution.MQP++
      } else {
        stageDistribution.Reflektif++
      }
    })

    const totalPrompts = generateLogs.length

    // ── 10. RM3 — CT Indicators from discussions ──
    // Count goals covered (CT demonstrated) across all discussions
    let totalGoals = 0
    let coveredGoals = 0

    discussions.forEach((d: any) => {
      const goals = d.learning_goals || []
      totalGoals += goals.length
      coveredGoals += goals.filter((g: any) => g.covered).length
    })

    const ctCoverageRate = totalGoals > 0
      ? Math.round((coveredGoals / totalGoals) * 100)
      : 0

    // ── 11. Per-student summary ──
    const studentSummary = users.map((user: any) => {
      const userCourses = courses.filter((c: any) => c.user_id === user.id).length
      const userQuizzes = quizSubmissions.filter((q: any) => q.user_id === user.id)
      const userQuizAccuracy = userQuizzes.length > 0
        ? Math.round(
            (userQuizzes.filter((q: any) => q.is_correct).length / userQuizzes.length) * 100
          )
        : 0
      const userJournals = journals.filter((j: any) => j.user_id === user.id).length
      const userChallenges = challenges.filter((c: any) => c.user_id === user.id).length
      const userDiscussions = discussions.filter((d: any) => d.user_id === user.id).length

      // Find prompt stage for this user
      const userLogs = generateLogs.filter((l: any) => l.user_id === user.id)
      let userStage = 'N/A'
      if (userLogs.length > 0) {
        const lastLog = userLogs[userLogs.length - 1]
        const steps = lastLog.steps || {}
        let count = 0
        const s1 = steps.step1 || {}
        const s2 = steps.step2 || {}
        const s3 = steps.step3 || {}
        if (s1.topic?.trim()) count++
        if (s1.goal?.trim()) count++
        if (s2.level?.trim()) count++
        if (s2.extraTopics?.trim()) count++
        if (s3.problem?.trim()) count++
        if (s3.assumption?.trim()) count++
        if (count <= 1) userStage = 'SCP'
        else if (count <= 3) userStage = 'SRP'
        else if (count <= 5) userStage = 'MQP'
        else userStage = 'Reflektif'
      }

      return {
        id: user.id,
        email: user.email,
        courses: userCourses,
        quizzes: userQuizzes.length,
        quizAccuracy: userQuizAccuracy,
        journals: userJournals,
        challenges: userChallenges,
        discussions: userDiscussions,
        promptStage: userStage,
      }
    })

    // ── 12. Recent Activity Feed (latest 10 across all tables) ──
    type ActivityItem = { type: string; email: string; detail: string; timestamp: string }
    const recentItems: ActivityItem[] = []

    // Map user IDs to emails
    const userMap = new Map(users.map((u: any) => [u.id, u.email]))

    courses.forEach((c: any) => {
      recentItems.push({
        type: 'course',
        email: (userMap.get(c.user_id) as string) || 'Unknown',
        detail: c.title || 'New course generated',
        timestamp: c.created_at,
      })
    })

    askHistory.slice(-5).forEach((a: any) => {
      recentItems.push({
        type: 'ask',
        email: (userMap.get(a.user_id) as string) || 'Unknown',
        detail: (a.question || '').substring(0, 80),
        timestamp: a.created_at,
      })
    })

    challenges.slice(-5).forEach((c: any) => {
      recentItems.push({
        type: 'challenge',
        email: (userMap.get(c.user_id) as string) || 'Unknown',
        detail: (c.question || '').substring(0, 80),
        timestamp: c.created_at,
      })
    })

    quizSubmissions.slice(-5).forEach((q: any) => {
      recentItems.push({
        type: 'quiz',
        email: (userMap.get(q.user_id) as string) || 'Unknown',
        detail: q.is_correct ? 'Jawaban benar' : 'Jawaban salah',
        timestamp: q.submitted_at || q.created_at,
      })
    })

    // Sort by timestamp descending, take latest 10
    recentItems.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    const recentActivity = recentItems.slice(0, 10)

    // ── Response ──
    return NextResponse.json({
      kpi: {
        activeStudents,
        totalCourses,
        quizAccuracy,
        totalDiscussions,
        completedDiscussions,
        totalJournals,
        totalChallenges,
        totalAskQuestions,
        totalFeedbacks,
        avgRating,
        ctCoverageRate,
      },
      rm2: {
        stages: stageDistribution,
        totalPrompts,
      },
      rm3: {
        totalGoals,
        coveredGoals,
        ctCoverageRate,
        quizAccuracy,
        totalChallenges,
      },
      studentSummary,
      recentActivity,
    })
  } catch (err: any) {
    console.error('[Admin Dashboard] Error:', err)
    return NextResponse.json(
      { message: 'Internal Server Error', error: err.message, stack: err.stack },
      { status: 500 }
    )
  }
}