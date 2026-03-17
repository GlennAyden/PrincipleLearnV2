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
  created_at: string;
  totalGenerate: number;
  totalTranscripts: number;
  totalQuizzes: number;
  totalJournals: number;
  totalSoalOtomatis: number;
  lastActivity: string;
}

function parseValidDate(value: unknown): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value !== 'string') return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function toIsoDateOnly(value: unknown): string {
  const parsed = parseValidDate(value) ?? new Date();
  return parsed.toISOString().split('T')[0];
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
          ...courses.map((c: any) => parseValidDate(c.created_at)),
          ...quizSubmissions.map((q: any) => parseValidDate(q.submitted_at ?? q.created_at)),
          ...journals.map((j: any) => parseValidDate(j.created_at))
        ].filter((d): d is Date => d !== null);

        const lastActivityDate = activities.length > 0
          ? new Date(Math.max(...activities.map((d) => d.getTime())))
          : parseValidDate(user.created_at) ?? new Date();
        
        const userWithActivity: UserWithActivity = {
          id: user.id,
          email: user.email,
          name: user.name || 'Unknown',
          role: user.role.toUpperCase(),
          created_at: user.created_at,
          updated_at: user.updated_at,
          totalGenerate: courses.length,
          totalTranscripts: 0,
          totalQuizzes: quizSubmissions.length,
          totalJournals: journals.length,
          totalSoalOtomatis: quizSubmissions.length, // Same as quizzes for now
          lastActivity: toIsoDateOnly(lastActivityDate)
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
          created_at: user.created_at,
          updated_at: user.updated_at,
          totalGenerate: 0,
          totalTranscripts: 0,
          totalQuizzes: 0,
          totalJournals: 0,
          totalSoalOtomatis: 0,
          lastActivity: toIsoDateOnly(user.created_at)
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