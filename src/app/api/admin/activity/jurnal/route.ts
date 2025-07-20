// src/app/api/admin/activity/jurnal/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
// import prisma from '@/lib/prisma' // Removed for mock implementation

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const date   = searchParams.get('date')     // filter "Tanggal"
    const course = searchParams.get('course')   // filter "Course"
    const topic  = searchParams.get('topic')    // filter "Topic/Subtopic"
  
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
  
    // Mock journal logs data
    const mockLogs = [
      {
        id: 'journal-1',
        createdAt: new Date('2025-01-15'),
        subtopic: 'Module 1 - Introduction to Programming',
        content: 'Today I learned about variables and data types. Very helpful content!',
        userId: 'user-123',
        userEmail: 'user@example.com'
      },
      {
        id: 'journal-2',
        createdAt: new Date('2025-01-14'),
        subtopic: 'Module 2 - Control Structures',
        content: 'The concept of loops was challenging but I think I understand it now.',
        userId: 'admin-456',
        userEmail: 'admin@example.com'
      },
      {
        id: 'journal-3',
        createdAt: new Date('2025-01-13'),
        subtopic: 'Module 3 - Functions',
        content: 'Functions make code more organized and reusable. Great explanation!',
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
    
    // Shape response to match JournalLogItem in AdminActivityPage
    const payload = filteredLogs.map((log) => ({
      id: log.id,
      timestamp: log.createdAt.toLocaleDateString('id-ID'),
      topic: log.subtopic,
      content: log.content,
      userEmail: log.userEmail,
      userId: log.userId
    }))
  
    return NextResponse.json(payload)
  } catch (error) {
    console.error('Error fetching journal logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal logs' },
      { status: 500 }
    );
  }
}
