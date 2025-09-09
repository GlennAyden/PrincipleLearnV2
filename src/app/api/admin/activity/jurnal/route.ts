// src/app/api/admin/activity/jurnal/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DatabaseService } from '@/lib/database'

interface Journal {
  id: string;
  user_id: string;
  course_id: string;
  content: string;
  reflection?: string;
  created_at: string;
  updated_at: string;
}

interface User {
  id: string;
  email: string;
}

interface Course {
  id: string;
  title: string;
}

export async function GET(req: NextRequest) {
  console.log('[Activity API] Starting journal activity fetch');
  
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const date = searchParams.get('date')
    const course = searchParams.get('course')
    const topic = searchParams.get('topic')
  
    console.log('[Activity API] Request params:', { userId, date, course, topic });

    // Get all journal entries from database
    let journals: Journal[] = [];
    try {
      journals = await DatabaseService.getRecords<Journal>('jurnal', {
        orderBy: { column: 'created_at', ascending: false }
      });
    } catch (dbError) {
      console.error('[Activity API] Database error fetching journals:', dbError);
      return NextResponse.json([], { status: 200 });
    }

    console.log(`[Activity API] Found ${journals.length} total journal entries in database`);
    
    // Filter journals based on parameters
    let filteredJournals = journals;
    
    // Filter by user if specified
    if (userId) {
      filteredJournals = filteredJournals.filter(journal => journal.user_id === userId);
      console.log(`[Activity API] Filtered by user ${userId}: ${filteredJournals.length} journals`);
    }
    
    // Filter by date if specified
    if (date) {
      const targetDate = new Date(date);
      const startOfDay = new Date(targetDate);
      startOfDay.setHours(0, 0, 0, 0);
      const endOfDay = new Date(targetDate);
      endOfDay.setHours(23, 59, 59, 999);
      
      filteredJournals = filteredJournals.filter(journal => {
        const journalDate = new Date(journal.created_at);
        return journalDate >= startOfDay && journalDate <= endOfDay;
      });
      console.log(`[Activity API] Filtered by date ${date}: ${filteredJournals.length} journals`);
    }
    
    // Filter by course if specified
    if (course) {
      filteredJournals = filteredJournals.filter(journal => journal.course_id === course);
      console.log(`[Activity API] Filtered by course ${course}: ${filteredJournals.length} journals`);
    }

    // Get additional information for each journal
    const payload = [];
    for (const journal of filteredJournals) {
      try {
        // Get user info
        const users: User[] = await DatabaseService.getRecords<User>('users', {
          filter: { id: journal.user_id },
          limit: 1
        });
        
        // Get course info
        const courses: Course[] = await DatabaseService.getRecords<Course>('courses', {
          filter: { id: journal.course_id },
          limit: 1
        });
        
        const user = users.length > 0 ? users[0] : null;
        const courseData = courses.length > 0 ? courses[0] : null;
        
        // Use course title as topic (since journal is course-level)
        const topicName = courseData?.title || 'Unknown Course';
        
        // Filter by topic if specified (match against course title)
        if (topic && !topicName.toLowerCase().includes(topic.toLowerCase())) {
          continue; // Skip this journal if topic doesn't match
        }
        
        // Create activity log item
        const logItem = {
          id: journal.id,
          timestamp: new Date(journal.created_at).toLocaleDateString('id-ID'),
          topic: topicName,
          content: journal.content || 'No content available',
          userEmail: user?.email || 'Unknown User',
          userId: journal.user_id
        };
        
        payload.push(logItem);
        
      } catch (infoError) {
        console.error(`[Activity API] Error getting info for journal ${journal.id}:`, infoError);
        
        // Add journal with minimal info
        const logItem = {
          id: journal.id,
          timestamp: new Date(journal.created_at).toLocaleDateString('id-ID'),
          topic: 'Unknown Topic',
          content: journal.content || 'No content available',
          userEmail: 'Unknown User',
          userId: journal.user_id
        };
        
        payload.push(logItem);
      }
    }
    
    console.log(`[Activity API] Returning ${payload.length} formatted journal records`);
    return NextResponse.json(payload);
    
  } catch (error) {
    console.error('[Activity API] Error fetching journal logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch journal logs' },
      { status: 500 }
    );
  }
}