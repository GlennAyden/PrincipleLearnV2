import { NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

export async function GET() {
  try {
    // Get summary of all data
    const [users, courses, subtopics, quiz, jurnal, transcript] = await Promise.all([
      DatabaseService.getRecords('users', { select: 'id, name, email, role, created_at' }),
      DatabaseService.getRecords('courses', { select: 'id, title, subject, difficulty_level, estimated_duration, created_at' }),
      DatabaseService.getRecords('subtopics', { select: 'id, title, order_index, created_at' }),
      DatabaseService.getRecords('quiz', { select: 'id, question, correct_answer, created_at' }),
      DatabaseService.getRecords('jurnal', { select: 'id, content, created_at' }),
      DatabaseService.getRecords('transcript', { select: 'id, content, created_at' })
    ]);

    return NextResponse.json({
      success: true,
      message: 'Database test data retrieved successfully',
      data: {
        users: {
          count: users.length,
          items: users
        },
        courses: {
          count: courses.length,
          items: courses
        },
        subtopics: {
          count: subtopics.length,
          items: subtopics
        },
        quiz: {
          count: quiz.length,
          items: quiz
        },
        jurnal: {
          count: jurnal.length,
          items: jurnal
        },
        transcript: {
          count: transcript.length,
          items: transcript
        }
      },
      summary: {
        total_users: users.length,
        total_courses: courses.length,
        total_subtopics: subtopics.length,
        total_quiz_questions: quiz.length,
        total_journal_entries: jurnal.length,
        total_transcript_entries: transcript.length
      }
    });
    
  } catch (error) {
    console.error('Database test data error:', error);
    return NextResponse.json({ 
      success: false, 
      message: 'Failed to retrieve test data',
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 });
  }
}