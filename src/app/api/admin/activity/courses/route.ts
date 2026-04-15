import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';
import { withProtection } from '@/lib/api-middleware';

interface CourseRow {
  id: string;
  title: string | null;
  created_at: string;
}

async function handler(_req: NextRequest) {
  try {
    const courses = await DatabaseService.getRecords<CourseRow>('courses', {
      select: 'id,title,created_at',
      orderBy: { column: 'created_at', ascending: false },
    });

    const formatted = courses.map((course) => ({
      id: course.id,
      title: course.title || 'Untitled Course',
    }));

    return NextResponse.json({ courses: formatted });
  } catch (error) {
    console.error('[Admin Activity][Filters] Failed to load course options:', error);
    return NextResponse.json({ courses: [] }, { status: 500 });
  }
}

export const GET = withProtection(handler, { adminOnly: true, requireAuth: true, csrfProtection: false });
