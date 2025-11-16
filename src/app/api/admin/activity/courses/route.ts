import { NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

interface CourseRow {
  id: string;
  title: string | null;
  created_at: string;
}

export async function GET() {
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
