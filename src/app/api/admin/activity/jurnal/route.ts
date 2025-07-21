// src/app/api/admin/activity/jurnal/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DatabaseService } from '@/lib/database'

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
  
    // Get real journal data from database
    try {
      // Get journal entries
      const journals = await DatabaseService.getRecords('jurnal', {
        orderBy: 'created_at desc'
      });
      
      // Get users for user info
      const users = await DatabaseService.getRecords('users');
      
      // Get courses for course info
      const courses = await DatabaseService.getRecords('courses');
      
      // Join and transform the data
      const enrichedJournals = journals.map(journal => {
        const user = users.find(u => u.id === journal.user_id);
        const course = courses.find(c => c.id === journal.course_id);
        
        return {
          id: journal.id,
          createdAt: new Date(journal.created_at),
          subtopic: course?.title || 'Unknown Course',
          content: journal.content,
          reflection: journal.reflection,
          userId: user?.id,
          userEmail: user?.email,
          courseId: journal.course_id
        };
      }).filter(j => j.userEmail); // Only include entries with valid user data
      
      // Apply filters
      let filteredJournals = enrichedJournals;
      
      if (userId) {
        filteredJournals = filteredJournals.filter(j => j.userId === userId);
      }
      
      if (course) {
        filteredJournals = filteredJournals.filter(j => 
          j.subtopic.toLowerCase().includes(course.toLowerCase()) ||
          j.courseId === course
        );
      }
      
      if (topic) {
        filteredJournals = filteredJournals.filter(j => 
          j.subtopic.toLowerCase().includes(topic.toLowerCase())
        );
      }
      
      if (date) {
        const filterDate = new Date(date);
        filteredJournals = filteredJournals.filter(j => 
          j.createdAt.toDateString() === filterDate.toDateString()
        );
      }
      
      // Shape response to match JournalLogItem in AdminActivityPage
      const payload = filteredJournals.map((journal) => ({
        id: journal.id,
        timestamp: journal.createdAt.toLocaleDateString('id-ID'),
        topic: journal.subtopic,
        content: journal.content,
        reflection: journal.reflection,
        userEmail: journal.userEmail,
        userId: journal.userId
      }));
      
      return NextResponse.json(payload);
      
    } catch (dbError) {
      console.error('Database error in journal logs:', dbError);
      // Return empty array if no data or database error
      return NextResponse.json([]);
    }
  } catch (error) {
    console.error('Error fetching journal logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal logs' },
      { status: 500 }
    );
  }
}
