import { NextRequest, NextResponse } from 'next/server';
import { DatabaseService } from '@/lib/database';

interface SubtopicRow {
  id: string;
  course_id: string;
  title: string | null;
  order_index: number | null;
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const courseId = searchParams.get('courseId');

  if (!courseId) {
    return NextResponse.json({ topics: [] });
  }

  try {
    const subtopics = await DatabaseService.getRecords<SubtopicRow>('subtopics', {
      select: 'id,course_id,title,order_index',
      filter: { course_id: courseId },
      orderBy: { column: 'order_index', ascending: true },
    });

    const topics = subtopics.map((subtopic, index) => ({
      id: subtopic.id,
      title: subtopic.title || `Subtopik ${index + 1}`,
    }));

    return NextResponse.json({ topics });
  } catch (error) {
    console.error('[Admin Activity][Filters] Failed to load topics:', error);
    return NextResponse.json({ topics: [] }, { status: 500 });
  }
}
