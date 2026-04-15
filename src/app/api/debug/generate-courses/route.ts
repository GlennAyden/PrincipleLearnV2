import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest) {
  // Debug route dual guard — env opt-in + admin role. See
  // /api/debug/users/route.ts for the rationale behind returning 404.
  const envAllowed =
    process.env.NODE_ENV !== 'production' || process.env.ENABLE_DEBUG_ROUTES === '1';
  const role = (req.headers.get('x-user-role') ?? '').toLowerCase();
  if (!envAllowed || role !== 'admin') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  console.log('[Debug API] Checking mock generate-course records');

  try {
    // Mock generate course records
    const mockRecords = [
      {
        id: 'course-1',
        courseName: 'Introduction to Programming',
        createdAt: new Date('2025-01-15').toISOString(),
        userId: 'user-123',
        userEmail: 'user@example.com'
      },
      {
        id: 'course-2',
        courseName: 'Web Development Basics',
        createdAt: new Date('2025-01-14').toISOString(),
        userId: 'admin-456',
        userEmail: 'admin@example.com'
      },
      {
        id: 'course-3',
        courseName: 'Database Fundamentals',
        createdAt: new Date('2025-01-13').toISOString(),
        userId: 'user-789',
        userEmail: 'test@example.com'
      }
    ];

    const totalCount = mockRecords.length;
    console.log(`[Debug API] Found ${totalCount} mock generate-course records`);

    // Return detailed information
    return NextResponse.json({
      totalCount,
      records: mockRecords
    });
  } catch (error) {
    console.error('[Debug API] Error retrieving generate-course records:', error);
    if (error instanceof Error) {
      console.error('[Debug API] Error details:', error.message);
      console.error('[Debug API] Error stack:', error.stack);
    }

    return NextResponse.json(
      { error: 'Failed to retrieve generate-course records' },
      { status: 500 }
    );
  }
} 