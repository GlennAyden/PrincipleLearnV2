// principle-learn/src/app/api/admin/users/route.ts

import { NextResponse } from 'next/server'
import { DatabaseService } from '@/lib/database'

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
  created_at: string;
  updated_at: string;
}

interface UserWithActivity extends User {
  totalGenerate: number;
  totalTranscripts: number;
  totalQuizzes: number;
  totalJournals: number;
  totalSoalOtomatis: number;
  lastActivity: string;
}

export async function GET() {
  try {
    console.log('[Admin Users] Fetching users from database...');
    
    // Get all users from database
    const users: User[] = await DatabaseService.getRecords('users', {
      orderBy: { column: 'created_at', ascending: false }
    });
    
    console.log(`[Admin Users] Found ${users.length} users in database`);
    
    // For each user, get their activity statistics
    const usersWithActivity: UserWithActivity[] = [];
    
    for (const user of users) {
      try {
        // Get user's courses (generated courses)
        const courses = await DatabaseService.getRecords('courses', {
          filter: { created_by: user.id }
        });
        
        // Get user's transcripts
        const transcripts = await DatabaseService.getRecords('transcript', {
          filter: { user_id: user.id }
        });
        
        // Get user's quiz submissions
        const quizSubmissions = await DatabaseService.getRecords('quiz_submissions', {
          filter: { user_id: user.id }
        });
        
        // Get user's journal entries
        const journals = await DatabaseService.getRecords('jurnal', {
          filter: { user_id: user.id }
        });
        
        // Calculate last activity
        const activities = [
          ...courses.map(c => new Date(c.created_at)),
          ...transcripts.map(t => new Date(t.created_at)),
          ...quizSubmissions.map(q => new Date(q.submitted_at)),
          ...journals.map(j => new Date(j.created_at))
        ];
        
        const lastActivityDate = activities.length > 0 
          ? new Date(Math.max(...activities.map(d => d.getTime())))
          : new Date(user.created_at);
        
        const userWithActivity: UserWithActivity = {
          id: user.id,
          email: user.email,
          name: user.name || 'Unknown',
          role: user.role.toUpperCase(),
          createdAt: user.created_at,
          totalGenerate: courses.length,
          totalTranscripts: transcripts.length,
          totalQuizzes: quizSubmissions.length,
          totalJournals: journals.length,
          totalSoalOtomatis: quizSubmissions.length, // Same as quizzes for now
          lastActivity: lastActivityDate.toISOString().split('T')[0]
        };
        
        usersWithActivity.push(userWithActivity);
        
      } catch (activityError) {
        console.error(`[Admin Users] Error getting activity for user ${user.id}:`, activityError);
        
        // Add user with zero activity if there's an error
        const userWithActivity: UserWithActivity = {
          id: user.id,
          email: user.email,
          name: user.name || 'Unknown',
          role: user.role.toUpperCase(),
          createdAt: user.created_at,
          totalGenerate: 0,
          totalTranscripts: 0,
          totalQuizzes: 0,
          totalJournals: 0,
          totalSoalOtomatis: 0,
          lastActivity: new Date(user.created_at).toISOString().split('T')[0]
        };
        
        usersWithActivity.push(userWithActivity);
      }
    }
    
    console.log(`[Admin Users] Processed activity data for ${usersWithActivity.length} users`);
    
    return NextResponse.json(usersWithActivity);
    
  } catch (err: any) {
    console.error('Error in /api/admin/users:', err);
    
    // Return fallback mock data if database fails
    const fallbackUsers = [
      {
        id: 'fallback-1',
        email: 'demo@example.com',
        name: 'Demo User',
        role: 'USER',
        createdAt: new Date().toISOString(),
        totalGenerate: 0,
        totalTranscripts: 0,
        totalQuizzes: 0,
        totalJournals: 0,
        totalSoalOtomatis: 0,
        lastActivity: new Date().toISOString().split('T')[0]
      }
    ];
    
    return NextResponse.json(fallbackUsers);
  }
}