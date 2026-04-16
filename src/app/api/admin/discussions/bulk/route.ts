import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { withApiLogging } from '@/lib/api-logger';

async function postHandler(request: NextRequest) {
  try {
    const token = request.cookies.get('access_token')?.value;
    const payload = token ? verifyToken(token) : null;
    if (!payload || (payload.role ?? '').toLowerCase() !== 'admin') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { sessionIds, action } = body as { sessionIds: string[]; action: string };

    if (!Array.isArray(sessionIds) || sessionIds.length === 0 || !action) {
      return NextResponse.json({ error: 'sessionIds and action required' }, { status: 400 });
    }

    const results = { success: 0, failed: 0, errors: [] as string[] };

    if (action !== 'export_csv') {
      return NextResponse.json(
        { error: 'Admin discussion bulk actions are read-only. Only export_csv is supported.' },
        { status: 405 }
      );
    }

    for (const sessionId of sessionIds) {
      try {
        // Placeholder for CSV generation (can integrate PapaParse or stream)
        results.success++;
        console.log(`CSV export queued for ${sessionId}`);
      } catch (err: unknown) {
        results.failed++;
        results.errors.push(`Session ${sessionId}: ${err instanceof Error ? err.message : 'Unknown error'}`);
      }
    }

    return NextResponse.json({ results });
  } catch (error: unknown) {
    console.error('[AdminDiscussionsBulk] Error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = withApiLogging(postHandler, {
  label: 'admin.discussions.bulk',
});

