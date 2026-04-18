/**
 * API Route: Research Data Readiness
 * GET /api/admin/research/readiness
 *
 * Summarizes thesis field readiness for RM2/RM3:
 * per-student readiness, one-month collection coverage, evidence pipeline
 * health, and thesis output checklist.
 */

import { NextRequest, NextResponse } from 'next/server';
import { verifyAdminFromCookie } from '@/lib/admin-auth';
import { buildResearchReadinessSnapshot } from '@/services/research-field-readiness.service';

export async function GET(request: NextRequest) {
  try {
    const admin = verifyAdminFromCookie(request);
    if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const snapshot = await buildResearchReadinessSnapshot({
      userId: searchParams.get('user_id'),
      courseId: searchParams.get('course_id'),
      startDate: searchParams.get('start_date') ?? searchParams.get('startDate'),
      endDate: searchParams.get('end_date') ?? searchParams.get('endDate'),
    });

    return NextResponse.json({
      success: true,
      ...snapshot,
    });
  } catch (error) {
    console.error('Error in GET /api/admin/research/readiness:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
