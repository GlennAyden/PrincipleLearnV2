// src/app/api/admin/activity/quiz/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// import prisma from '@/lib/prisma' // Removed for mock implementation

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const date   = searchParams.get('date')     // from filter "Tanggal"
    const course = searchParams.get('course')   // from filter "Course"
    const topic  = searchParams.get('topic')    // from filter "Topic/Subtopic"
  
    // Build dynamic filters
    const where: any = {}
    if (userId)  where.userId   = userId
    if (course)  where.courseId = course
    if (topic)   where.subtopic = topic
    if (date) {
      const start = new Date(date)
      const end   = new Date(date)
      end.setDate(start.getDate() + 1)
      where.createdAt = { gte: start, lt: end }
    }
  
    // Mock quiz attempts data
    const mockAttempts = [
      {
        id: 'quiz-1',
        createdAt: new Date('2025-01-15'),
        subtopic: 'Module 1 - Programming Basics Quiz',
        score: 85,
        userId: 'user-123',
        userEmail: 'user@example.com'
      },
      {
        id: 'quiz-2',
        createdAt: new Date('2025-01-14'),
        subtopic: 'Module 2 - Control Structures Quiz',
        score: 92,
        userId: 'admin-456',
        userEmail: 'admin@example.com'
      },
      {
        id: 'quiz-3',
        createdAt: new Date('2025-01-13'),
        subtopic: 'Module 3 - Functions Quiz',
        score: 78,
        userId: 'user-789',
        userEmail: 'test@example.com'
      }
    ];
    
    // Apply filters to mock data
    let filteredAttempts = mockAttempts;
    if (userId) filteredAttempts = filteredAttempts.filter(a => a.userId === userId);
    if (course) filteredAttempts = filteredAttempts.filter(a => a.subtopic.includes('Module'));
    if (topic) filteredAttempts = filteredAttempts.filter(a => a.subtopic.includes(topic));
    if (date) {
      const filterDate = new Date(date);
      filteredAttempts = filteredAttempts.filter(a => 
        a.createdAt.toDateString() === filterDate.toDateString()
      );
    }
    
    // Shape response to match QuizLogItem in AdminActivityPage
    const payload = filteredAttempts.map((a) => ({
      id: a.id,
      timestamp: a.createdAt.toLocaleDateString('id-ID'),
      topic: a.subtopic,
      score: a.score,
      userEmail: a.userEmail,
      userId: a.userId
    }))
  
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching quiz logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch quiz logs' },
      { status: 500 }
    );
  }
}
