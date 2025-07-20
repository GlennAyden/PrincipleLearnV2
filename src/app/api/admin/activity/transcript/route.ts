// src/app/api/admin/activity/transcript/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// import prisma from '@/lib/prisma' // Removed for mock implementation

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const date   = searchParams.get('date')       // format: 'YYYY-MM-DD'
    const course = searchParams.get('course')     // from query param "course"
    const topic  = searchParams.get('topic')      // from query param "topic"
  
    // Build filter object
    const where: any = {}
    if (userId)  where.userId   = userId
    if (date) {
      const start = new Date(date)
      const end   = new Date(date)
      end.setDate(start.getDate() + 1)
      where.createdAt = { gte: start, lt: end }
    }
    if (course) where.courseId = course
    if (topic)  where.subtopic = topic
  
    // Mock transcript logs data
    const mockLogs = [
      {
        id: 'transcript-1',
        createdAt: new Date('2025-01-15'),
        subtopic: 'Module 1 - Variables and Data Types',
        question: 'What is the difference between let and const?',
        answer: 'let allows reassignment while const creates immutable bindings...',
        userId: 'user-123',
        userEmail: 'user@example.com'
      },
      {
        id: 'transcript-2',
        createdAt: new Date('2025-01-14'),
        subtopic: 'Module 2 - Loops and Conditionals',
        question: 'When should I use a for loop vs while loop?',
        answer: 'Use for loops when you know the number of iterations...',
        userId: 'admin-456',
        userEmail: 'admin@example.com'
      },
      {
        id: 'transcript-3',
        createdAt: new Date('2025-01-13'),
        subtopic: 'Module 3 - Function Basics',
        question: 'What are the benefits of using functions?',
        answer: 'Functions promote code reusability, modularity, and better organization...',
        userId: 'user-789',
        userEmail: 'test@example.com'
      }
    ];
    
    // Apply filters to mock data
    let filteredLogs = mockLogs;
    if (userId) filteredLogs = filteredLogs.filter(log => log.userId === userId);
    if (course) filteredLogs = filteredLogs.filter(log => log.subtopic.includes('Module'));
    if (topic) filteredLogs = filteredLogs.filter(log => log.subtopic.includes(topic));
    if (date) {
      const filterDate = new Date(date);
      filteredLogs = filteredLogs.filter(log => 
        log.createdAt.toDateString() === filterDate.toDateString()
      );
    }
    
    // Shape response to match TranscriptLogItem in AdminActivityPage
    const payload = filteredLogs.map((log) => ({
      id: log.id,
      timestamp: log.createdAt.toLocaleDateString('id-ID'),
      topic: log.subtopic,
      content: `Q: ${log.question}\nA: ${log.answer}`,
      userEmail: log.userEmail,
      userId: log.userId
    }))
  
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching transcript logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcript logs' },
      { status: 500 }
    );
  }
}
