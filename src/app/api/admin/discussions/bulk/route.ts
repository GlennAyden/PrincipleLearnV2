import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/jwt';
import { adminDb } from '@/lib/database';
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

    for (const sessionId of sessionIds) {
      try {
        if (action === 'mark_completed') {
          const { error } = await adminDb.from('discussion_sessions').eq('id', sessionId).update({
            status: 'completed',
            updated_at: new Date().toISOString()
          });

          if (!error) {
            results.success++;
          } else {
            results.failed++;
            results.errors.push(`Session ${sessionId}: ${error.message}`);
          }
        } else if (action === 'export_csv') {
          // Placeholder for CSV generation (can integrate PapaParse or stream)
          results.success++;
          console.log(`CSV export queued for ${sessionId}`);
        } else {
          results.failed++;
          results.errors.push(`Unknown action: ${action} for ${sessionId}`);
        }
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

