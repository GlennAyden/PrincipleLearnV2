import { NextRequest, NextResponse } from 'next/server';
import { adminDb, DatabaseService } from '@/lib/database';
import { withProtection } from '@/lib/api-middleware';
import { getAdminModeFromRequest, applyAdminModeFilter } from '@/lib/admin-mode';

interface CourseRow {
  id: string;
  title: string | null;
  created_at: string;
  mode?: string | null;
}

async function handler(req: NextRequest) {
  try {
    const adminMode = getAdminModeFromRequest(req);

    let courses: CourseRow[];
    if (adminMode === 'research') {
      // Filter to research-mode courses only using adminDb for direct mode column access
      const { data, error } = await applyAdminModeFilter(
        adminDb.from('courses').select('id,title,created_at').order('created_at', { ascending: false }),
        adminMode,
      );
      if (error) {
        console.error('[Admin Activity][Filters] Failed to load course options:', error);
        return NextResponse.json({ courses: [] }, { status: 500 });
      }
      courses = (Array.isArray(data) ? data : []) as CourseRow[];
    } else {
      courses = await DatabaseService.getRecords<CourseRow>('courses', {
        select: 'id,title,created_at',
        orderBy: { column: 'created_at', ascending: false },
      });
    }

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

