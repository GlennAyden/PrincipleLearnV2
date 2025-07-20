// src/app/api/admin/activity/generate-course/route.ts

import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import prisma from '@/lib/prisma'

export async function GET(req: NextRequest) {
  console.log('[Activity API] Starting generate-course activity fetch');
  
  try {
    const { searchParams } = new URL(req.url)
    const userId = searchParams.get('userId')
    const date   = searchParams.get('date')     // filter "Tanggal"
    const course = searchParams.get('course')   // filter "Course"
    
    console.log('[Activity API] Request params:', { userId, date, course });

    // Build dynamic filters
    const where: any = {}
    if (userId)  where.userId     = userId
    if (course)  where.courseName = course
    if (date) {
      const start = new Date(date)
      const end   = new Date(date)
      end.setDate(start.getDate() + 1)
      where.createdAt = { gte: start, lt: end }
    }
    
    console.log('[Activity API] Query filters:', where);

    // First check if any generate-course logs exist at all
    const totalCount = await prisma.generateCourse.count();
    console.log(`[Activity API] Total generate-course records in database: ${totalCount}`);

    // Fetch generate-course logs with user information
    console.log('[Activity API] Fetching generate-course logs with filters');
    const items = await prisma.generateCourse.findMany({
      where,
      select: {
        id:         true,
        courseName: true,
        parameter:  true,
        createdAt:  true,
        userId:     true,
        user: {
          select: {
            email: true
          }
        }
      },
      orderBy: { createdAt: 'desc' },
    })
    
    console.log(`[Activity API] Found ${items.length} generate-course logs`);
    
    if (items.length > 0) {
      console.log('[Activity API] Sample record:', {
        id: items[0].id,
        courseName: items[0].courseName,
        createdAt: items[0].createdAt,
        userId: items[0].userId,
        userEmail: items[0].user?.email || 'unknown'
      });
    }

    // Shape response to match GenerateLogItem in AdminActivityPage
    const payload = items.map((i) => ({
      id:         i.id,
      // format as DD/MM/YYYY for UI consistency
      timestamp:  i.createdAt.toLocaleDateString('id-ID'),
      courseName: i.courseName,
      parameter:  i.parameter,
      userEmail:  i.user?.email || 'unknown',
      userId:     i.userId
    }))
    
    console.log(`[Activity API] Returning ${payload.length} formatted records`);
    return NextResponse.json(payload)
  } catch (error) {
    console.error('[Activity API] Error fetching generate-course logs:', error);
    if (error instanceof Error) {
      console.error('[Activity API] Error details:', error.message);
      console.error('[Activity API] Error stack:', error.stack);
    }
    return NextResponse.json(
      { error: 'Failed to fetch generate-course logs' },
      { status: 500 }
    );
  }
}
