import { NextRequest, NextResponse } from 'next/server';
import type { ActivityActionRequest } from '@/types/activity';
import { withProtection } from '@/lib/api-middleware';

async function handler(req: NextRequest) {
  try {
    const body: ActivityActionRequest = await req.json();

    console.warn(`[Admin Action] Unsupported action ${body.action} on ${body.activityId}: ${body.reason || 'No reason'}`);

    return NextResponse.json(
      {
        success: false,
        error: 'Admin activity actions are not enabled yet. Monitoring is read-only.',
      },
      { status: 501 },
    );
  } catch {
    return NextResponse.json({ error: 'Action failed' }, { status: 500 });
  }
}

export const POST = withProtection(handler, { adminOnly: true, requireAuth: true, csrfProtection: true });

