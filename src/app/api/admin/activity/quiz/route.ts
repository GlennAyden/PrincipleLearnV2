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
  correct_answer: string;
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
  content: string;
}

export async function GET(req: NextRequest) {
  console.log('[Activity API] Starting quiz activity fetch');
  
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const date = searchParams.get('date')
    const course = searchParams.get('course')
    const topic = searchParams.get('topic')
  
    console.log('[Activity API] Request params:', { userId, date, course, topic });

    // Get all quiz submissions from database
    let quizSubmissions: QuizSubmission[] = [];
    try {
      quizSubmissions = await DatabaseService.getRecords<QuizSubmission>('quiz_submissions', {
        orderBy: { column: 'submitted_at', ascending: false }
      });
    } catch (dbError) {
      console.error('[Activity API] Database error fetching quiz submissions:', dbError);
      return NextResponse.json([], { status: 200 });
    }

    console.log(`[Activity API] Found ${quizSubmissions.length} total quiz submissions in database`);
    
    // Filter submissions based on parameters
    let filteredSubmissions = quizSubmissions;
    
    // Filter by user if specified
    if (userId) {
      filteredSubmissions = filteredSubmissions.filter(submission => submission.user_id === userId);
      console.log(`[Activity API] Filtered by user ${userId}: ${filteredSubmissions.length} submissions`);
    }
    
    // Filter by date if specified
    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      filteredSubmissions = filteredSubmissions.filter(submission => {
        const submissionDate = new Date(submission.submitted_at);
        return submissionDate >= startOfDay && submissionDate <= endOfDay;
      });
      console.log(`[Activity API] Filtered by date ${date}: ${filteredSubmissions.length} submissions`);
    }

    // Group submissions by user and calculate scores
    const userScores = new Map();
    const payload = [];

    for (const submission of filteredSubmissions) {
      try {
        // Get quiz info
        const quizzes: Quiz[] = await DatabaseService.getRecords<Quiz>('quiz', {
          filter: { id: submission.quiz_id },
          limit: 1
        });
        
        if (quizzes.length === 0) continue;
        const quiz = quizzes[0];
        
        // Filter by course if specified
        if (course && quiz.course_id !== course) continue;
        
        // Get user info
        const users: User[] = await DatabaseService.getRecords<User>('users', {
          filter: { id: submission.user_id },
          limit: 1
        });
        
        // Get subtopic info
        const subtopics: Subtopic[] = await DatabaseService.getRecords<Subtopic>('subtopics', {
          filter: { id: quiz.subtopic_id },
          limit: 1
        });
        
        const user = users.length > 0 ? users[0] : null;
        const subtopic = subtopics.length > 0 ? subtopics[0] : null;
        
        // Parse subtopic content to get topic name
        let topicName = 'Unknown Topic';
        if (subtopic) {
          try {
            const subtopicContent = JSON.parse(subtopic.content);
            topicName = subtopicContent.module || subtopic.title || 'Unknown Topic';
          } catch (parseError) {
            topicName = subtopic.title || 'Unknown Topic';
          }
        }
        
        // Filter by topic if specified
        if (topic && !topicName.toLowerCase().includes(topic.toLowerCase())) {
          continue;
        }
        
        // Calculate or get existing score for this user-quiz combination
        const scoreKey = `${submission.user_id}-${quiz.course_id}-${quiz.subtopic_id}`;
        if (!userScores.has(scoreKey)) {
          // Get all submissions for this user and subtopic to calculate score
          const userSubmissionsForTopic = filteredSubmissions.filter(s => 
            s.user_id === submission.user_id && 
            quizzes.some(q => q.id === s.quiz_id && q.subtopic_id === quiz.subtopic_id)
          );
          
          const correctAnswers = userSubmissionsForTopic.filter(s => s.is_correct).length;
          const totalQuestions = userSubmissionsForTopic.length;
          const score = totalQuestions > 0 ? Math.round((correctAnswers / totalQuestions) * 100) : 0;
          
          userScores.set(scoreKey, score);
          
          // Create activity log item
          const logItem = {
            id: `quiz-${scoreKey}`,
            timestamp: new Date(submission.submitted_at).toLocaleDateString('id-ID'),
            topic: topicName,
            score: score,
            userEmail: user?.email || 'Unknown User',
            userId: submission.user_id
          };
          
          payload.push(logItem);
        }
        
      } catch (infoError) {
        console.error(`[Activity API] Error getting info for quiz submission ${submission.id}:`, infoError);
      }
    }
    
    console.log(`[Activity API] Returning ${payload.length} formatted quiz records`);
    return NextResponse.json(payload);
    
  } catch (error) {
    console.error('[Activity API] Error fetching quiz logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quiz logs' },
      { status: 500 }
    );
  }
}