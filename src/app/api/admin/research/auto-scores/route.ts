import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/database';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import { withApiLogging } from '@/lib/api-logger';

async function getHandler(request: NextRequest) {
  const admin = verifyAdminFromCookie(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get('user_id');
  const courseId = searchParams.get('course_id');
  const source = searchParams.get('source');
  const limit = Math.min(parseInt(searchParams.get('limit') || '50', 10) || 50, 200);
  const offset = parseInt(searchParams.get('offset') || '0', 10) || 0;

  try {
    let query = adminDb
      .from('auto_cognitive_scores')
      .select('*')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (userId) query = query.eq('user_id', userId);
    if (courseId) query = query.eq('course_id', courseId);
    if (source) query = query.eq('source', source);

    const { data, error } = await query;
    if (error) {
      console.error('[AutoScores] Query failed:', error);
      return NextResponse.json({ error: 'Gagal memuat data' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [], count: (data || []).length });
  } catch (err) {
    console.error('[AutoScores] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = withApiLogging(getHandler, { label: 'admin.auto-scores' });
