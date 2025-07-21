// src/app/api/admin/activity/quiz/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DatabaseService } from '@/lib/database'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const date   = searchParams.get('date')     // from filter "Tanggal"
    const course = searchParams.get('course')   // from filter "Course"
    const topic  = searchParams.get('topic')    // from filter "Topic/Subtopic"
  
    // Get quiz submissions from database with user and course info
    try {
      // First get all quiz submissions with filters
      let submissions = await DatabaseService.getRecords('quiz_submissions');
      
      // Get quiz questions to get course and subtopic info
      const quizQuestions = await DatabaseService.getRecords('quiz', {
        orderBy: 'created_at'
      });
      
      // Get users for user info
      const users = await DatabaseService.getRecords('users');
      
      // Get courses for course info
      const courses = await DatabaseService.getRecords('courses');
      
      // Get subtopics for subtopic info
      const subtopics = await DatabaseService.getRecords('subtopics');
      
      // Join and transform the data
      const enrichedSubmissions = submissions.map(submission => {
        const quiz = quizQuestions.find(q => q.id === submission.quiz_id);
        const user = users.find(u => u.id === submission.user_id);
        const course = courses.find(c => c.id === quiz?.course_id);
        const subtopic = subtopics.find(s => s.id === quiz?.subtopic_id);
        
        return {
          id: submission.id,
          createdAt: new Date(submission.submitted_at),
          subtopic: subtopic?.title || 'Unknown Subtopic',
          courseTitle: course?.title || 'Unknown Course',
          courseId: course?.id,
          score: submission.is_correct ? 100 : 0, // Individual question score
          userId: user?.id,
          userEmail: user?.email,
          question: quiz?.question,
          answer: submission.answer,
          isCorrect: submission.is_correct
        };
      }).filter(s => s.userEmail); // Only include submissions with valid user data
      
      // Apply filters
      let filteredSubmissions = enrichedSubmissions;
      
      if (userId) {
        filteredSubmissions = filteredSubmissions.filter(s => s.userId === userId);
      }
      
      if (course) {
        filteredSubmissions = filteredSubmissions.filter(s => 
          s.courseTitle.toLowerCase().includes(course.toLowerCase()) ||
          s.courseId === course
        );
      }
      
      if (topic) {
        filteredSubmissions = filteredSubmissions.filter(s => 
          s.subtopic.toLowerCase().includes(topic.toLowerCase())
        );
      }
      
      if (date) {
        const filterDate = new Date(date);
        filteredSubmissions = filteredSubmissions.filter(s => 
          s.createdAt.toDateString() === filterDate.toDateString()
        );
      }
      
      // Group by user and subtopic to calculate overall scores
      const groupedResults: { [key: string]: any } = {};
      
      filteredSubmissions.forEach(submission => {
        const key = `${submission.userId}-${submission.subtopic}`;
        
        if (!groupedResults[key]) {
          groupedResults[key] = {
            id: `${submission.userId}-${submission.subtopic}-${submission.createdAt.getTime()}`,
            timestamp: submission.createdAt.toLocaleDateString('id-ID'),
            topic: `${submission.subtopic} (${submission.courseTitle})`,
            userEmail: submission.userEmail,
            userId: submission.userId,
            correctAnswers: 0,
            totalAnswers: 0,
            createdAt: submission.createdAt
          };
        }
        
        groupedResults[key].totalAnswers++;
        if (submission.isCorrect) {
          groupedResults[key].correctAnswers++;
        }
      });
      
      // Calculate final scores
      const payload = Object.values(groupedResults).map((group: any) => ({
        id: group.id,
        timestamp: group.timestamp,
        topic: group.topic,
        score: group.totalAnswers > 0 ? Math.round((group.correctAnswers / group.totalAnswers) * 100) : 0,
        userEmail: group.userEmail,
        userId: group.userId
      }));
      
      // Sort by most recent first
      payload.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      
      return NextResponse.json(payload);
      
    } catch (dbError) {
      console.error('Database error in quiz logs:', dbError);
      // Return empty array if no data or database error
      return NextResponse.json([]);
    }
  } catch (error) {
    console.error('Error fetching quiz logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quiz logs' },
      { status: 500 }
    );
  }
}
