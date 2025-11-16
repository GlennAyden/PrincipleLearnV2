// src/app/api/admin/activity/quiz/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DatabaseService } from '@/lib/database'

interface QuizSubmission {
  id: string;
  user_id: string;
  quiz_id: string;
  answer: string;
  is_correct: boolean;
  submitted_at: string;
}

interface Quiz {
  id: string;
  course_id: string;
  subtopic_id: string;
  question: string;
  options: any;
  correct_answer: string | null;
}

interface User {
  id: string;
  email: string;
}

interface Course {
  id: string;
  title: string;
}

interface Subtopic {
  id: string;
  title: string;
}

export async function GET(req: NextRequest) {
  console.log('[Activity API] Starting quiz activity fetch');
  
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const date = searchParams.get('date')
    const courseId = searchParams.get('course')
    const topicFilter = searchParams.get('topic')
  
    console.log('[Activity API] Request params:', { userId, date, courseId, topic: topicFilter });

    let quizSubmissions: QuizSubmission[] = []
    try {
      quizSubmissions = await DatabaseService.getRecords<QuizSubmission>('quiz_submissions', {
        orderBy: { column: 'submitted_at', ascending: false },
      })
    } catch (dbError) {
      console.error('[Activity API] Database error fetching quiz submissions:', dbError)
      return NextResponse.json([], { status: 200 })
    }

    if (userId) {
      quizSubmissions = quizSubmissions.filter((submission) => submission.user_id === userId)
    }

    if (date) {
      const targetDate = new Date(date)
      const startOfDay = new Date(targetDate)
      startOfDay.setHours(0, 0, 0, 0)
      const endOfDay = new Date(targetDate)
      endOfDay.setHours(23, 59, 59, 999)
      quizSubmissions = quizSubmissions.filter((submission) => {
        const submittedAt = new Date(submission.submitted_at)
        return submittedAt >= startOfDay && submittedAt <= endOfDay
      })
    }

    const userCache = new Map<string, User | null>()
    const quizCache = new Map<string, Quiz | null>()
    const subtopicCache = new Map<string, Subtopic | null>()
    const courseCache = new Map<string, Course | null>()

    const payload = []
    for (const submission of quizSubmissions) {
      const quiz = await fetchCached(quizCache, submission.quiz_id, 'quiz')
      if (!quiz) continue

      if (courseId && quiz.course_id !== courseId) {
        continue
      }

      const [subtopic, course, user] = await Promise.all([
        fetchCached(subtopicCache, quiz.subtopic_id, 'subtopics'),
        fetchCached(courseCache, quiz.course_id, 'courses'),
        fetchCached(userCache, submission.user_id, 'users'),
      ])

      const topicName = subtopic?.title ?? 'Tanpa Subtopik'
      if (topicFilter && !topicName.toLowerCase().includes(topicFilter.toLowerCase())) {
        continue
      }

      payload.push({
        id: submission.id,
        timestamp: new Date(submission.submitted_at).toLocaleString('id-ID'),
        userEmail: user?.email ?? 'Unknown User',
        userId: submission.user_id,
        topic: topicName,
        courseTitle: course?.title ?? 'Tanpa Kursus',
        question: quiz.question,
        options: Array.isArray(quiz.options) ? quiz.options : [],
        userAnswer: submission.answer,
        correctAnswer: quiz.correct_answer ?? '',
        isCorrect: submission.is_correct,
      })
    }
    
    console.log(`[Activity API] Returning ${payload.length} detailed quiz records`)
    return NextResponse.json(payload)
    
  } catch (error) {
    console.error('[Activity API] Error fetching quiz logs:', error)
    return NextResponse.json(
      { error: 'Failed to fetch quiz logs' },
      { status: 500 }
    )
  }
}

async function fetchCached<T extends { id: string }>(
  cache: Map<string, T | null>,
  id: string | null,
  table: string
): Promise<T | null> {
  if (!id) return null
  if (cache.has(id)) return cache.get(id) ?? null
  try {
    const [record] = await DatabaseService.getRecords<T>(table, {
      filter: { id },
      limit: 1,
    })
    cache.set(id, record ?? null)
    return record ?? null
  } catch (error) {
    console.error(`[Activity API] Failed to fetch ${table} record ${id}:`, error)
    cache.set(id, null)
    return null
  }
}
