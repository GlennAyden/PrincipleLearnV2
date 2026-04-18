// src/app/api/admin/activity/transcript/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { DB_ERROR_CODES, DatabaseError, DatabaseService } from '@/lib/database'
import { withProtection } from '@/lib/api-middleware'

interface Transcript {
  id: string;
  user_id: string;
  course_id: string;
  subtopic_id?: string | null;
  content: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

function extractSubtopicFromNotes(notes?: string) {
  if (!notes) return null;
  const match = notes.match(/^Subtopic:\s*(.+)$/i);
  return match?.[1]?.trim() || null;
}

function buildDateRange(dateFromValue?: string | null, dateToValue?: string | null) {
  const fromValue = dateFromValue?.trim() || '';
  const toValue = dateToValue?.trim() || fromValue;
  if (!fromValue && !toValue) return null;

  const startSource = fromValue || toValue;
  const endSource = toValue || fromValue;
  const start = new Date(startSource);
  const end = new Date(endSource);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

interface User {
  id: string;
  email: string;
}

interface Subtopic {
  id: string;
  title: string;
  content: string;
}

function isMissingTableError(error: unknown, tableName: string): boolean {
  if (error instanceof DatabaseError && error.code === DB_ERROR_CODES.TABLE_NOT_FOUND) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error ?? '');
  return message.includes(`public.${tableName}`);
}

async function handler(req: NextRequest) {
  console.log('[Activity API] Starting transcript activity fetch');
  
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const date = searchParams.get('date')
    const dateFrom = searchParams.get('dateFrom') ?? date
    const dateTo = searchParams.get('dateTo')
    const course = searchParams.get('course')
    const topic = searchParams.get('topic')
  
    console.log('[Activity API] Request params:', { userId, date: dateFrom, dateTo, course, topic });

    // Get all transcripts from database
    let transcripts: Transcript[] = [];
    try {
      transcripts = await DatabaseService.getRecords<Transcript>('transcript', {
        orderBy: { column: 'created_at', ascending: false }
      });
    } catch (dbError) {
      if (!isMissingTableError(dbError, 'transcript')) {
        console.error('[Activity API] Database error fetching transcripts:', dbError);
        return NextResponse.json(
          { error: 'Failed to fetch transcript logs', detail: dbError instanceof Error ? dbError.message : String(dbError) },
          { status: 500 }
        );
      }

      try {
        transcripts = await DatabaseService.getRecords<Transcript>('transcripts', {
          orderBy: { column: 'created_at', ascending: false }
        });
      } catch (fallbackError) {
        console.error('[Activity API] Database error fetching transcripts fallback table:', fallbackError);
        return NextResponse.json(
          { error: 'Failed to fetch transcript logs', detail: fallbackError instanceof Error ? fallbackError.message : String(fallbackError) },
          { status: 500 }
        );
      }
    }

    console.log(`[Activity API] Found ${transcripts.length} total transcripts in database`);
    
    // Filter transcripts based on parameters
    let filteredTranscripts = transcripts;
    
    // Filter by user if specified
    if (userId) {
      filteredTranscripts = filteredTranscripts.filter(transcript => transcript.user_id === userId);
      console.log(`[Activity API] Filtered by user ${userId}: ${filteredTranscripts.length} transcripts`);
    }
    
    // Filter by date if specified
    const dateRange = buildDateRange(dateFrom, dateTo);
    if (dateRange) {
      filteredTranscripts = filteredTranscripts.filter(transcript => {
        const transcriptDate = new Date(transcript.created_at);
        return transcriptDate >= dateRange.start && transcriptDate <= dateRange.end;
      });
      console.log(`[Activity API] Filtered by date range ${dateFrom ?? '-'} - ${dateTo ?? dateFrom ?? '-'}: ${filteredTranscripts.length} transcripts`);
    }
    
    // Filter by course if specified
    if (course) {
      filteredTranscripts = filteredTranscripts.filter(transcript => transcript.course_id === course);
      console.log(`[Activity API] Filtered by course ${course}: ${filteredTranscripts.length} transcripts`);
    }

    // Get additional information for each transcript
    const payload = [];
    for (const transcript of filteredTranscripts) {
      try {
        // Get user info
        const users: User[] = await DatabaseService.getRecords<User>('users', {
          filter: { id: transcript.user_id },
          limit: 1
        });
        
        // Get subtopic info
        const subtopics: Subtopic[] = transcript.subtopic_id
          ? await DatabaseService.getRecords<Subtopic>('subtopics', {
            filter: { id: transcript.subtopic_id },
            limit: 1
          })
          : [];
        
        const user = users.length > 0 ? users[0] : null;
        const subtopic = subtopics.length > 0 ? subtopics[0] : null;
        
        // Parse subtopic content to get topic name
        let topicName = 'Unknown Topic';
        if (subtopic) {
          try {
            const subtopicContent = JSON.parse(subtopic.content);
            topicName = subtopicContent.module || subtopic.title || 'Unknown Topic';
          } catch {
            topicName = subtopic.title || 'Unknown Topic';
          }
        } else {
          topicName = extractSubtopicFromNotes(transcript.notes) || 'Unknown Topic';
        }
        
        // Filter by topic if specified (after we have the parsed topic name)
        if (topic && !topicName.toLowerCase().includes(topic.toLowerCase())) {
          continue; // Skip this transcript if topic doesn't match
        }
        
        // Create activity log item
        const logItem = {
          id: transcript.id,
          timestamp: new Date(transcript.created_at).toLocaleDateString('id-ID'),
          topic: topicName,
          content: transcript.content || 'No content available',
          userEmail: user?.email || 'Unknown User',
          userId: transcript.user_id
        };
        
        payload.push(logItem);
        
      } catch (infoError) {
        console.error(`[Activity API] Error getting info for transcript ${transcript.id}:`, infoError);
        
        // Add transcript with minimal info
        const logItem = {
          id: transcript.id,
          timestamp: new Date(transcript.created_at).toLocaleDateString('id-ID'),
          topic: 'Unknown Topic',
          content: transcript.content || 'No content available',
          userEmail: 'Unknown User',
          userId: transcript.user_id
        };
        
        payload.push(logItem);
      }
    }
    
    console.log(`[Activity API] Returning ${payload.length} formatted transcript records`);
    return NextResponse.json(payload);
    
  } catch (error) {
    console.error('[Activity API] Error fetching transcript logs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch transcript logs' },
      { status: 500 }
    );
  }
}

export const GET = withProtection(handler, { adminOnly: true, requireAuth: true, csrfProtection: false });
